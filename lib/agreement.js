/**
 * Inter-annotator agreement and gold-standard accuracy.
 *
 * `computeAgreement` is defensive: missing annotations, empty label objects,
 * invalid field values, unknown schema fields and empty gold sets are handled
 * without throwing. Scores are in 0..1; `null` means "not enough comparable
 * data".
 *
 * Supported metrics:
 * - categorical (text / textarea / select / multiselect / boolean / tags / json):
 *   mean pairwise percent agreement, plus the mode share per item and Cohen's
 *   kappa when exactly two annotators are involved.
 * - number / rating: 1 - normalized mean absolute difference.
 * - segments / bbox: greedy matching by text or label, then mean temporal /
 *   spatial IoU.
 * - spans: boundary F1 over exact `(start, end)` boundaries.
 * - gold: accuracy per field with type-specific tolerance (categorical exact,
 *   numeric within tolerance, segments/bbox IoU >= 0.5, spans F1 >= 0.5).
 *
 * @module @local/annotation-workbench/lib/agreement
 */

const FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'select', 'multiselect', 'boolean',
  'rating', 'tags', 'segments', 'bbox', 'spans', 'json',
]);

const CATEGORICAL_TYPES = new Set(['text', 'textarea', 'select', 'multiselect', 'boolean', 'tags', 'json']);

const GOLD_IOU_THRESHOLD = 0.5;
const GOLD_F1_THRESHOLD = 0.5;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function schemaFields(schema) {
  if (Array.isArray(schema)) return schema.filter((field) => isPlainObject(field));
  if (isPlainObject(schema) && Array.isArray(schema.fields)) return schema.fields.filter((field) => isPlainObject(field));
  return [];
}

function fieldId(field, index) {
  return typeof field?.id === 'string' && field.id.trim() !== '' ? field.id.trim() : `field_${index}`;
}

function timestampValue(ts) {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Stable canonical string for a JSON-ish value (bounded recursion). */
function canonical(value, depth = 0) {
  try {
    return JSON.stringify(sortValue(value, depth));
  } catch {
    return String(value);
  }
}

function sortValue(value, depth) {
  if (depth > 8) return String(value);
  if (Array.isArray(value)) return value.map((entry) => sortValue(entry, depth + 1));
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key], depth + 1);
    return out;
  }
  return value;
}

/** Canonical value used for categorical comparison (sets are order-insensitive). */
function canonicalValue(value, type) {
  if ((type === 'multiselect' || type === 'tags') && Array.isArray(value)) {
    return JSON.stringify([...new Set(value.map((entry) => String(entry)))].sort());
  }
  return canonical(value);
}

/** Build `Map<itemId, Map<actorKey, {labels, status, ts}>>` with materialization. */
function normalizeAnnotations(annotations) {
  const byItem = new Map();
  let anonymous = 0;

  const addEntry = (itemId, entry) => {
    if (typeof itemId !== 'string' || itemId === '' || !isPlainObject(entry)) return;
    const labels = isPlainObject(entry.labels) ? entry.labels : {};
    let actorKey = typeof entry.actorId === 'string' && entry.actorId !== '' ? entry.actorId : '';
    if (actorKey === '') {
      if (typeof entry.actorName === 'string' && entry.actorName !== '') actorKey = `name:${entry.actorName}`;
      else {
        anonymous += 1;
        actorKey = `anonymous:${anonymous}`;
      }
    }
    const actorMap = byItem.get(itemId) ?? new Map();
    const list = actorMap.get(actorKey) ?? [];
    list.push({
      actorKey,
      labels,
      status: typeof entry.status === 'string' ? entry.status : 'submitted',
      ts: entry.ts,
      order: list.length,
    });
    actorMap.set(actorKey, list);
    byItem.set(itemId, actorMap);
  };

  if (annotations instanceof Map) {
    for (const [itemId, value] of annotations.entries()) {
      for (const entry of asArray(value)) addEntry(itemId, entry);
    }
  } else if (Array.isArray(annotations)) {
    for (const entry of annotations) {
      if (isPlainObject(entry) && typeof entry.itemId === 'string') addEntry(entry.itemId, entry);
    }
  } else if (isPlainObject(annotations)) {
    for (const [itemId, value] of Object.entries(annotations)) {
      if (Array.isArray(value)) for (const entry of value) addEntry(itemId, entry);
      else addEntry(itemId, value);
    }
  }

  for (const actorMap of byItem.values()) {
    for (const [actorKey, list] of [...actorMap.entries()]) {
      list.sort((left, right) => {
        const diff = timestampValue(left.ts) - timestampValue(right.ts);
        return diff !== 0 ? diff : left.order - right.order;
      });
      let chosen = null;
      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (list[index].status === 'submitted') {
          chosen = list[index];
          break;
        }
      }
      if (!chosen) {
        for (let index = list.length - 1; index >= 0; index -= 1) {
          if (list[index].status !== 'skipped') {
            chosen = list[index];
            break;
          }
        }
      }
      if (!chosen) actorMap.delete(actorKey);
      else actorMap.set(actorKey, chosen);
    }
  }
  return byItem;
}

/** Normalize gold input (array of lines or a map) into `[{itemId, labels}]`. */
function normalizeGold(gold) {
  const out = [];
  const push = (itemId, labels) => {
    if (typeof itemId !== 'string' || itemId === '') return;
    let value = labels;
    if (isPlainObject(labels) && isPlainObject(labels.labels)) value = labels.labels;
    if (isPlainObject(value)) out.push({ itemId, labels: value });
  };
  if (Array.isArray(gold)) {
    for (const entry of gold) {
      if (isPlainObject(entry)) push(entry.itemId, entry.labels);
    }
  } else if (gold instanceof Map) {
    for (const [itemId, value] of gold.entries()) push(itemId, value);
  } else if (isPlainObject(gold)) {
    for (const [itemId, value] of Object.entries(gold)) push(itemId, value);
  }
  return out;
}

function resolveItemIds(items, annotations) {
  const ids = [];
  const seen = new Set();
  const add = (id) => {
    if (typeof id !== 'string' || id === '' || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const item of asArray(items)) {
    if (typeof item === 'string') add(item);
    else if (isPlainObject(item) && item.id !== undefined) add(String(item.id));
  }
  for (const itemId of annotations.keys()) add(itemId);
  return ids;
}

function normalizeType(type) {
  return typeof type === 'string' && FIELD_TYPES.has(type) ? type : null;
}

/** Infer a field type from observed label values. */
function inferType(values) {
  const flat = asArray(values).filter((value) => value !== undefined && value !== null);
  if (flat.length === 0) return 'text';
  if (flat.every((value) => isFiniteNumber(value))) return 'number';
  if (flat.every((value) => typeof value === 'boolean')) return 'boolean';
  if (flat.every((value) => typeof value === 'string')) return 'text';
  if (flat.every((value) => Array.isArray(value))) {
    const samples = flat.flat().filter((entry) => isPlainObject(entry));
    if (samples.length > 0) {
      if (samples.every((sample) => ['x', 'y', 'w', 'h'].every((axis) => isFiniteNumber(sample[axis])))) return 'bbox';
      if (samples.every((sample) => isFiniteNumber(sample.start) && isFiniteNumber(sample.end))) {
        const hasText = samples.some((sample) => typeof sample.text === 'string' && sample.text !== '');
        return hasText ? 'segments' : 'spans';
      }
    }
    const strings = flat.flat().filter((entry) => typeof entry === 'string');
    if (strings.length > 0) return 'multiselect';
    return 'json';
  }
  return 'json';
}

function isPresentByType(value, type) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (type === 'number' || type === 'rating') return isFiniteNumber(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (Array.isArray(value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'object') return true;
  return true;
}

function isSegmentEntry(value) {
  return isPlainObject(value) && isFiniteNumber(Number(value.start)) && isFiniteNumber(Number(value.end)) && Number(value.end) > Number(value.start);
}

function normalizeSegment(entry) {
  if (!isSegmentEntry(entry)) return null;
  return {
    start: Number(entry.start),
    end: Number(entry.end),
    text: typeof entry.text === 'string' ? entry.text.trim() : '',
    label: typeof entry.label === 'string' ? entry.label.trim() : '',
  };
}

function normalizeBboxEntry(entry) {
  if (!isPlainObject(entry)) return null;
  const axes = ['x', 'y', 'w', 'h'];
  for (const axis of axes) if (!isFiniteNumber(Number(entry[axis]))) return null;
  const bbox = { x: Number(entry.x), y: Number(entry.y), w: Number(entry.w), h: Number(entry.h) };
  if (bbox.w <= 0 || bbox.h <= 0) return null;
  return {
    ...bbox,
    text: typeof entry.text === 'string' ? entry.text.trim() : '',
    label: typeof entry.label === 'string' ? entry.label.trim() : '',
  };
}

function sameIdentity(left, right) {
  if (left.text !== '' && right.text !== '' && left.text === right.text) return true;
  if (left.label !== '' && right.label !== '' && left.label === right.label) return true;
  return false;
}function intervalIoU(left, right) {
  const intersection = Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
  const union = Math.max(left.end, right.end) - Math.min(left.start, right.start);
  return union > 0 ? intersection / union : 0;
}

function bboxIoU(left, right) {
  const interWidth = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const interHeight = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  const intersection = interWidth * interHeight;
  const union = left.w * left.h + right.w * right.h - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Greedy IoU matching between two segment or bbox lists: entries are only
 * matched when their text or label identity agrees, then the best IoU wins.
 */
function matchObjects(type, leftValue, rightValue) {
  const normalizer = type === 'bbox' ? normalizeBboxEntry : normalizeSegment;
  const iouOf = type === 'bbox' ? bboxIoU : intervalIoU;
  const left = asArray(leftValue).map(normalizer).filter(Boolean);
  const right = asArray(rightValue).map(normalizer).filter(Boolean);
  left.sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  right.sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  const usedRight = new Set();
  let matched = 0;
  let iouSum = 0;
  for (const entry of left) {
    let bestIndex = -1;
    let bestIou = 0;
    for (let index = 0; index < right.length; index += 1) {
      if (usedRight.has(index)) continue;
      if (!sameIdentity(entry, right[index])) continue;
      const iou = iouOf(entry, right[index]);
      if (bestIndex === -1 || iou > bestIou) {
        bestIndex = index;
        bestIou = iou;
      }
    }
    if (bestIndex !== -1) {
      usedRight.add(bestIndex);
      matched += 1;
      iouSum += bestIou;
    }
  }
  const denominator = Math.max(left.length, right.length);
  return {
    score: denominator === 0 ? 1 : iouSum / denominator,
    iouSum,
    matched,
    countA: left.length,
    countB: right.length,
  };
}

function normalizeSpanBoundaries(value) {
  const boundaries = new Set();
  for (const entry of asArray(value)) {
    if (!isPlainObject(entry)) continue;
    const start = Number(entry.start);
    const end = Number(entry.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    boundaries.add(`${start}:${end}`);
  }
  return boundaries;
}

function spansBoundaryF1(leftValue, rightValue) {
  const left = normalizeSpanBoundaries(leftValue);
  const right = normalizeSpanBoundaries(rightValue);
  if (left.size === 0 && right.size === 0) return { precision: 1, recall: 1, f1: 1 };
  let matched = 0;
  for (const boundary of left) if (right.has(boundary)) matched += 1;
  const precision = right.size > 0 ? matched / right.size : 0;
  const recall = left.size > 0 ? matched / left.size : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function numericRange(def, observed) {
  const field = isPlainObject(def.field) ? def.field : {};
  if (isFiniteNumber(field.min) && isFiniteNumber(field.max) && field.max > field.min) {
    return field.max - field.min;
  }
  const finite = observed.filter((value) => isFiniteNumber(value));
  if (finite.length === 0) return 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return Math.max(0, max - min);
}

function cohenKappa(pairList) {
  const total = pairList.length;
  if (total === 0) return null;
  const leftCounts = new Map();
  const rightCounts = new Map();
  let agreed = 0;
  for (const [left, right] of pairList) {
    if (left === right) agreed += 1;
    leftCounts.set(left, (leftCounts.get(left) ?? 0) + 1);
    rightCounts.set(right, (rightCounts.get(right) ?? 0) + 1);
  }
  const observed = agreed / total;
  let expected = 0;
  const categories = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  for (const category of categories) {
    expected += ((leftCounts.get(category) ?? 0) / total) * ((rightCounts.get(category) ?? 0) / total);
  }
  if (expected >= 1) return observed === 1 ? 1 : 0;
  return (observed - expected) / (1 - expected);
}

function computeField(def, itemIds, normalized, comparedItems) {
  const type = def.type;
  const perItem = [];
  const actorKeys = new Set();
  const observedNumbers = [];
  for (const itemId of itemIds) {
    const actors = normalized.get(itemId);
    if (!actors || actors.size < 2) continue;
    const entries = [];
    for (const [actorKey, annotation] of actors) {
      const value = annotation.labels[def.id];
      if (!isPresentByType(value, type)) continue;
      entries.push({ actorKey, value });
      actorKeys.add(actorKey);
      if (type === 'number' || type === 'rating') observedNumbers.push(Number(value));
    }
    if (entries.length >= 2) perItem.push({ itemId, entries });
  }

  const range = type === 'number' || type === 'rating' ? numericRange(def, observedNumbers) : 0;
  let pairs = 0;
  let itemCount = 0;
  let pairScoreSum = 0;
  let modeShareSum = 0;
  let modeShareCount = 0;
  let numericDiffSum = 0;
  let numericDiffCount = 0;
  let matchedSum = 0;
  let countASum = 0;
  let countBSum = 0;
  let precisionSum = 0;
  let recallSum = 0;
  const categoricalPairs = [];

  for (const { itemId, entries } of perItem) {
    itemCount += 1;
    if (CATEGORICAL_TYPES.has(type)) {
      const counts = new Map();
      for (const entry of entries) {
        const key = canonicalValue(entry.value, type);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let mode = 0;
      for (const count of counts.values()) mode = Math.max(mode, count);
      modeShareSum += mode / entries.length;
      modeShareCount += 1;
    }
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        pairs += 1;
        const leftValue = entries[left].value;
        const rightValue = entries[right].value;
        if (type === 'segments' || type === 'bbox') {
          const match = matchObjects(type, leftValue, rightValue);
          pairScoreSum += match.score;
          matchedSum += match.matched;
          countASum += match.countA;
          countBSum += match.countB;
          comparedItems.add(itemId);
        } else if (type === 'spans') {
          const result = spansBoundaryF1(leftValue, rightValue);
          pairScoreSum += result.f1;
          precisionSum += result.precision;
          recallSum += result.recall;
          comparedItems.add(itemId);
        } else if (type === 'number' || type === 'rating') {
          const diff = Math.abs(Number(leftValue) - Number(rightValue));
          numericDiffSum += diff;
          numericDiffCount += 1;
          const normalizedScore = range > 0 ? Math.max(0, 1 - diff / range) : (diff === 0 ? 1 : 0);
          pairScoreSum += normalizedScore;
          comparedItems.add(itemId);
        } else {
          const leftKey = canonicalValue(leftValue, type);
          const rightKey = canonicalValue(rightValue, type);
          categoricalPairs.push([leftKey, rightKey]);
          pairScoreSum += leftKey === rightKey ? 1 : 0;
          comparedItems.add(itemId);
        }
      }
    }
  }

  const score = pairs > 0 ? pairScoreSum / pairs : null;
  const detail = { items: itemCount, pairs, actors: actorKeys.size };
  if (type === 'segments' || type === 'bbox') {
    detail.matched = matchedSum;
    detail.countA = countASum;
    detail.countB = countBSum;
  } else if (type === 'spans') {
    detail.precision = pairs > 0 ? precisionSum / pairs : null;
    detail.recall = pairs > 0 ? recallSum / pairs : null;
  } else if (type === 'number' || type === 'rating') {
    detail.meanAbsDiff = numericDiffCount > 0 ? numericDiffSum / numericDiffCount : null;
    detail.range = range;
  } else {
    detail.percent = score;
    detail.modeShare = modeShareCount > 0 ? modeShareSum / modeShareCount : null;
    detail.kappa = actorKeys.size === 2 ? cohenKappa(categoricalPairs) : null;
  }
  return { field: def.id, type, pairs, score, detail };
}

function pickGoldAnnotationLabels(actorMap) {
  if (!actorMap || actorMap.size === 0) return {};
  const list = [...actorMap.values()].sort((left, right) => timestampValue(left.ts) - timestampValue(right.ts));
  for (const annotation of list) {
    if (annotation.status === 'submitted') return annotation.labels;
  }
  return list.length > 0 ? list[list.length - 1].labels : {};
}

function numericTolerance(def, expected) {
  if (isFiniteNumber(def.field?.tolerance)) return Math.abs(Number(def.field.tolerance));
  if (def.type === 'rating') return 0;
  const value = Number(expected);
  return Math.max(1e-6, Math.abs(Number.isFinite(value) ? value : 1) * 1e-6);
}

function goldMatch(def, actual, expected) {
  const type = def.type;
  if (type === 'number' || type === 'rating') {
    if (!isFiniteNumber(actual) || !isFiniteNumber(expected)) return false;
    return Math.abs(actual - expected) <= numericTolerance(def, expected);
  }
  if (type === 'segments') return matchObjects('segments', actual, expected).score >= GOLD_IOU_THRESHOLD;
  if (type === 'bbox') return matchObjects('bbox', actual, expected).score >= GOLD_IOU_THRESHOLD;
  if (type === 'spans') return spansBoundaryF1(actual, expected).f1 >= GOLD_F1_THRESHOLD;
  return canonicalValue(actual, type) === canonicalValue(expected, type);
}

function computeGold(goldEntries, normalized, fieldDefs) {
  const stats = new Map();
  const orderedFields = [...fieldDefs.keys()];
  let compared = 0;
  for (const entry of goldEntries) {
    if (!isPlainObject(entry.labels) || Object.keys(entry.labels).length === 0) continue;
    const annLabels = pickGoldAnnotationLabels(normalized.get(entry.itemId));
    let hasGoldValue = false;
    for (const field of orderedFields) {
      const expected = entry.labels[field];
      const def = fieldDefs.get(field);
      if (!isPresentByType(expected, def.type)) continue;
      hasGoldValue = true;
      const stat = stats.get(field) ?? { correct: 0, total: 0 };
      stat.total += 1;
      const actual = annLabels[field];
      if (isPresentByType(actual, def.type) && goldMatch(def, actual, expected)) stat.correct += 1;
      stats.set(field, stat);
    }
    if (hasGoldValue) compared += 1;
  }
  const fields = [];
  for (const field of orderedFields) {
    const stat = stats.get(field);
    if (!stat || stat.total === 0) continue;
    fields.push({
      field,
      correct: stat.correct,
      total: stat.total,
      score: stat.total > 0 ? stat.correct / stat.total : null,
    });
  }
  return { items: compared, fields };
}

/**
 * Compute per-field agreement and (when gold is provided) gold accuracy.
 *
 * @param {{
 *   items?: Array<{id: string}|string>,
 *   annotations?: Map<string, Array<object>>|Record<string, Array<object>>|Array<object>,
 *   schema?: {fields: Array<object>}|Array<object>,
 *   gold?: Array<object>|Record<string, object>|Map<string, object>|null,
 * }} options
 * @returns {{
 *   itemsCompared: number,
 *   fields: Array<{field: string, type: string, pairs: number, score: number|null, detail: object}>,
 *   overall: number|null,
 *   gold: {items: number, fields: Array<{field: string, correct: number, total: number, score: number|null}>}|null,
 * }}
 */
export function computeAgreement({ items, annotations, schema, gold } = {}) {
  const normalized = normalizeAnnotations(annotations);
  const itemIds = resolveItemIds(items, normalized);
  const fieldDefs = new Map();
  const addFieldDef = (id, type, field) => {
    if (typeof id !== 'string' || id === '') return;
    const normalizedType = normalizeType(type) ?? 'json';
    const existing = fieldDefs.get(id);
    if (!existing) fieldDefs.set(id, { id, type: normalizedType, field: field ?? null });
    else if (!existing.field && field) existing.field = field;
  };

  const schemaFieldList = schemaFields(schema);
  for (let index = 0; index < schemaFieldList.length; index += 1) {
    const field = schemaFieldList[index];
    addFieldDef(fieldId(field, index), field.type, field);
  }

  // Discover fields that exist in labels but not in the schema.
  const valueBuckets = new Map();
  for (const itemId of itemIds) {
    const actors = normalized.get(itemId);
    if (!actors) continue;
    for (const annotation of actors.values()) {
      for (const [key, value] of Object.entries(annotation.labels)) {
        if (value === undefined || value === null) continue;
        const bucket = valueBuckets.get(key) ?? [];
        bucket.push(value);
        valueBuckets.set(key, bucket);
      }
    }
  }
  for (const [key, values] of valueBuckets) {
    if (!fieldDefs.has(key)) addFieldDef(key, inferType(values), null);
  }

  const goldEntries = normalizeGold(gold);
  if (goldEntries.length > 0) {
    const goldBuckets = new Map();
    for (const entry of goldEntries) {
      for (const [key, value] of Object.entries(entry.labels)) {
        if (value === undefined || value === null) continue;
        const bucket = goldBuckets.get(key) ?? [];
        bucket.push(value);
        goldBuckets.set(key, bucket);
      }
    }
    for (const [key, values] of goldBuckets) {
      if (!fieldDefs.has(key)) addFieldDef(key, inferType(values), null);
    }
  }

  const comparedItems = new Set();
  const fields = [];
  let weightedScore = 0;
  let weightSum = 0;
  for (const def of fieldDefs.values()) {
    const result = computeField(def, itemIds, normalized, comparedItems);
    fields.push(result);
    if (result.pairs > 0 && typeof result.score === 'number') {
      weightedScore += result.score * result.pairs;
      weightSum += result.pairs;
    }
  }

  return {
    itemsCompared: comparedItems.size,
    fields,
    overall: weightSum > 0 ? weightedScore / weightSum : null,
    gold: goldEntries.length > 0 ? computeGold(goldEntries, normalized, fieldDefs) : null,
  };
}
