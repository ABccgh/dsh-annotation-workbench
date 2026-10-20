/**
 * Export pipeline for the annotation workbench.
 *
 * Formats: JSONL, CSV, COCO (image bbox), report (Markdown), and subtitle
 * SRT/VTT. Every export is written below `<projectDir>/exports/<stamp>/` and
 * returns absolute paths plus download-friendly relative `urlPath`s.
 *
 * Scope: `approved | submitted | all`. `approved` uses the latest approved
 * review's `finalLabels`, falling back to the latest submitted annotation for
 * items that were not approved. `submitted` uses the latest submitted
 * annotation. `all` includes every item and falls back to the best available
 * annotation.
 *
 * Only `node:*` modules and `./util.js` are imported.
 *
 * @module @local/annotation-workbench/lib/export
 */

import { stat, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import {
  ensureDir,
  fileStamp,
  formatSrt,
  formatVtt,
  guessMime,
  nowIso,
  relativeInside,
  resolveInside,
  safeFilename,
  shortHash,
} from './util.js';

const SCOPES = new Set(['approved', 'submitted', 'all']);
const FORMAT_ALIASES = {
  json: 'jsonl',
  ndjson: 'jsonl',
  jsonlines: 'jsonl',
  md: 'report',
  markdown: 'report',
  coco_json: 'coco',
  subtitles: 'srt',
};
const EXPORT_FORMATS = new Set(['jsonl', 'csv', 'srt', 'vtt', 'coco', 'report']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeScope(scope) {
  const text = String(scope ?? '').trim().toLowerCase();
  return SCOPES.has(text) ? text : 'approved';
}

function normalizeExportFormat(format) {
  const raw = String(format ?? '').trim().toLowerCase();
  const mapped = FORMAT_ALIASES[raw] ?? raw;
  return EXPORT_FORMATS.has(mapped) ? mapped : null;
}

function schemaFields(project) {
  const schema = project?.schema;
  if (Array.isArray(schema)) return schema;
  if (isPlainObject(schema) && Array.isArray(schema.fields)) return schema.fields.filter((field) => isPlainObject(field));
  return [];
}

function fieldId(field, index) {
  return typeof field?.id === 'string' && field.id !== '' ? field.id : `field_${index}`;
}

function timestampValue(entry) {
  const ts = entry?.ts;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Latest entry by `ts`, tie-broken by actorId for a stable order. */
function latestBy(list, predicate = () => true) {
  let winner = null;
  for (const entry of asArray(list)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!predicate(entry)) continue;
    if (winner === null) {
      winner = entry;
      continue;
    }
    const diff = timestampValue(entry) - timestampValue(winner);
    if (diff > 0) winner = entry;
    else if (diff === 0 && String(entry.actorId ?? '') > String(winner.actorId ?? '')) winner = entry;
  }
  return winner;
}

function parseLabelsValue(value) {
  if (isPlainObject(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (isPlainObject(parsed)) return parsed;
    } catch {
      // Keep an empty labels object.
    }
  }
  return {};
}

/**
 * Normalize annotations into `Map<itemId, Array<{actorId, labels, status, ts}>>`.
 * Accepts a Map, an object keyed by itemId, or a flat event array.
 */
function normalizeAnnotations(annotations) {
  const map = new Map();
  const push = (itemId, entry) => {
    if (typeof itemId !== 'string' || itemId === '' || !isPlainObject(entry)) return;
    const actorId = typeof entry.actorId === 'string' && entry.actorId !== '' ? entry.actorId : String(entry.actor ?? '');
    const status = typeof entry.status === 'string' ? entry.status : 'submitted';
    const normalized = {
      itemId,
      actorId,
      actorName: typeof entry.actorName === 'string' ? entry.actorName : '',
      labels: parseLabelsValue(entry.labels),
      status,
      ts: typeof entry.ts === 'string' ? entry.ts : (typeof entry.ts === 'number' ? new Date(entry.ts).toISOString() : ''),
    };
    const list = map.get(itemId) ?? [];
    list.push(normalized);
    map.set(itemId, list);
  };

  if (annotations instanceof Map) {
    for (const [itemId, value] of annotations.entries()) {
      for (const entry of asArray(value)) push(itemId, entry);
    }
  } else if (Array.isArray(annotations)) {
    for (const entry of annotations) {
      if (isPlainObject(entry) && typeof entry.itemId === 'string') push(entry.itemId, entry);
    }
  } else if (isPlainObject(annotations)) {
    for (const [itemId, value] of Object.entries(annotations)) {
      if (Array.isArray(value)) for (const entry of value) push(itemId, entry);
      else push(itemId, value);
    }
  }
  for (const list of map.values()) list.sort((left, right) => timestampValue(left) - timestampValue(right));
  return map;
}

/** Normalize reviews into `Map<itemId, Array<review event>>`. */
function normalizeReviews(reviews) {
  const map = new Map();
  const push = (itemId, entry) => {
    if (typeof itemId !== 'string' || itemId === '' || !isPlainObject(entry)) return;
    const decision = String(entry.decision ?? '').toLowerCase();
    if (decision !== 'approve' && decision !== 'reject') return;
    const list = map.get(itemId) ?? [];
    list.push({
      itemId,
      actorId: typeof entry.actorId === 'string' ? entry.actorId : '',
      actorName: typeof entry.actorName === 'string' ? entry.actorName : '',
      decision,
      finalLabels: parseLabelsValue(entry.finalLabels),
      comment: typeof entry.comment === 'string' ? entry.comment : '',
      ts: typeof entry.ts === 'string' ? entry.ts : (typeof entry.ts === 'number' ? new Date(entry.ts).toISOString() : ''),
    });
    map.set(itemId, list);
  };

  if (reviews instanceof Map) {
    for (const [itemId, value] of reviews.entries()) {
      for (const entry of asArray(value)) push(itemId, entry);
    }
  } else if (Array.isArray(reviews)) {
    for (const entry of reviews) {
      if (isPlainObject(entry) && typeof entry.itemId === 'string') push(entry.itemId, entry);
    }
  } else if (isPlainObject(reviews)) {
    for (const [itemId, value] of Object.entries(reviews)) {
      if (Array.isArray(value)) for (const entry of value) push(itemId, entry);
      else push(itemId, value);
    }
  }
  for (const list of map.values()) list.sort((left, right) => timestampValue(left) - timestampValue(right));
  return map;
}

function labelsHaveContent(labels) {
  return isPlainObject(labels) && Object.keys(labels).length > 0;
}

function deriveItemStatus(annotations, latestReview) {
  if (latestReview?.decision === 'approve') return 'approved';
  if (latestReview?.decision === 'reject') return 'rejected';
  const list = asArray(annotations);
  if (list.some((entry) => entry.status === 'submitted')) return 'submitted';
  if (list.some((entry) => entry.status === 'flagged')) return 'flagged';
  if (list.some((entry) => entry.status === 'draft')) return 'in_progress';
  return 'unlabeled';
}

/**
 * Pick the exported rows for a project according to the scope rules.
 * @returns {Array<{item: object, itemId: string, labels: object, status: string, source: string, actorId: string|null, actorName: string|null, ts: string|null}>}
 */
function selectRows({ items, annotations, reviews, scope = 'approved' } = {}) {
  const annMap = normalizeAnnotations(annotations);
  const revMap = normalizeReviews(reviews);
  const normalizedScope = normalizeScope(scope);
  const rows = [];
  for (const item of asArray(items)) {
    if (!isPlainObject(item)) continue;
    const itemId = typeof item.id === 'string' && item.id !== '' ? item.id : (typeof item.id === 'number' ? String(item.id) : '');
    if (itemId === '') continue;
    const anns = annMap.get(itemId) ?? [];
    const revs = revMap.get(itemId) ?? [];
    const latestReview = latestBy(revs);
    const status = deriveItemStatus(anns, latestReview);
    const submitted = latestBy(anns, (entry) => entry.status === 'submitted');
    const latestAnnotation = latestBy(anns);
    const approvedReview = latestReview?.decision === 'approve' ? latestReview : null;
    const approvedLabels = approvedReview && labelsHaveContent(approvedReview.finalLabels) ? approvedReview.finalLabels : null;

    const makeRow = (labels, source, event) => ({
      item,
      itemId,
      labels: labels ?? {},
      status,
      source,
      actorId: event?.actorId ?? null,
      actorName: event?.actorName ?? null,
      ts: event?.ts ?? null,
    });

    if (normalizedScope === 'submitted') {
      if (!submitted) continue;
      rows.push(makeRow(submitted.labels, 'annotation', submitted));
      continue;
    }
    if (normalizedScope === 'approved') {
      if (approvedReview) {
        rows.push(makeRow(approvedLabels ?? submitted?.labels ?? {}, approvedLabels ? 'review' : (submitted ? 'annotation' : 'none'), approvedLabels ? approvedReview : submitted));
        continue;
      }
      if (submitted) rows.push(makeRow(submitted.labels, 'annotation', submitted));
      continue;
    }
    // scope === 'all'
    if (approvedReview) {
      rows.push(makeRow(approvedLabels ?? submitted?.labels ?? {}, approvedLabels ? 'review' : (submitted ? 'annotation' : 'none'), approvedLabels ? approvedReview : submitted));
    } else if (submitted) {
      rows.push(makeRow(submitted.labels, 'annotation', submitted));
    } else if (latestAnnotation) {
      rows.push(makeRow(latestAnnotation.labels, 'annotation', latestAnnotation));
    } else {
      rows.push(makeRow({}, 'none', null));
    }
  }
  return rows;
}

/** Find a label field id of the requested type, honoring schema order. */
function findFieldIdsByType(project, labels, type) {
  const fields = schemaFields(project);
  const ids = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.type === type) ids.push(fieldId(field, index));
  }
  if (ids.length > 0) return ids;
  if (isPlainObject(labels)) {
    for (const [key, value] of Object.entries(labels)) {
      if (!Array.isArray(value)) continue;
      const sample = value.find((entry) => isPlainObject(entry));
      if (!sample) continue;
      if (type === 'segments' && Number.isFinite(Number(sample.start)) && Number.isFinite(Number(sample.end))) ids.push(key);
      else if (type === 'bbox' && ['x', 'y', 'w', 'h'].every((axis) => Number.isFinite(Number(sample[axis])))) ids.push(key);
      else if (type === 'spans' && !Number.isFinite(Number(sample.w)) && Number.isFinite(Number(sample.start)) && Number.isFinite(Number(sample.end)) && typeof sample.label === 'string') ids.push(key);
    }
  }
  return ids;
}

function isSegmentLike(value) {
  return isPlainObject(value) && Number.isFinite(Number(value.start)) && Number.isFinite(Number(value.end));
}

function isBboxLike(value) {
  return isPlainObject(value) && ['x', 'y', 'w', 'h'].every((axis) => Number.isFinite(Number(value[axis])));
}

/** Extract subtitle segments from a labels object. */
function segmentsFromLabels(project, labels) {
  if (!isPlainObject(labels)) return [];
  const candidates = findFieldIdsByType(project, labels, 'segments');
  const keys = candidates.length > 0 ? candidates : Object.keys(labels);
  for (const key of keys) {
    const value = labels[key];
    if (!Array.isArray(value)) continue;
    const segments = value
      .filter(isSegmentLike)
      .map((segment) => ({
        start: Number(segment.start),
        end: Number(segment.end),
        text: typeof segment.text === 'string' ? segment.text : String(segment.text ?? ''),
        ...(typeof segment.label === 'string' && segment.label !== '' ? { label: segment.label } : {}),
      }));
    if (segments.length > 0) return segments;
  }
  return [];
}

/** Extract normalized bbox entries from a labels object. */
function bboxesFromLabels(project, labels) {
  if (!isPlainObject(labels)) return [];
  const candidates = findFieldIdsByType(project, labels, 'bbox');
  const keys = candidates.length > 0 ? candidates : Object.keys(labels);
  const out = [];
  for (const key of keys) {
    const value = labels[key];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!isBboxLike(entry)) continue;
      out.push({
        field: key,
        x: Number(entry.x),
        y: Number(entry.y),
        w: Number(entry.w),
        h: Number(entry.h),
        label: typeof entry.label === 'string' ? entry.label : '',
        text: typeof entry.text === 'string' ? entry.text : '',
      });
    }
  }
  return out;
}

function csvCell(value) {
  if (value === undefined || value === null) return '';
  let text;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function labelValueForCsv(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Serialize selected rows as JSONL.
 * @param {{project?: object, items?: object[], annotations?: any, reviews?: any, scope?: string}} options
 * @returns {string}
 */
export function exportJsonl({ project = {}, items = [], annotations = {}, reviews = [], scope = 'approved' } = {}) {
  const rows = selectRows({ items, annotations, reviews, scope });
  const lines = rows.map((row) => {
    const record = {
      itemId: row.itemId,
      kind: row.item.kind ?? 'text',
      status: row.status,
      actorId: row.actorId,
      actorName: row.actorName,
      ts: row.ts,
      batch: row.item.batch ?? null,
      tags: asArray(row.item.tags),
      media: asArray(row.item.media).map((entry) => (isPlainObject(entry) ? entry.path : entry)).filter((entry) => typeof entry === 'string'),
      payload: isPlainObject(row.item.payload) ? row.item.payload : {},
      labels: row.labels,
    };
    return JSON.stringify(record);
  });
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

/**
 * Serialize selected rows as CSV (one row per item, one column per label field).
 * @param {{project?: object, items?: object[], annotations?: any, reviews?: any, scope?: string}} options
 * @returns {string}
 */
export function exportCsv({ project = {}, items = [], annotations = {}, reviews = [], scope = 'approved' } = {}) {
  const rows = selectRows({ items, annotations, reviews, scope });
  const fields = schemaFields(project);
  const fixed = ['itemId', 'kind', 'status', 'actorId', 'actorName', 'ts', 'batch', 'tags', 'media', 'payload'];
  const fixedSet = new Set(fixed);
  const labelColumns = [];
  const labelColumnSet = new Set();
  const addLabelColumn = (name) => {
    let column = name;
    if (fixedSet.has(column) || labelColumnSet.has(column)) column = `field_${name}`;
    if (labelColumnSet.has(column)) return null;
    labelColumns.push({ name, column });
    labelColumnSet.add(column);
    return column;
  };
  for (let index = 0; index < fields.length; index += 1) addLabelColumn(fieldId(fields[index], index));
  for (const row of rows) {
    for (const key of Object.keys(row.labels)) {
      if (labelColumns.some((entry) => entry.name === key)) continue;
      addLabelColumn(key);
    }
  }

  const header = [...fixed, ...labelColumns.map((entry) => entry.column)];
  const output = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const values = [
      row.itemId,
      row.item.kind ?? '',
      row.status,
      row.actorId ?? '',
      row.actorName ?? '',
      row.ts ?? '',
      row.item.batch ?? '',
      asArray(row.item.tags),
      asArray(row.item.media).map((entry) => (isPlainObject(entry) ? entry.path : entry)),
      isPlainObject(row.item.payload) ? row.item.payload : {},
    ];
    for (const column of labelColumns) {
      values.push(labelValueForCsv(row.labels[column.name]));
    }
    output.push(values.map(csvCell).join(','));
  }
  return `${output.join('\n')}\n`;
}

/**
 * Serialize selected rows as a COCO detection dataset. Bboxes are stored
 * normalized in the project; COCO expects pixel coordinates, so item
 * `meta.width` / `meta.height` are used (falling back to 1 for unknown sizes).
 * @param {{project?: object, items?: object[], annotations?: any, reviews?: any, scope?: string}} options
 * @returns {string}
 */
export function exportCoco({ project = {}, items = [], annotations = {}, reviews = [], scope = 'approved' } = {}) {
  const rows = selectRows({ items, annotations, reviews, scope });
  const fields = schemaFields(project);
  const bboxFieldIds = [];
  for (let index = 0; index < fields.length; index += 1) {
    if (fields[index].type === 'bbox') bboxFieldIds.push(fieldId(fields[index], index));
  }
  const categories = [];
  const categoryIds = new Map();
  const ensureCategory = (name) => {
    const key = typeof name === 'string' && name.trim() !== '' ? name.trim() : 'object';
    if (categoryIds.has(key)) return categoryIds.get(key);
    const id = categories.length + 1;
    categoryIds.set(key, id);
    categories.push({ id, name: key, supercategory: 'annotation' });
    return id;
  };
  for (const field of fields) {
    if (field.type !== 'bbox') continue;
    for (const option of asArray(field.options)) {
      if (isPlainObject(option) && option.value !== undefined && option.value !== '') ensureCategory(String(option.value));
    }
  }

  const images = [];
  const cocoAnnotations = [];
  let annotationId = 0;
  for (const row of rows) {
    const boxes = bboxesFromLabels(project, row.labels);
    if (boxes.length === 0) continue;
    const meta = isPlainObject(row.item.meta) ? row.item.meta : {};
    const width = Number.isFinite(Number(meta.width)) && Number(meta.width) > 0 ? Number(meta.width) : 1;
    const height = Number.isFinite(Number(meta.height)) && Number(meta.height) > 0 ? Number(meta.height) : 1;
    const media = asArray(row.item.media);
    const firstMedia = isPlainObject(media[0]) ? media[0].path : media[0];
    const imageId = images.length + 1;
    images.push({
      id: imageId,
      file_name: typeof firstMedia === 'string' && firstMedia !== '' ? firstMedia : `media/${row.itemId}`,
      width,
      height,
      license: 0,
    });
    for (const box of boxes) {
      annotationId += 1;
      const pixelWidth = Math.max(0, box.w * width);
      const pixelHeight = Math.max(0, box.h * height);
      cocoAnnotations.push({
        id: annotationId,
        image_id: imageId,
        category_id: ensureCategory(box.label),
        bbox: [
          Math.round(box.x * width * 1000) / 1000,
          Math.round(box.y * height * 1000) / 1000,
          Math.round(pixelWidth * 1000) / 1000,
          Math.round(pixelHeight * 1000) / 1000,
        ],
        area: Math.round(pixelWidth * pixelHeight * 1000) / 1000,
        iscrowd: 0,
        segmentation: [],
        item_id: row.itemId,
        ...(box.text !== '' ? { text: box.text } : {}),
      });
    }
  }

  const dataset = {
    info: {
      description: typeof project?.name === 'string' ? project.name : '',
      version: String(project?.revision ?? 1),
      year: new Date().getFullYear(),
      date_created: nowIso(),
    },
    licenses: [],
    images,
    annotations: cocoAnnotations,
    categories,
  };
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function markdownTable(headers, rows) {
  const lines = [`| ${headers.map(markdownCell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.map(markdownCell).join(' | ')} |`);
  return lines.join('\n');
}

/**
 * Render a Markdown report for the whole project (scope-independent).
 * @param {{project?: object, items?: object[], annotations?: any, reviews?: any, stats?: object|null, agreement?: object|null}} options
 * @returns {string}
 */
export function exportReport({ project = {}, items = [], annotations = {}, reviews = [], stats = null, agreement = null } = {}) {
  const itemList = asArray(items).filter((item) => isPlainObject(item));
  const annMap = normalizeAnnotations(annotations);
  const revMap = normalizeReviews(reviews);
  const statusCounts = {
    approved: 0, rejected: 0, submitted: 0, flagged: 0, in_progress: 0, unlabeled: 0,
  };
  let annotated = 0;
  for (const item of itemList) {
    const itemId = typeof item.id === 'string' ? item.id : String(item.id ?? '');
    const anns = annMap.get(itemId) ?? [];
    const latestReview = latestBy(revMap.get(itemId) ?? []);
    const status = deriveItemStatus(anns, latestReview);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (anns.length > 0) annotated += 1;
  }

  const fields = schemaFields(project);
  const lines = [];
  lines.push('# 标注项目导出报告');
  lines.push('');
  lines.push('## 项目');
  lines.push('');
  lines.push(`- 名称：${project?.name ?? ''}`);
  lines.push(`- ID：${project?.id ?? ''}`);
  lines.push(`- 模板：${project?.template ?? ''}`);
  lines.push(`- 项目修订：${project?.revision ?? '-'}`);
  lines.push(`- 字段数：${fields.length}`);
  lines.push(`- 导出时间：${nowIso()}`);
  lines.push('');
  lines.push('## 数据概览');
  lines.push('');
  lines.push(`- 条目总数：${itemList.length}`);
  lines.push(`- 有标注：${annotated}`);
  lines.push(`- 无标注：${Math.max(0, itemList.length - annotated)}`);
  lines.push('');
  lines.push(markdownTable(
    ['状态', '数量'],
    Object.entries(statusCounts).map(([status, count]) => [status, count]),
  ));
  lines.push('');
  lines.push('## 字段覆盖率');
  lines.push('');
  const fieldRows = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const id = fieldId(field, index);
    let filled = 0;
    for (const item of itemList) {
      const itemId = typeof item.id === 'string' ? item.id : String(item.id ?? '');
      const list = annMap.get(itemId) ?? [];
      const latest = latestBy(list);
      if (latest && isPlainObject(latest.labels)) {
        const value = latest.labels[id];
        if (value !== undefined && value !== null && value !== '') filled += 1;
      }
    }
    fieldRows.push([
      id,
      field.label ?? '',
      field.type ?? '',
      field.required === true ? '是' : '否',
      `${filled}/${itemList.length}`,
      itemList.length > 0 ? `${Math.round((filled / itemList.length) * 1000) / 10}%` : '-',
    ]);
  }
  if (fieldRows.length > 0) {
    lines.push(markdownTable(['字段', '名称', '类型', '必填', '已填', '覆盖率'], fieldRows));
  } else {
    lines.push('_项目 schema 没有字段。_');
  }
  lines.push('');
  lines.push('## 审核');
  lines.push('');
  let approveCount = 0;
  let rejectCount = 0;
  for (const list of revMap.values()) {
    const latest = latestBy(list);
    if (latest?.decision === 'approve') approveCount += 1;
    if (latest?.decision === 'reject') rejectCount += 1;
  }
  lines.push(`- 已通过：${approveCount}`);
  lines.push(`- 已拒绝：${rejectCount}`);
  lines.push('');

  if (stats && isPlainObject(stats)) {
    lines.push('## 统计');
    lines.push('');
    const counts = isPlainObject(stats.counts) ? stats.counts : {};
    const countRows = Object.entries(counts).map(([key, value]) => [key, typeof value === 'number' ? value : String(value ?? '')]);
    if (countRows.length > 0) lines.push(markdownTable(['指标', '数量'], countRows));
    const actors = asArray(stats.actors).filter((actor) => isPlainObject(actor));
    if (actors.length > 0) {
      lines.push('');
      lines.push(markdownTable(
        ['标注员', '提交', '通过', '平均耗时(ms)'],
        actors.map((actor) => [actor.actorName ?? actor.actorId ?? '', actor.submitted ?? 0, actor.approved ?? 0, Math.round(Number(actor.avgDurationMs) || 0)]),
      ));
    }
    if (isPlainObject(stats.today)) {
      lines.push('');
      lines.push(`- 今日提交：${Number(stats.today.submitted) || 0}`);
      lines.push(`- 今日通过：${Number(stats.today.approved) || 0}`);
    }
    lines.push(`- 复核积压：${Number(stats.reviewBacklog) || 0}`);
    lines.push('');
  }

  if (agreement && isPlainObject(agreement)) {
    lines.push('## 标注一致性');
    lines.push('');
    lines.push(`- 参与比较条目：${Number(agreement.itemsCompared) || 0}`);
    lines.push(`- 总体一致性：${typeof agreement.overall === 'number' ? Math.round(agreement.overall * 1000) / 1000 : '-'}`);
    const agreementFields = asArray(agreement.fields).filter((field) => isPlainObject(field));
    if (agreementFields.length > 0) {
      lines.push('');
      lines.push(markdownTable(
        ['字段', '类型', '比较对数', '一致性'],
        agreementFields.map((field) => [
          field.field ?? '',
          field.type ?? '',
          Number(field.pairs) || 0,
          typeof field.score === 'number' ? Math.round(field.score * 1000) / 1000 : '-',
        ]),
      ));
    }
    if (agreement.gold && isPlainObject(agreement.gold)) {
      lines.push('');
      lines.push(`- 金标准条目：${Number(agreement.gold.items) || 0}`);
      const goldFields = asArray(agreement.gold.fields).filter((field) => isPlainObject(field));
      if (goldFields.length > 0) {
        lines.push('');
        lines.push(markdownTable(
          ['字段', '正确', '总数', '准确率'],
          goldFields.map((field) => [
            field.field ?? '',
            Number(field.correct) || 0,
            Number(field.total) || 0,
            typeof field.score === 'number' ? Math.round(field.score * 1000) / 1000 : '-',
          ]),
        ));
      }
    }
    lines.push('');
  }

  const externalMedia = [];
  for (const item of itemList) {
    for (const entry of asArray(item.media)) {
      const path = isPlainObject(entry) ? entry.path : entry;
      if (typeof path === 'string' && (path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path))) {
        externalMedia.push([item.id ?? '', path]);
      }
    }
  }
  if (externalMedia.length > 0) {
    lines.push('## 外部媒体引用');
    lines.push('');
    lines.push('以下媒体不在项目目录内，导出包不包含其文件：');
    lines.push('');
    lines.push(markdownTable(['条目', '路径'], externalMedia.slice(0, 200)));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** Build a unique export stamp directory under `<projectDir>/exports/`. */
async function createExportDir(projectDir, preferredStamp = null) {
  const preferred = typeof preferredStamp === 'string' && preferredStamp.trim() !== ''
    ? safeFilename(preferredStamp.trim(), '')
    : '';
  const base = preferred !== '' ? preferred : fileStamp();
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const stamp = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const dir = resolveInside(projectDir, join('exports', stamp));
    try {
      await stat(dir);
      continue;
    } catch {
      await ensureDir(dir);
      return { stamp, dir };
    }
  }
  throw new Error('无法创建导出目录：exports 下同名目录过多。');
}

/**
 * Write an export into `<projectDir>/exports/<stamp>/`.
 *
 * @param {{
 *   projectDir: string,
 *   project?: object,
 *   items?: object[],
 *   annotations?: any,
 *   reviews?: any,
 *   format?: string,
 *   scope?: string,
 *   itemId?: string|null,
 *   stats?: object|null,
 *   agreement?: object|null,
 *   stamp?: string|null,
 * }} options
 * @returns {Promise<{files: Array<{name: string, path: string, urlPath: string, size: number, mime: string}>, dir: string, summary: object}>}
 */
export async function writeExport(options = {}) {
  const {
    projectDir,
    project = {},
    items = [],
    annotations = {},
    reviews = [],
    format = 'jsonl',
    scope = 'approved',
    itemId = null,
    stats = null,
    agreement = null,
    stamp: preferredStamp = null,
  } = options;
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    throw new Error('writeExport 需要 projectDir');
  }
  const effectiveFormat = normalizeExportFormat(format);
  if (!effectiveFormat) throw new Error(`不支持的导出格式：${format}`);
  const normalizedScope = normalizeScope(scope);
  const { stamp, dir } = await createExportDir(projectDir, preferredStamp);
  const files = [];
  const usedFilenames = new Set();

  const writeArtifact = async (relativeName, content, mime) => {
    const relative = String(relativeName).replaceAll('\\', '/');
    const absPath = resolveInside(projectDir, join('exports', stamp, relative));
    await ensureDir(dirname(absPath));
    await writeFile(absPath, content, 'utf8');
    const info = await stat(absPath);
    const urlPath = relativeInside(projectDir, absPath).split(sep).join('/');
    const artifact = {
      name: relative,
      path: absPath,
      urlPath,
      size: info.size,
      mime: mime ?? guessMime(absPath),
    };
    files.push(artifact);
    usedFilenames.add(relative.toLowerCase());
    return artifact;
  };

  const summary = {
    format: effectiveFormat,
    scope: normalizedScope,
    generatedAt: nowIso(),
    itemId: itemId ?? null,
  };

  if (effectiveFormat === 'jsonl' || effectiveFormat === 'csv' || effectiveFormat === 'coco' || effectiveFormat === 'report') {
    const rows = selectRows({ items, annotations, reviews, scope: normalizedScope });
    summary.itemCount = rows.length;
    summary.labeledCount = rows.filter((row) => labelsHaveContent(row.labels)).length;
    summary.unlabeledCount = rows.length - summary.labeledCount;
    if (effectiveFormat === 'jsonl') {
      await writeArtifact('annotations.jsonl', exportJsonl({ project, items, annotations, reviews, scope: normalizedScope }), guessMime('annotations.jsonl'));
    } else if (effectiveFormat === 'csv') {
      await writeArtifact('annotations.csv', exportCsv({ project, items, annotations, reviews, scope: normalizedScope }), guessMime('annotations.csv'));
    } else if (effectiveFormat === 'coco') {
      await writeArtifact('coco.json', exportCoco({ project, items, annotations, reviews, scope: normalizedScope }), guessMime('coco.json'));
    } else {
      await writeArtifact('report.md', exportReport({ project, items, annotations, reviews, stats, agreement }), guessMime('report.md'));
    }
    summary.exportedCount = normalizedScope === 'all' ? rows.length : summary.labeledCount;
    summary.skippedCount = rows.length - summary.exportedCount;
    summary.fileCount = files.length;
    return { files, dir, summary };
  }

  // SRT / VTT
  const formatter = effectiveFormat === 'srt' ? formatSrt : formatVtt;
  if (itemId !== null && itemId !== undefined && String(itemId) !== '') {
    const targetId = String(itemId);
    const rows = selectRows({ items, annotations, reviews, scope: normalizedScope });
    let row = rows.find((entry) => entry.itemId === targetId) ?? null;
    if (!row) {
      const allRows = selectRows({ items, annotations, reviews, scope: 'all' });
      row = allRows.find((entry) => entry.itemId === targetId) ?? null;
    }
    if (!row) throw new Error(`未找到条目：${targetId}`);
    const segments = segmentsFromLabels(project, row.labels);
    const filename = `${safeFilename(targetId, 'item')}.${effectiveFormat}`;
    const content = segments.length > 0 ? formatter(segments) : (effectiveFormat === 'vtt' ? 'WEBVTT\n' : '');
    await writeArtifact(filename, content, guessMime(filename));
    summary.itemId = targetId;
    summary.itemCount = 1;
    summary.exportedCount = 1;
    summary.skippedCount = 0;
    summary.segmentCount = segments.length;
    summary.fileCount = files.length;
    return { files, dir, summary };
  }

  const rows = selectRows({ items, annotations, reviews, scope: normalizedScope });
  const subtitleDir = join(dir, 'subtitles');
  const manifestFiles = [];
  let subtitleCount = 0;
  let skipped = 0;
  for (const row of rows) {
    const segments = segmentsFromLabels(project, row.labels);
    if (segments.length === 0) {
      skipped += 1;
      continue;
    }
    let filename = `${safeFilename(row.itemId, 'item')}.${effectiveFormat}`;
    if (usedFilenames.has(`subtitles/${filename}`.toLowerCase())) {
      const ext = effectiveFormat;
      filename = `${safeFilename(row.itemId, 'item')}-${shortHash(row.itemId, 6)}.${ext}`;
    }
    const relative = `subtitles/${filename}`;
    const absPath = resolveInside(projectDir, join('exports', stamp, relative));
    await ensureDir(subtitleDir);
    await writeFile(absPath, formatter(segments), 'utf8');
    const info = await stat(absPath);
    const urlPath = relativeInside(projectDir, absPath).split(sep).join('/');
    files.push({ name: relative, path: absPath, urlPath, size: info.size, mime: guessMime(absPath) });
    usedFilenames.add(relative.toLowerCase());
    subtitleCount += 1;
    manifestFiles.push({
      itemId: row.itemId,
      file: relative,
      segmentCount: segments.length,
      status: row.status,
    });
  }
  const manifest = {
    format: effectiveFormat,
    generatedAt: nowIso(),
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    scope: normalizedScope,
    itemCount: subtitleCount,
    files: manifestFiles,
  };
  await writeArtifact('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, guessMime('manifest.json'));
  summary.itemCount = rows.length;
  summary.exportedCount = subtitleCount;
  summary.skippedCount = skipped;
  summary.subtitleCount = subtitleCount;
  summary.fileCount = files.length;
  return { files, dir, summary };
}
