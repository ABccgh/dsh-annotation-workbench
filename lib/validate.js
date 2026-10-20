/**
 * Validation for annotation labels and project schemas.
 *
 * `validateLabels` never throws for ordinary data: malformed labels produce
 * `errors`; recoverable oddities produce `warnings`. Drafts use
 * `allowIncomplete: true`, which keeps structural checks but skips required
 * checks.
 *
 * Only `./util.js` and `node:*` modules may be imported here.
 *
 * @module @local/annotation-workbench/lib/validate
 */

/** Field types defined by the data model. */
const FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'select', 'multiselect', 'boolean',
  'rating', 'tags', 'segments', 'bbox', 'spans', 'json',
]);

/** Item kinds accepted by the data model. */
const ITEM_KINDS = new Set(['text', 'image', 'video', 'audio', 'llm', 'document']);

/** Tolerance for floating point comparisons on normalized coordinates. */
const EPSILON = 1e-9;

/** One millisecond clock tolerance for `end <= duration` checks. */
const DURATION_TOLERANCE_SECONDS = 0.5;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Read schema fields, tolerating `{fields: []}` and bare arrays. */
function schemaFields(schema) {
  if (Array.isArray(schema)) return schema.filter((field) => isPlainObject(field));
  if (isPlainObject(schema) && Array.isArray(schema.fields)) {
    return schema.fields.filter((field) => isPlainObject(field));
  }
  return null;
}

function fieldId(field, index) {
  return typeof field?.id === 'string' && field.id.trim() !== '' ? field.id.trim() : `field_${index}`;
}

function optionValues(field) {
  if (!Array.isArray(field?.options)) return null;
  const values = [];
  for (const option of field.options) {
    if (!isPlainObject(option)) continue;
    if (option.value === undefined || option.value === null) continue;
    values.push(String(option.value));
  }
  return values;
}

/** Values treated as "not provided" for required checks. */
function isMissingValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
}

function itemDurationSeconds(item) {
  const meta = isPlainObject(item?.meta) ? item.meta : {};
  if (isFiniteNumber(meta.durationMs) && meta.durationMs > 0) return meta.durationMs / 1000;
  if (isFiniteNumber(meta.duration) && meta.duration > 0) return meta.duration;
  if (isFiniteNumber(item?.durationMs) && item.durationMs > 0) return item.durationMs / 1000;
  return null;
}

function fieldApplies(field, item) {
  const when = field?.when;
  if (!isPlainObject(when)) return true;
  const raw = when.kind;
  const kinds = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
  if (kinds.length === 0) return true;
  const itemKind = typeof item?.kind === 'string' ? item.kind : '';
  if (itemKind === '') return true;
  return kinds.map((kind) => String(kind)).includes(itemKind);
}

/**
 * Validate one set of labels against a project schema.
 *
 * @param {{
 *   schema?: object|Array,
 *   item?: object,
 *   labels?: object,
 *   project?: object,
 *   allowIncomplete?: boolean,
 * }} options
 * @returns {{ok: boolean, errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}>}}
 */
export function validateLabels({ schema, item, labels, project, allowIncomplete = false } = {}) {
  const errors = [];
  const warnings = [];
  const pushError = (field, message) => errors.push({ field: String(field ?? ''), message });
  const pushWarning = (field, message) => warnings.push({ field: String(field ?? ''), message });

  const fields = schemaFields(schema);
  if (fields === null) {
    pushError('schema', 'schema 必须包含 fields 数组。');
    return { ok: false, errors, warnings };
  }
  const labelObject = isPlainObject(labels) ? labels : {};
  if (labels !== undefined && labels !== null && !isPlainObject(labels)) {
    pushError('labels', 'labels 必须是对象。');
  }
  const duration = itemDurationSeconds(item);
  const projectSettings = isPlainObject(project?.settings) ? project.settings : {};
  const allowGaps = projectSettings.allowGaps !== false;
  const knownFields = new Set();

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const id = fieldId(field, index);
    knownFields.add(id);
    if (!fieldApplies(field, item)) continue;
    const type = typeof field.type === 'string' ? field.type : '';
    const required = field.required === true;
    const value = labelObject[id];
    if (isMissingValue(value)) {
      if (required && allowIncomplete !== true) pushError(id, '必填字段不能为空。');
      continue;
    }
    const context = { id, field, item, duration, allowGaps, allowIncomplete: allowIncomplete === true, pushError, pushWarning };
    switch (type) {
      case 'text':
      case 'textarea':
        if (typeof value !== 'string') pushError(id, '必须是文本。');
        break;
      case 'number':
        validateNumber(context, value);
        break;
      case 'select':
        validateSelect(context, value);
        break;
      case 'multiselect':
        validateMultiselect(context, value);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') pushError(id, '必须是布尔值。');
        break;
      case 'rating':
        validateRating(context, value);
        break;
      case 'tags':
        validateTags(context, value);
        break;
      case 'segments':
        validateSegments(context, value);
        break;
      case 'bbox':
        validateBbox(context, value);
        break;
      case 'spans':
        validateSpans(context, value);
        break;
      case 'json':
        validateJsonValue(context, value);
        break;
      default:
        pushWarning(id, `未知字段类型：${JSON.stringify(field.type)}。`);
    }
  }

  for (const [key, value] of Object.entries(labelObject)) {
    if (knownFields.has(key)) continue;
    if (isMissingValue(value)) continue;
    pushWarning(key, 'schema 中没有该字段，导出时会保留。');
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateNumber(context, value) {
  const { id, field, pushError } = context;
  if (!isFiniteNumber(value)) {
    pushError(id, '必须是数字。');
    return;
  }
  if (isFiniteNumber(field.min) && value < field.min) pushError(id, `不能小于 ${field.min}。`);
  if (isFiniteNumber(field.max) && value > field.max) pushError(id, `不能大于 ${field.max}。`);
}

function validateSelect(context, value) {
  const { id, field, pushError } = context;
  if (typeof value !== 'string' && typeof value !== 'number') {
    pushError(id, '必须是选项值。');
    return;
  }
  const options = optionValues(field);
  if (options && options.length > 0 && !options.includes(String(value))) {
    pushError(id, `不是有效选项：${JSON.stringify(value)}。`);
  }
}

function validateMultiselect(context, value) {
  const { id, field, pushError, pushWarning } = context;
  if (!Array.isArray(value)) {
    pushError(id, '必须是字符串数组。');
    return;
  }
  const options = optionValues(field);
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      pushError(id, '数组元素必须是字符串。');
      continue;
    }
    if (seen.has(entry)) pushWarning(id, `选项重复：${entry}。`);
    seen.add(entry);
    if (options && options.length > 0 && !options.includes(entry)) {
      pushError(id, `不是有效选项：${JSON.stringify(entry)}。`);
    }
  }
}

function validateRating(context, value) {
  const { id, field, pushError } = context;
  if (!isFiniteNumber(value)) {
    pushError(id, '评分必须是数字。');
    return;
  }
  const min = isFiniteNumber(field.min) ? field.min : 1;
  const max = isFiniteNumber(field.max) ? field.max : 5;
  if (value < min || value > max) pushError(id, `评分必须在 ${min} 到 ${max} 之间。`);
}

function validateTags(context, value) {
  const { id, pushError, pushWarning } = context;
  if (!Array.isArray(value)) {
    pushError(id, '必须是字符串数组。');
    return;
  }
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      pushError(id, '数组元素必须是字符串。');
      continue;
    }
    if (entry.trim() === '') {
      pushError(id, '标签不能为空字符串。');
      continue;
    }
    if (seen.has(entry)) pushWarning(id, `标签重复：${entry}。`);
    seen.add(entry);
  }
}

function labelInOptions(context, label) {
  const options = optionValues(context.field);
  if (!options || options.length === 0 || label === undefined || label === null || label === '') return true;
  return options.includes(String(label));
}

function validateSegments(context, value) {
  const { id, field, duration, allowGaps, allowIncomplete, pushError, pushWarning } = context;
  if (!Array.isArray(value)) {
    pushError(id, '必须是分段数组。');
    return;
  }
  const valid = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isPlainObject(entry)) {
      pushError(id, `第 ${index + 1} 段必须是对象。`);
      continue;
    }
    const start = entry.start;
    const end = entry.end;
    if (!isFiniteNumber(start)) {
      pushError(id, `第 ${index + 1} 段的 start 必须是数字。`);
      continue;
    }
    if (!isFiniteNumber(end)) {
      pushError(id, `第 ${index + 1} 段的 end 必须是数字。`);
      continue;
    }
    if (start < 0) pushError(id, `第 ${index + 1} 段的 start 不能小于 0。`);
    if (end <= start) pushError(id, `第 ${index + 1} 段的 end 必须大于 start。`);
    if (duration !== null && end > duration + DURATION_TOLERANCE_SECONDS) {
      pushError(id, `第 ${index + 1} 段的结束时间超出媒体时长。`);
    }
    if (typeof entry.text !== 'string') {
      pushError(id, `第 ${index + 1} 段的 text 必须是字符串。`);
    } else if (field.required === true && allowIncomplete !== true && entry.text.trim() === '') {
      pushError(id, `第 ${index + 1} 段的字幕文本不能为空。`);
    }
    if (entry.label !== undefined && typeof entry.label !== 'string') {
      pushError(id, `第 ${index + 1} 段的 label 必须是字符串。`);
    } else if (!labelInOptions(context, entry.label)) {
      pushWarning(id, `第 ${index + 1} 段的标签不在选项内：${JSON.stringify(entry.label)}。`);
    }
    if (isFiniteNumber(start) && isFiniteNumber(end) && end > start) valid.push({ start, end, index });
  }

  valid.sort((left, right) => left.start - right.start);
  let overlaps = 0;
  for (let index = 1; index < valid.length; index += 1) {
    const previous = valid[index - 1];
    const current = valid[index];
    if (current.start < previous.end - EPSILON) {
      overlaps += 1;
      if (overlaps <= 5) {
        pushError(id, `第 ${previous.index + 1} 段与第 ${current.index + 1} 段时间重叠。`);
      }
    }
  }
  if (overlaps > 5) pushError(id, `共有 ${overlaps} 处时间段重叠。`);
  if (allowGaps === false) {
    for (let index = 1; index < valid.length; index += 1) {
      const previous = valid[index - 1];
      const current = valid[index];
      if (current.start > previous.end + 0.05) {
        pushWarning(id, `第 ${previous.index + 1} 段与第 ${current.index + 1} 段之间存在空档。`);
        break;
      }
    }
  }
}

function validateBbox(context, value) {
  const { id, pushError, pushWarning } = context;
  if (!Array.isArray(value)) {
    pushError(id, '必须是标注框数组。');
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isPlainObject(entry)) {
      pushError(id, `第 ${index + 1} 个框必须是对象。`);
      continue;
    }
    const axes = ['x', 'y', 'w', 'h'];
    const numbers = {};
    let validNumbers = true;
    for (const axis of axes) {
      if (!isFiniteNumber(entry[axis])) {
        pushError(id, `第 ${index + 1} 个框的 ${axis} 必须是数字。`);
        validNumbers = false;
      } else {
        numbers[axis] = entry[axis];
      }
    }
    if (!validNumbers) continue;
    if (numbers.x < 0 || numbers.x > 1) pushError(id, `第 ${index + 1} 个框的 x 必须在 0 到 1 之间。`);
    if (numbers.y < 0 || numbers.y > 1) pushError(id, `第 ${index + 1} 个框的 y 必须在 0 到 1 之间。`);
    if (numbers.w <= 0) pushError(id, `第 ${index + 1} 个框的 w 必须大于 0。`);
    if (numbers.h <= 0) pushError(id, `第 ${index + 1} 个框的 h 必须大于 0。`);
    if (numbers.x + numbers.w > 1.0001) pushError(id, `第 ${index + 1} 个框超出右边界（x + w > 1）。`);
    if (numbers.y + numbers.h > 1.0001) pushError(id, `第 ${index + 1} 个框超出下边界（y + h > 1）。`);
    if (entry.label !== undefined && typeof entry.label !== 'string') {
      pushError(id, `第 ${index + 1} 个框的 label 必须是字符串。`);
    } else if (!labelInOptions(context, entry.label)) {
      pushWarning(id, `第 ${index + 1} 个框的标签不在选项内：${JSON.stringify(entry.label)}。`);
    }
    if (entry.text !== undefined && typeof entry.text !== 'string') {
      pushError(id, `第 ${index + 1} 个框的 text 必须是字符串。`);
    }
  }
}

function validateSpans(context, value) {
  const { id, item, pushError, pushWarning } = context;
  if (!Array.isArray(value)) {
    pushError(id, '必须是片段数组。');
    return;
  }
  const text = typeof item?.payload?.text === 'string' ? item.payload.text : '';
  const maxLength = text.length;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isPlainObject(entry)) {
      pushError(id, `第 ${index + 1} 个片段必须是对象。`);
      continue;
    }
    const start = entry.start;
    const end = entry.end;
    if (!Number.isInteger(start)) {
      pushError(id, `第 ${index + 1} 个片段的 start 必须是整数。`);
      continue;
    }
    if (!Number.isInteger(end)) {
      pushError(id, `第 ${index + 1} 个片段的 end 必须是整数。`);
      continue;
    }
    if (start < 0) pushError(id, `第 ${index + 1} 个片段的 start 不能小于 0。`);
    if (end <= start) pushError(id, `第 ${index + 1} 个片段的 end 必须大于 start。`);
    if (end > maxLength) {
      pushError(id, `第 ${index + 1} 个片段超出文本长度（${maxLength}）。`);
    }
    if (typeof entry.label !== 'string' || entry.label.trim() === '') {
      pushError(id, `第 ${index + 1} 个片段缺少 label。`);
    } else if (!labelInOptions(context, entry.label)) {
      pushWarning(id, `第 ${index + 1} 个片段的标签不在选项内：${JSON.stringify(entry.label)}。`);
    }
    if (entry.text !== undefined && typeof entry.text !== 'string') {
      pushError(id, `第 ${index + 1} 个片段的 text 必须是字符串。`);
    }
  }
}

function validateJsonValue(context, value) {
  const { id, pushError } = context;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    pushError(id, '必须是可序列化的 JSON 值。');
    return;
  }
  try {
    if (JSON.stringify(value) === undefined) pushError(id, '必须是可序列化的 JSON 值。');
  } catch {
    pushError(id, '必须是可序列化的 JSON 值。');
  }
}

/**
 * Validate a project schema.
 * @param {object|Array} schema
 * @returns {{ok: boolean, errors: Array<{field: string, message: string}>}}
 */
export function validateSchema(schema) {
  const errors = [];
  const pushError = (field, message) => errors.push({ field: String(field ?? ''), message });
  const fields = schemaFields(schema);
  if (fields === null) {
    pushError('schema', 'schema 必须包含 fields 数组。');
    return { ok: false, errors };
  }
  const ids = new Set();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const fallback = `fields[${index}]`;
    const rawId = typeof field.id === 'string' ? field.id.trim() : '';
    if (rawId === '') {
      pushError(fallback, '字段缺少 id。');
    } else {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rawId)) {
        pushError(rawId, '字段 id 只能包含字母、数字、点、下划线和短横线，且不能以符号开头。');
      }
      if (ids.has(rawId)) pushError(rawId, `字段 id 重复：${rawId}。`);
      else ids.add(rawId);
    }
    const ref = rawId || fallback;
    const type = typeof field.type === 'string' ? field.type : '';
    if (!FIELD_TYPES.has(type)) pushError(ref, `未知字段类型：${JSON.stringify(field.type)}。`);
    if (field.required !== undefined && typeof field.required !== 'boolean') {
      pushError(ref, 'required 必须是布尔值。');
    }
    if (field.label !== undefined && typeof field.label !== 'string') {
      pushError(ref, 'label 必须是字符串。');
    }
    if (field.help !== undefined && typeof field.help !== 'string') {
      pushError(ref, 'help 必须是字符串。');
    }
    if (field.when !== undefined) {
      if (!isPlainObject(field.when)) {
        pushError(ref, 'when 必须是对象。');
      } else if (field.when.kind !== undefined) {
        const raw = field.when.kind;
        const kinds = Array.isArray(raw) ? raw : [raw];
        for (const kind of kinds) {
          if (!ITEM_KINDS.has(String(kind))) pushError(ref, `when.kind 含未知条目类型：${JSON.stringify(kind)}。`);
        }
      }
    }
    if (type === 'select' || type === 'multiselect') {
      if (!Array.isArray(field.options)) {
        pushError(ref, 'select/multiselect 字段必须有 options 数组。');
      }
    }
    if (field.options !== undefined) {
      if (!Array.isArray(field.options)) {
        pushError(ref, 'options 必须是数组。');
      } else {
        const optionSeen = new Set();
        for (let optionIndex = 0; optionIndex < field.options.length; optionIndex += 1) {
          const option = field.options[optionIndex];
          if (!isPlainObject(option)) {
            pushError(ref, `options[${optionIndex}] 必须是对象。`);
            continue;
          }
          if (option.value === undefined || option.value === null || String(option.value).trim() === '') {
            pushError(ref, `options[${optionIndex}] 缺少 value。`);
          } else {
            const value = String(option.value);
            if (optionSeen.has(value)) pushError(ref, `options 中 value 重复：${value}。`);
            optionSeen.add(value);
          }
          if (option.label !== undefined && typeof option.label !== 'string') {
            pushError(ref, `options[${optionIndex}] 的 label 必须是字符串。`);
          }
        }
      }
    }
    if (type === 'number' || type === 'rating') {
      if (field.min !== undefined && !isFiniteNumber(field.min)) pushError(ref, 'min 必须是数字。');
      if (field.max !== undefined && !isFiniteNumber(field.max)) pushError(ref, 'max 必须是数字。');
      if (isFiniteNumber(field.min) && isFiniteNumber(field.max) && field.min > field.max) {
        pushError(ref, 'min 不能大于 max。');
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
