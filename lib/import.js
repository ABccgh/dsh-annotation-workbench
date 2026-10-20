/**
 * Import pipeline for the annotation workbench.
 *
 * Supported sources:
 * - JSONL / NDJSON: one JSON object per line (arrays on a line are expanded).
 * - JSON: an array of objects, or `{ items | records | data | rows: [] }`, or a
 *   single object.
 * - CSV / TSV: first row is the header; quoted fields, escaped quotes, CRLF,
 *   BOM and embedded newlines are supported by `util.parseCsv`.
 * - SRT / VTT: one item per subtitle file; cues become the `segments` payload.
 * - Folder: one item per media/text file, with same-basename `.srt` / `.vtt` /
 *   `.txt` sidecars attached as segments/text.
 * - Media: one item for the selected file.
 *
 * `importItems` never writes `items.jsonl`; the store appends the returned
 * items atomically. Media files are copied into `<projectDir>/media/`, and the
 * copy is idempotent by filename: an existing destination with the same name is
 * reused instead of being copied again.
 *
 * Only `node:*` modules and `./util.js` / `./templates.js` are imported.
 *
 * @module @local/annotation-workbench/lib/import
 */

import { statSync } from 'node:fs';
import { copyFile, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { getTemplate } from './templates.js';
import {
  ensureDir,
  guessMime,
  nowIso,
  parseCsv,
  parseSrt,
  parseVtt,
  readJsonl,
  relativeInside,
  resolveInside,
  safeFilename,
  shortHash,
  walkFiles,
} from './util.js';

/** Item kinds accepted by the data model. */
const KINDS = new Set(['text', 'image', 'video', 'audio', 'llm', 'document']);

/** Extensions treated as media both in folders and for single-file import. */
const MEDIA_EXTENSIONS = [
  'mp4', 'mov', 'mkv', 'webm', 'avi',
  'mp3', 'wav', 'm4a', 'flac', 'ogg',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg',
];

const TEXT_EXTENSIONS = ['txt', 'md'];
const SUBTITLE_EXTENSIONS = ['srt', 'vtt'];
const FOLDER_EXTENSIONS = [...MEDIA_EXTENSIONS, ...TEXT_EXTENSIONS, ...SUBTITLE_EXTENSIONS];

const MEDIA_EXT_SET = new Set(MEDIA_EXTENSIONS);
const TEXT_EXT_SET = new Set(TEXT_EXTENSIONS);
const SUBTITLE_EXT_SET = new Set(SUBTITLE_EXTENSIONS);

const KIND_BY_EXT = {
  mp4: 'video', mov: 'video', mkv: 'video', webm: 'video', avi: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image', svg: 'image',
  txt: 'text', md: 'document',
};

const FORMAT_BY_EXT = { jsonl: 'jsonl', ndjson: 'jsonl', json: 'json', csv: 'csv', tsv: 'tsv', srt: 'srt', vtt: 'vtt' };

const FORMAT_ALIASES = {
  ndjson: 'jsonl',
  jsonlines: 'jsonl',
  'json-lines': 'jsonl',
  'json-l': 'jsonl',
  directory: 'folder',
  dir: 'folder',
  files: 'files',
  file: 'files',
  plain: 'media',
  textfile: 'media',
  markdown: 'media',
};

const VALID_FORMATS = new Set(['jsonl', 'json', 'csv', 'tsv', 'srt', 'vtt', 'folder', 'media', 'files', 'auto']);

const DEFAULT_MAX_ITEMS = 50000;

/** Keys that never leak from a flat record into `payload`. */
const RESERVED_RECORD_KEYS = new Set([
  'id', 'itemId', 'item_id', 'kind', 'media', 'payload', 'meta', 'batch', 'tags',
  'priority', 'createdAt', 'type', 'schemaRevision', 'sourcePath', '_sourcePath',
]);

const AUTO_ID_KEYS = ['id', 'itemId', 'item_id', 'uid'];
const AUTO_TEXT_KEYS = ['text', 'content', 'caption', 'prompt', 'sentence', 'document', 'transcript'];
const AUTO_MEDIA_KEYS = ['media', 'image', 'img', 'file', 'path', 'audio', 'video', 'url'];
const AUTO_MESSAGES_KEYS = ['messages', 'conversation', 'dialogue'];

/** Normalize a caller-supplied format string. Unknown values become `auto`. */
function normalizeFormat(format) {
  if (format === undefined || format === null || format === '') return 'auto';
  const raw = String(format).trim().toLowerCase();
  const mapped = FORMAT_ALIASES[raw] ?? raw;
  return VALID_FORMATS.has(mapped) ? mapped : 'auto';
}

/** Normalize `limits.maxItems`. */
function normalizeMaxItems(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_ITEMS;
  return Math.floor(parsed);
}

/** Lower-case extension without the leading dot. */
function extOf(path) {
  return extname(String(path ?? '')).slice(1).toLowerCase();
}

/** Basename without its extension. */
function baseNoExt(path) {
  const name = basename(String(path ?? ''));
  const ext = extname(name);
  return ext ? name.slice(0, name.length - ext.length) : name;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

/** Read a dotted path (`payload.text` / `a.0.b`) from a record. */
function getPath(record, path) {
  const text = String(path ?? '').trim();
  if (text === '') return undefined;
  const parts = text.split('.');
  let current = record;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Detect the import format from a path, an explicit format, or an array of
 * paths. Directories resolve to `folder`, media/text files to `media`.
 *
 * @param {string|string[]|null|undefined} source
 * @param {string} [explicit]
 * @returns {'jsonl'|'json'|'csv'|'tsv'|'srt'|'vtt'|'folder'|'media'|'files'|'auto'}
 */
export function detectFormat(source, explicit) {
  const normalized = normalizeFormat(explicit);
  if (normalized !== 'auto') return normalized;
  if (Array.isArray(source)) return 'files';
  if (source === undefined || source === null || String(source).trim() === '') return 'jsonl';
  const text = String(source);
  try {
    if (statSync(text).isDirectory()) return 'folder';
  } catch {
    // Not an existing path: fall through to extension detection.
  }
  const ext = extOf(text);
  if (FORMAT_BY_EXT[ext]) return FORMAT_BY_EXT[ext];
  if (MEDIA_EXT_SET.has(ext) || TEXT_EXT_SET.has(ext)) return 'media';
  return 'jsonl';
}

/**
 * Parse JSONL text into raw records.
 *
 * @param {string} text
 * @param {{ maxItems?: number }} [options]
 * @returns {{ records: Record<string, unknown>[], warnings: Array<{code: string, message: string, line?: number}> }}
 */
export function parseJsonlItems(text, options = {}) {
  const records = [];
  const warnings = [];
  const maxItems = Number.isFinite(Number(options.maxItems)) && Number(options.maxItems) > 0
    ? Math.floor(Number(options.maxItems))
    : Infinity;
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === '') continue;
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      warnings.push({ code: 'bad-json', message: `第 ${index + 1} 行不是合法 JSON：${error.message}`, line: index + 1 });
      continue;
    }
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      if (!isPlainObject(candidate)) {
        warnings.push({ code: 'bad-record', message: `第 ${index + 1} 行不是 JSON 对象，已跳过。`, line: index + 1 });
        continue;
      }
      if (records.length >= maxItems) {
        warnings.push({ code: 'limit-reached', message: `超过单次导入上限 ${maxItems} 条，剩余记录已忽略。` });
        return { records, warnings };
      }
      records.push(candidate);
    }
  }
  return { records, warnings };
}

/**
 * Parse CSV / TSV text into flat records keyed by the header row.
 *
 * @param {string} text
 * @param {{ delimiter?: string, maxItems?: number }} [options]
 * @returns {{ records: Record<string, string>[], warnings: Array<{code: string, message: string, line?: number}> }}
 */
export function parseCsvItems(text, options = {}) {
  const delimiter = options.delimiter === '\\t' ? '\t' : (options.delimiter ?? ',');
  const maxItems = Number.isFinite(Number(options.maxItems)) && Number(options.maxItems) > 0
    ? Math.floor(Number(options.maxItems))
    : Infinity;
  const warnings = [];
  const records = [];
  const { header, rows } = parseCsv(String(text ?? ''), delimiter);
  if (header.length === 0) {
    if (String(text ?? '').trim() !== '') {
      warnings.push({ code: 'empty-header', message: 'CSV 没有表头，无法导入。' });
    }
    return { records, warnings };
  }
  if (header.some((column) => column === '')) {
    warnings.push({ code: 'blank-header', message: 'CSV 表头存在空列名，空列会被忽略。' });
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((value) => String(value ?? '').trim() === '')) continue;
    if (records.length >= maxItems) {
      warnings.push({ code: 'limit-reached', message: `超过单次导入上限 ${maxItems} 条，剩余记录已忽略。` });
      break;
    }
    if (row.length > header.length && row.slice(header.length).some((value) => String(value ?? '').trim() !== '')) {
      warnings.push({ code: 'extra-columns', message: `第 ${index + 2} 行比表头多出内容，多余部分已忽略。`, line: index + 2 });
    }
    const record = {};
    for (let column = 0; column < header.length; column += 1) {
      const key = header[column];
      if (!key) continue;
      record[key] = row[column] ?? '';
    }
    records.push(record);
  }
  return { records, warnings };
}

/** Resolve the template kind without mutating template data. */
function templateKind(template) {
  try {
    if (template && typeof template === 'object' && typeof template.kind === 'string') {
      return KINDS.has(template.kind) ? template.kind : null;
    }
    if (typeof template === 'string' && template !== '') {
      const resolved = getTemplate(template);
      return KINDS.has(resolved?.kind) ? resolved.kind : null;
    }
  } catch {
    // Templates are best-effort metadata only.
  }
  return null;
}

function normalizeKind(value) {
  if (typeof value !== 'string') return null;
  const kind = value.trim().toLowerCase();
  return KINDS.has(kind) ? kind : null;
}

/** Make an item id that is safe to use as a filename / URL segment. */
function sanitizeItemId(value) {
  const raw = String(value ?? '');
  let id = raw.normalize('NFKC');
  id = id.replace(/[^a-zA-Z0-9._-]+/g, '-');
  id = id.replace(/^[^a-zA-Z0-9]+/, '');
  id = id.replace(/-{2,}/g, '-').replace(/[-.]+$/, '');
  if (id.length > 120) id = id.slice(0, 120);
  return id;
}

/** Parse a `messages` cell/column: JSON array/object or plain string. */
function parseMessages(value) {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) return [value];
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return undefined;
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (isPlainObject(parsed)) return [parsed];
      } catch {
        // Fall through: keep the raw string.
      }
    }
    return text;
  }
  return undefined;
}

/** Normalize the `media` column/field of a record into `{path, mime}` entries. */
function normalizeMediaInput(value) {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return [];
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        return normalizeMediaInput(JSON.parse(text));
      } catch {
        // Not JSON: fall through to path splitting.
      }
    }
    return text
      .split(/[\n;|]+/)
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => ({ path: part, mime: guessMime(part) }));
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const entry of value) {
      if (entry === undefined || entry === null || entry === '') continue;
      if (typeof entry === 'string') {
        const text = entry.trim();
        if (text !== '') out.push({ path: text, mime: guessMime(text) });
        continue;
      }
      if (isPlainObject(entry)) {
        const path = entry.path ?? entry.src ?? entry.url ?? entry.file;
        if (typeof path !== 'string' || path.trim() === '') continue;
        const normalized = { path: path.trim(), mime: typeof entry.mime === 'string' && entry.mime !== '' ? entry.mime : guessMime(path) };
        if (typeof entry.sourcePath === 'string' && entry.sourcePath !== '') normalized.sourcePath = entry.sourcePath;
        out.push(normalized);
      }
    }
    return out;
  }
  if (isPlainObject(value)) {
    const path = value.path ?? value.src ?? value.url ?? value.file;
    if (typeof path !== 'string' || path.trim() === '') return [];
    return [{ path: path.trim(), mime: value.mime ?? guessMime(path), ...(value.sourcePath ? { sourcePath: String(value.sourcePath) } : {}) }];
  }
  return [];
}

/** Collect a value for a semantic column, honoring explicit mapping then auto-detection. */
function pickValue(record, mapping, key, autoKeys, consumed) {
  const spec = mapping?.[key];
  const specs = spec === undefined || spec === null || spec === '' ? [] : (Array.isArray(spec) ? spec : [spec]);
  for (const candidate of specs) {
    const path = typeof candidate === 'string' ? candidate.trim() : String(candidate ?? '').trim();
    if (path === '') continue;
    consumed.add(path.split('.')[0]);
    const value = getPath(record, path);
    if (value !== undefined) return value;
  }
  for (const autoKey of autoKeys ?? []) {
    if (Object.prototype.hasOwnProperty.call(record, autoKey)) {
      consumed.add(autoKey);
      return record[autoKey];
    }
  }
  return undefined;
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter((entry) => entry !== '');
  if (typeof value === 'string') {
    return value.split(/[,;|]+/).map((entry) => entry.trim()).filter((entry) => entry !== '');
  }
  return [String(value)];
}

function normalizeMeta(value, fallback = {}) {
  const source = isPlainObject(value) ? value : {};
  const pickNumber = (entry) => (Number.isFinite(Number(entry)) ? Number(entry) : null);
  return {
    durationMs: pickNumber(source.durationMs ?? fallback.durationMs),
    width: pickNumber(source.width ?? fallback.width),
    height: pickNumber(source.height ?? fallback.height),
    fps: pickNumber(source.fps ?? fallback.fps),
  };
}

/**
 * Convert one raw record into a normalized item-like record.
 * Returns `null` for records that cannot be imported.
 */
function normalizeRecord(record, context) {
  if (!isPlainObject(record)) return null;
  const { mapping = {}, template, index = 0, warn = () => {} } = context;
  const consumed = new Set();
  const payload = isPlainObject(record.payload) ? cloneJson(record.payload) ?? {} : {};

  const rawId = pickValue(record, mapping, 'id', AUTO_ID_KEYS, consumed);
  const fallbackId = `item-${index + 1}`;
  let id = rawId === undefined || rawId === null ? fallbackId : String(rawId).trim();
  if (id === '') id = fallbackId;
  const sanitized = sanitizeItemId(id);
  if (sanitized === '') {
    id = fallbackId;
  } else if (sanitized !== id) {
    warn({
      code: 'id-sanitized',
      message: `条目 id ${JSON.stringify(id)} 含不安全字符，已规范化为 ${sanitized}。`,
    });
    id = sanitized;
  }

  const textValue = pickValue(record, mapping, 'text', AUTO_TEXT_KEYS, consumed);
  if (textValue !== undefined && textValue !== null) {
    if (typeof textValue === 'string' || typeof textValue === 'number' || typeof textValue === 'boolean') {
      payload.text = String(textValue);
    } else if (Array.isArray(textValue)) {
      payload.text = textValue.map((entry) => String(entry ?? '')).join('\n');
    } else {
      payload.text = JSON.stringify(textValue);
    }
  }

  const messagesValue = pickValue(record, mapping, 'messages', AUTO_MESSAGES_KEYS, consumed);
  if (messagesValue !== undefined && messagesValue !== null) {
    const parsed = parseMessages(messagesValue);
    if (parsed !== undefined) payload.messages = parsed;
  }

  const mediaValue = pickValue(record, mapping, 'media', AUTO_MEDIA_KEYS, consumed);
  const media = normalizeMediaInput(mediaValue);

  const mappedKind = pickValue(record, mapping, 'kind', ['kind'], consumed);
  let kind = normalizeKind(mappedKind) ?? normalizeKind(record.kind);
  if (!kind) {
    const firstExt = media.length > 0 ? extOf(media[0].path) : '';
    if (firstExt && KIND_BY_EXT[firstExt]) kind = KIND_BY_EXT[firstExt];
    else if (Array.isArray(payload.messages)) kind = 'llm';
    else if (Array.isArray(payload.segments)) kind = 'audio';
    else kind = templateKind(template) ?? 'text';
  }

  const batchValue = pickValue(record, mapping, 'batch', ['batch'], consumed);
  let batch = null;
  if (typeof batchValue === 'string' && batchValue.trim() !== '') batch = batchValue.trim();
  else if (typeof batchValue === 'number' && Number.isFinite(batchValue)) batch = String(batchValue);

  const tagsValue = pickValue(record, mapping, 'tags', ['tags'], consumed);
  const priorityValue = pickValue(record, mapping, 'priority', ['priority'], consumed);

  for (const [key, value] of Object.entries(record)) {
    if (RESERVED_RECORD_KEYS.has(key) || consumed.has(key)) continue;
    if (value === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(payload, key)) continue;
    payload[key] = cloneJson(value);
  }

  return {
    id,
    kind,
    media,
    payload,
    meta: normalizeMeta(record.meta),
    batch,
    tags: normalizeTags(tagsValue ?? record.tags),
    priority: Number.isFinite(Number(priorityValue ?? record.priority)) ? Number(priorityValue ?? record.priority) : 0,
    createdAt: typeof record.createdAt === 'string' && record.createdAt.trim() !== '' ? record.createdAt : nowIso(),
  };
}

/** Normalize a `files` entry used by folder import. */
function toFileEntry(entry, index = 0) {
  if (typeof entry === 'string') {
    const ext = extOf(entry);
    return {
      path: resolve(entry),
      rel: basename(entry),
      name: basename(entry),
      ext,
      size: 0,
      text: undefined,
      sourceIndex: index,
    };
  }
  if (!isPlainObject(entry)) return null;
  const path = typeof entry.path === 'string' ? entry.path : '';
  if (path === '') return null;
  const ext = extOf(entry.ext ? `x.${entry.ext}` : path);
  return {
    path: resolve(path),
    rel: typeof entry.rel === 'string' && entry.rel !== '' ? entry.rel : basename(path),
    name: typeof entry.name === 'string' && entry.name !== '' ? entry.name : basename(path),
    ext,
    size: Number(entry.size) || 0,
    text: typeof entry.text === 'string' ? entry.text : undefined,
    sourceIndex: index,
  };
}

/** Parse subtitle text without throwing; returns [] on empty input. */
function parseSubtitleText(ext, text) {
  try {
    if (ext === 'srt') return parseSrt(text ?? '');
    if (ext === 'vtt') return parseVtt(text ?? '');
  } catch {
    return [];
  }
  return [];
}

/**
 * Build one item per media/text file and attach same-basename sidecars.
 * @param {Array} files
 * @param {{ template?: unknown }} context
 */
function buildFolderRecords(files, context = {}) {
  const warnings = [];
  const entries = [];
  const seen = new Set();
  for (let index = 0; index < (Array.isArray(files) ? files.length : 0); index += 1) {
    const entry = toFileEntry(files[index], index);
    if (!entry) continue;
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    entries.push(entry);
  }
  entries.sort((left, right) => (left.rel < right.rel ? -1 : left.rel > right.rel ? 1 : 0));

  const sidecars = new Map();
  for (const entry of entries) {
    if (!TEXT_EXT_SET.has(entry.ext) && !SUBTITLE_EXT_SET.has(entry.ext)) continue;
    const key = `${dirname(entry.path).toLowerCase()}|${baseNoExt(entry.name).toLowerCase()}`;
    const bucket = sidecars.get(key) ?? {};
    if (entry.ext === 'srt' && !bucket.srt) bucket.srt = entry;
    else if (entry.ext === 'vtt' && !bucket.vtt) bucket.vtt = entry;
    else if (entry.ext === 'txt' && !bucket.txt) bucket.txt = entry;
    sidecars.set(key, bucket);
  }

  const defaultKind = templateKind(context.template) ?? 'text';
  const usedSidecars = new Set();
  const mediaRecords = [];
  const trailingRecords = [];
  const usedIds = new Set();

  const uniqueId = (candidate, seed) => {
    let id = sanitizeItemId(candidate);
    if (id === '') id = 'item';
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    const hashed = sanitizeItemId(`${id}-${shortHash(seed, 4)}`) || `item-${shortHash(seed, 6)}`;
    usedIds.add(hashed);
    return hashed;
  };

  for (const entry of entries) {
    const isSubtitle = SUBTITLE_EXT_SET.has(entry.ext);
    const isText = TEXT_EXT_SET.has(entry.ext);
    const isMedia = MEDIA_EXT_SET.has(entry.ext);
    if (!isSubtitle && !isText && !isMedia) continue;
    if (isSubtitle || isText) {
      trailingRecords.push(entry);
      continue;
    }

    const key = `${dirname(entry.path).toLowerCase()}|${baseNoExt(entry.name).toLowerCase()}`;
    const bucket = sidecars.get(key) ?? {};
    const payload = {};
    const media = [{
      path: entry.path,
      mime: guessMime(entry.path),
      sourcePath: entry.path,
    }];
    let durationMs = null;
    let segments = null;
    const subtitle = bucket.srt ?? bucket.vtt;
    if (subtitle) {
      usedSidecars.add(subtitle.path);
      if (subtitle.text === undefined) {
        warnings.push({ code: 'sidecar-unreadable', message: `字幕旁挂文件没有可读内容：${subtitle.rel}` });
      } else {
        segments = parseSubtitleText(subtitle.ext, subtitle.text);
        if (segments.length === 0) {
          warnings.push({ code: 'empty-subtitle', message: `字幕旁挂文件没有解析出分段：${subtitle.rel}` });
        }
      }
    }
    if (segments && segments.length > 0) {
      payload.segments = segments;
      const last = segments[segments.length - 1];
      if (Number.isFinite(Number(last?.end))) durationMs = Math.round(Number(last.end) * 1000);
    }
    if (bucket.txt) {
      usedSidecars.add(bucket.txt.path);
      if (typeof bucket.txt.text === 'string' && bucket.txt.text.trim() !== '') payload.text = bucket.txt.text;
    }

    mediaRecords.push({
      id: uniqueId(baseNoExt(entry.name), entry.rel),
      kind: KIND_BY_EXT[entry.ext] ?? defaultKind,
      media,
      payload,
      meta: { durationMs, width: null, height: null, fps: null },
      batch: null,
      tags: [],
      priority: 0,
      createdAt: nowIso(),
    });
  }

  for (const entry of trailingRecords) {
    if (usedSidecars.has(entry.path)) continue;
    if (SUBTITLE_EXT_SET.has(entry.ext)) {
      const segments = entry.text === undefined ? [] : parseSubtitleText(entry.ext, entry.text);
      if (entry.text === undefined) {
        warnings.push({ code: 'sidecar-unreadable', message: `字幕文件没有可读内容：${entry.rel}` });
      } else if (segments.length === 0) {
        warnings.push({ code: 'empty-subtitle', message: `字幕文件没有解析出分段：${entry.rel}` });
      }
      const last = segments[segments.length - 1];
      mediaRecords.push({
        id: uniqueId(baseNoExt(entry.name), entry.rel),
        kind: defaultKind === 'video' || defaultKind === 'audio' ? defaultKind : 'audio',
        media: [],
        payload: { segments },
        meta: { durationMs: Number.isFinite(Number(last?.end)) ? Math.round(Number(last.end) * 1000) : null, width: null, height: null, fps: null },
        batch: null,
        tags: [],
        priority: 0,
        createdAt: nowIso(),
      });
      continue;
    }
    const record = {
      id: uniqueId(baseNoExt(entry.name), entry.rel),
      kind: entry.ext === 'md' ? 'document' : 'text',
      media: [],
      payload: {},
      meta: { durationMs: null, width: null, height: null, fps: null },
      batch: null,
      tags: [],
      priority: 0,
      createdAt: nowIso(),
    };
    if (entry.text === undefined) {
      warnings.push({ code: 'text-unreadable', message: `文本文件没有可读内容：${entry.rel}` });
    } else {
      record.payload.text = entry.text;
    }
    mediaRecords.push(record);
  }

  return { records: mediaRecords, warnings };
}

function parseJsonRecords(text, warn) {
  try {
    const value = JSON.parse(String(text ?? '').replace(/^\uFEFF/, ''));
    if (Array.isArray(value)) return value;
    if (isPlainObject(value)) {
      for (const key of ['items', 'records', 'data', 'rows', 'examples']) {
        if (Array.isArray(value[key])) return value[key];
      }
      return [value];
    }
    warn({ code: 'bad-json', message: 'JSON 顶层必须是对象或数组。' });
  } catch (error) {
    warn({ code: 'bad-json', message: `JSON 解析失败：${error.message}` });
  }
  return [];
}

/**
 * Pure record building used by `importItems` and by preview routes.
 *
 * @param {{
 *   format?: string,
 *   source?: string,
 *   text?: string,
 *   files?: Array,
 *   mapping?: Record<string, string|string[]>,
 *   template?: string|object,
 *   itemsExisting?: Array<string|{id: string}>,
 *   limits?: {maxItems?: number},
 *   sourceMedia?: string|null,
 * }} input
 * @returns {{ records: Array<object>, warnings: Array<{code: string, message: string}>, skipped: number }}
 */
export function buildImportRecords(input = {}) {
  const {
    format = 'auto',
    source = '',
    text = '',
    files = [],
    mapping = {},
    template = 'custom',
    itemsExisting = [],
    limits = {},
  } = input;
  const maxItems = normalizeMaxItems(limits?.maxItems);
  const warnings = [];
  const warn = (warning) => warnings.push(warning);
  const fileList = Array.isArray(files) ? files : [];
  let effectiveFormat = normalizeFormat(format);
  if (effectiveFormat === 'auto') {
    effectiveFormat = fileList.length > 0 ? 'files' : detectFormat(source, 'auto');
  }

  const rawRecords = [];
  const pushRaw = (record) => {
    if (rawRecords.length >= maxItems * 2) return;
    rawRecords.push(record);
  };

  switch (effectiveFormat) {
    case 'jsonl': {
      const parsed = parseJsonlItems(text, { maxItems: maxItems * 2 });
      warnings.push(...parsed.warnings);
      for (const record of parsed.records) pushRaw(record);
      break;
    }
    case 'json': {
      const records = parseJsonRecords(text, warn);
      for (const record of records) pushRaw(record);
      break;
    }
    case 'csv':
    case 'tsv': {
      const parsed = parseCsvItems(text, {
        delimiter: effectiveFormat === 'tsv' ? '\t' : ',',
        maxItems: maxItems * 2,
      });
      warnings.push(...parsed.warnings);
      for (const record of parsed.records) pushRaw(record);
      break;
    }
    case 'srt':
    case 'vtt': {
      const ext = effectiveFormat;
      const segments = parseSubtitleText(ext, text);
      if (segments.length === 0) {
        warnings.push({ code: 'empty-subtitle', message: '字幕文件没有解析出任何分段。' });
      }
      const sourcePath = typeof source === 'string' ? source : '';
      const sourceMedia = typeof input.sourceMedia === 'string' && input.sourceMedia !== '' ? input.sourceMedia : null;
      const last = segments[segments.length - 1];
      const defaultKind = templateKind(template);
      pushRaw({
        id: baseNoExt(sourcePath || 'subtitle'),
        kind: defaultKind === 'video' || defaultKind === 'audio' ? defaultKind : 'audio',
        media: sourceMedia ? [{ path: sourceMedia, sourcePath: sourceMedia, mime: guessMime(sourceMedia) }] : [],
        payload: { segments },
        meta: { durationMs: Number.isFinite(Number(last?.end)) ? Math.round(Number(last.end) * 1000) : null },
      });
      break;
    }
    case 'media': {
      const sourcePath = typeof source === 'string' && source !== '' ? source : (fileList[0] ? (typeof fileList[0] === 'string' ? fileList[0] : fileList[0].path) : '');
      const ext = extOf(sourcePath);
      const isText = TEXT_EXT_SET.has(ext);
      pushRaw({
        id: baseNoExt(sourcePath || 'media'),
        kind: KIND_BY_EXT[ext] ?? templateKind(template) ?? 'text',
        media: isText ? [] : [{ path: sourcePath, sourcePath, mime: guessMime(sourcePath) }],
        payload: isText ? { text: String(text ?? '') } : {},
      });
      break;
    }
    case 'folder':
    case 'files': {
      const built = buildFolderRecords(fileList, { template });
      warnings.push(...built.warnings);
      for (const record of built.records) pushRaw(record);
      break;
    }
    default: {
      warnings.push({ code: 'unknown-format', message: `无法识别的导入格式：${format}` });
      return { records: [], warnings, skipped: 0 };
    }
  }

  const existingIds = new Set();
  for (const entry of Array.isArray(itemsExisting) ? itemsExisting : []) {
    const existingId = typeof entry === 'string' ? entry : entry?.id;
    if (typeof existingId === 'string' && existingId !== '') existingIds.add(existingId);
  }

  const records = [];
  let invalid = 0;
  let duplicates = 0;
  let truncated = 0;
  for (let index = 0; index < rawRecords.length; index += 1) {
    if (records.length >= maxItems) {
      truncated = rawRecords.length - index;
      break;
    }
    const normalized = normalizeRecord(rawRecords[index], {
      mapping,
      template,
      index,
      warn,
    });
    if (!normalized) {
      invalid += 1;
      continue;
    }
    if (existingIds.has(normalized.id)) {
      duplicates += 1;
      warnings.push({ code: 'duplicate-id', message: `重复 id 已跳过：${normalized.id}`, itemId: normalized.id });
      continue;
    }
    existingIds.add(normalized.id);
    records.push(normalized);
  }
  if (truncated > 0) {
    warnings.push({ code: 'limit-reached', message: `超过单次导入上限 ${maxItems} 条，${truncated} 条记录已忽略。` });
  }
  if (invalid > 0) {
    warnings.push({ code: 'invalid-records', message: `${invalid} 条记录不是有效的 JSON 对象，已跳过。` });
  }
  return { records, warnings, skipped: invalid + duplicates + truncated };
}

/** Resolve a media path to an existing absolute file. */
async function resolveMediaSource({ rawPath, sourceHint, projectDir, sourceBaseDir }) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') return null;
  const text = rawPath.trim();
  const candidates = [];
  if (typeof sourceHint === 'string' && sourceHint.trim() !== '') candidates.push(resolve(sourceHint.trim()));
  if (isAbsolute(text)) {
    candidates.push(resolve(text));
  } else {
    if (sourceBaseDir) candidates.push(resolve(sourceBaseDir, text));
    candidates.push(resolve(projectDir, text));
    if (typeof sourceHint === 'string' && sourceHint.trim() !== '') {
      candidates.push(resolve(dirname(sourceHint.trim()), text));
    }
  }
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return { absPath: candidate, size: info.size };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function isInside(projectDir, target) {
  const rel = relativeInside(projectDir, target);
  if (rel === '' || rel === '.') return true;
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Copy a media file into `<projectDir>/media/`. Reuses an existing destination
 * with the same name (idempotent), and disambiguates same-basename sources that
 * appear in one import batch with a short path hash.
 */
async function copyMediaFile({ projectDir, sourceAbs, usedNames }) {
  const mediaDir = join(projectDir, 'media');
  await ensureDir(mediaDir);
  const original = safeFilename(basename(sourceAbs), 'media');
  let name = original;
  if (usedNames.has(name.toLowerCase())) {
    const ext = extname(original);
    const stem = ext ? original.slice(0, original.length - ext.length) : original;
    name = `${stem}-${shortHash(sourceAbs, 6)}${ext || ''}`;
  }
  const dest = resolveInside(projectDir, join('media', name));
  try {
    const info = await stat(dest);
    if (info.isFile()) {
      usedNames.add(name.toLowerCase());
      return { name, absPath: dest, size: info.size, copied: false };
    }
  } catch {
    // Destination does not exist yet.
  }
  await copyFile(sourceAbs, dest);
  const info = await stat(dest);
  usedNames.add(name.toLowerCase());
  return { name, absPath: dest, size: info.size, copied: true };
}

/** Read folder-like sources into enriched file entries (text preloaded). */
async function collectFileEntries(sources, recursive, maxItems, warn) {
  const files = [];
  const seen = new Set();
  const maxFiles = Math.min(200000, Math.max(200, maxItems * 3));

  const addEntry = async (entry) => {
    if (seen.has(entry.path)) return;
    seen.add(entry.path);
    if (files.length >= maxFiles) return;
    if (SUBTITLE_EXT_SET.has(entry.ext) || TEXT_EXT_SET.has(entry.ext)) {
      try {
        const info = await stat(entry.path);
        if (info.size > 64 * 1024 * 1024) {
          warn({ code: 'text-too-large', message: `文本文件超过 64 MB，已跳过内容读取：${entry.path}` });
        } else {
          entry.text = await readFile(entry.path, 'utf8');
        }
      } catch (error) {
        warn({ code: 'read-failed', message: `无法读取文本文件 ${entry.path}：${error.code ?? error.message}` });
      }
    }
    files.push(entry);
  };

  for (const source of sources) {
    const sourcePath = String(source);
    let info;
    try {
      info = await stat(sourcePath);
    } catch {
      warn({ code: 'source-missing', message: `导入源不存在：${sourcePath}` });
      continue;
    }
    if (info.isDirectory()) {
      if (!recursive) {
        warn({ code: 'unsupported-source', message: `文件列表中的目录已展开：${sourcePath}` });
      }
      const walked = await walkFiles(sourcePath, {
        extensions: FOLDER_EXTENSIONS,
        maxFiles,
        skipDirs: ['.git', 'node_modules', 'exports', 'labels', 'reviews', 'claims', '.admin'],
      });
      for (const entry of walked) {
        if (files.length >= maxFiles) break;
        await addEntry({
          path: resolve(entry.path),
          rel: entry.rel,
          name: entry.name,
          ext: entry.ext,
          size: entry.size,
        });
      }
      continue;
    }
    if (!info.isFile()) {
      warn({ code: 'unsupported-source', message: `不支持的导入源：${sourcePath}` });
      continue;
    }
    const ext = extOf(sourcePath);
    if (!FOLDER_EXTENSIONS.includes(ext)) {
      warn({ code: 'unsupported-file', message: `忽略不支持的文件类型：${sourcePath}` });
      continue;
    }
    await addEntry({
      path: resolve(sourcePath),
      rel: basename(sourcePath),
      name: basename(sourcePath),
      ext,
      size: info.size,
    });
  }

  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return files;
}

/** Find a sibling media file for a standalone subtitle import (`a.srt` -> `a.mp4`). */
async function findSubtitleSiblingMedia(sourcePath) {
  const dir = dirname(resolve(sourcePath));
  const base = baseNoExt(sourcePath).toLowerCase();
  for (const ext of MEDIA_EXTENSIONS) {
    const candidate = join(dir, `${baseNoExt(sourcePath)}.${ext}`);
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

/**
 * Import records from a file, folder, or media path.
 *
 * Returns normalized items and media side effects. `items.jsonl` is never
 * written here; the store appends the items after this resolves.
 *
 * @param {{
 *   projectDir: string,
 *   project?: {template?: string, schema?: object, settings?: object},
 *   source?: string|string[],
 *   format?: string,
 *   mapping?: Record<string, string|string[]>,
 *   copyMedia?: boolean,
 *   limits?: {maxItems?: number},
 *   log?: (message: string) => void,
 * }} options
 * @returns {Promise<{
 *   imported: number,
 *   skipped: number,
 *   warnings: Array<{code: string, message: string, itemId?: string}>,
 *   items: Array<object>,
 *   mediaFiles: Array<{path: string, name: string, mime: string, size: number, copied: boolean}>,
 *   missingMedia: Array<{itemId: string, index: number, path: string}>,
 * }>}
 */
export async function importItems(options = {}) {
  const {
    projectDir,
    project = {},
    source,
    format = 'auto',
    mapping = {},
    copyMedia = true,
    limits = {},
    log = () => {},
  } = options;
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    throw new Error('importItems 需要 projectDir');
  }
  const maxItems = normalizeMaxItems(limits?.maxItems);
  const warnings = [];
  const warn = (warning) => {
    warnings.push(warning);
    try {
      log(`[import] ${warning.message}`);
    } catch {
      // Logging must never break an import.
    }
  };

  const requestedFormat = format;
  const normalizedRequested = normalizeFormat(requestedFormat);
  if (requestedFormat && String(requestedFormat).trim().toLowerCase() !== 'auto' && normalizedRequested === 'auto') {
    warn({ code: 'unknown-format', message: `未知导入格式 ${requestedFormat}，已自动识别。` });
  }

  const sources = Array.isArray(source)
    ? source.map((entry) => String(entry)).filter((entry) => entry.trim() !== '')
    : (source === undefined || source === null || String(source).trim() === '' ? [] : [String(source)]);
  const effectiveFormat = detectFormat(Array.isArray(source) ? source : (sources[0] ?? ''), normalizedRequested);

  let text = '';
  let files = [];
  let textFile = null;
  let sourceMedia = null;
  let sourceBaseDir = resolve(projectDir);

  if (effectiveFormat === 'folder' || effectiveFormat === 'files') {
    if (sources.length === 0) throw new Error('导入来源不能为空');
    files = await collectFileEntries(sources, effectiveFormat === 'folder', maxItems, warn);
    if (files.length === 0) {
      warn({ code: 'no-files', message: '没有找到可导入的媒体或文本文件。' });
    }
  } else if (effectiveFormat === 'media') {
    textFile = sources[0] ?? null;
    if (!textFile) throw new Error('导入来源不能为空');
    sourceBaseDir = dirname(resolve(textFile));
    const ext = extOf(textFile);
    if (TEXT_EXT_SET.has(ext)) {
      try {
        text = await readFile(textFile, 'utf8');
      } catch (error) {
        warn({ code: 'read-failed', message: `无法读取文本文件 ${textFile}：${error.code ?? error.message}` });
      }
    }
  } else if (effectiveFormat === 'srt' || effectiveFormat === 'vtt') {
    textFile = sources[0] ?? null;
    if (!textFile) throw new Error('导入来源不能为空');
    sourceBaseDir = dirname(resolve(textFile));
    try {
      text = await readFile(textFile, 'utf8');
    } catch (error) {
      throw new Error(`无法读取字幕文件：${textFile}（${error.code ?? error.message}）`);
    }
    sourceMedia = await findSubtitleSiblingMedia(textFile);
  } else {
    textFile = sources[0] ?? null;
    if (!textFile) throw new Error('导入来源不能为空');
    sourceBaseDir = dirname(resolve(textFile));
    try {
      text = await readFile(textFile, 'utf8');
    } catch (error) {
      throw new Error(`无法读取导入文件：${textFile}（${error.code ?? error.message}）`);
    }
  }

  let existingIds = [];
  try {
    const existingItems = await readJsonl(join(projectDir, 'items.jsonl'));
    existingIds = existingItems
      .map((entry) => (isPlainObject(entry) ? entry.id : undefined))
      .filter((id) => typeof id === 'string' && id !== '');
  } catch (error) {
    warn({ code: 'read-existing-failed', message: `读取已有条目失败，将不检查重复 id：${error.message}` });
  }

  const built = buildImportRecords({
    format: effectiveFormat,
    source: textFile ?? sources[0] ?? '',
    text,
    files,
    mapping,
    template: project?.template ?? 'custom',
    itemsExisting: existingIds,
    limits: { maxItems },
    sourceMedia,
  });
  warnings.push(...built.warnings);

  const items = [];
  const mediaFiles = [];
  const missingMedia = [];
  const usedNames = new Set();
  const copiedMedia = new Map();

  for (const record of built.records) {
    const item = {
      id: record.id,
      kind: record.kind,
      media: [],
      payload: isPlainObject(record.payload) ? cloneJson(record.payload) ?? {} : {},
      meta: normalizeMeta(record.meta),
      batch: record.batch ?? null,
      tags: Array.isArray(record.tags) ? record.tags.map((entry) => String(entry)) : [],
      priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : 0,
      createdAt: typeof record.createdAt === 'string' && record.createdAt !== '' ? record.createdAt : nowIso(),
    };
    const seenPaths = new Set();
    const entries = Array.isArray(record.media) ? record.media : [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const rawPath = typeof entry === 'string' ? entry : String(entry?.path ?? '');
      if (rawPath === '') continue;
      const sourceHint = typeof entry?.sourcePath === 'string' && entry.sourcePath !== '' ? entry.sourcePath : undefined;
      const resolution = await resolveMediaSource({ rawPath, sourceHint, projectDir, sourceBaseDir });
      if (!resolution) {
        missingMedia.push({ itemId: item.id, index, path: rawPath });
        warn({ code: 'missing-media', itemId: item.id, message: `条目 ${item.id} 的媒体文件不存在：${rawPath}` });
        if (!seenPaths.has(rawPath)) {
          seenPaths.add(rawPath);
          item.media.push({ path: rawPath, mime: guessMime(rawPath) });
        }
        continue;
      }
      if (isInside(projectDir, resolution.absPath)) {
        const relative = relativeInside(projectDir, resolution.absPath);
        if (!seenPaths.has(relative)) {
          seenPaths.add(relative);
          item.media.push({ path: relative, mime: guessMime(resolution.absPath) });
        }
        continue;
      }
      if (!copyMedia) {
        warn({
          code: 'external-media',
          itemId: item.id,
          message: `媒体文件不在项目目录内，已保留绝对路径：${resolution.absPath}`,
        });
        if (!seenPaths.has(resolution.absPath)) {
          seenPaths.add(resolution.absPath);
          item.media.push({ path: resolution.absPath, mime: guessMime(resolution.absPath) });
        }
        continue;
      }
      try {
        const cached = copiedMedia.get(resolution.absPath);
        const copied = cached ?? await copyMediaFile({ projectDir, sourceAbs: resolution.absPath, usedNames });
        if (!cached) copiedMedia.set(resolution.absPath, copied);
        const relative = relativeInside(projectDir, copied.absPath);
        if (!seenPaths.has(relative)) {
          seenPaths.add(relative);
          const mime = guessMime(copied.absPath);
          item.media.push({ path: relative, mime });
          if (!mediaFiles.some((entryFile) => entryFile.path === relative)) {
            mediaFiles.push({ path: relative, name: copied.name, mime, size: copied.size, copied: copied.copied });
          }
        }
      } catch (error) {
        warn({
          code: 'media-copy-failed',
          itemId: item.id,
          message: `复制媒体文件失败（${resolution.absPath}）：${error.code ?? error.message}，已保留源路径。`,
        });
        if (!seenPaths.has(resolution.absPath)) {
          seenPaths.add(resolution.absPath);
          item.media.push({ path: resolution.absPath, mime: guessMime(resolution.absPath) });
        }
      }
    }
    items.push(item);
  }

  return {
    imported: items.length,
    skipped: built.skipped,
    warnings,
    items,
    mediaFiles,
    missingMedia,
  };
}
