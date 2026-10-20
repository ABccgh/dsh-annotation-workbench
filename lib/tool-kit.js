/**
 * Local tool definition helper. Mirrors the shape the DSH tool registry needs
 * without importing any @deepseek-ai package (a linked profile bundle cannot
 * resolve those imports).
 *
 * @module @local/annotation-workbench/lib/tool-kit
 */

const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null']);

/** Convert a compact parameter spec to a JSON Schema node. */
export function specToJsonSchema(node) {
  if (node === null || typeof node !== 'object') throw new TypeError('参数 spec 必须是对象');
  const { type } = node;
  if (typeof type !== 'string') throw new TypeError(`参数 spec 缺少 type：${JSON.stringify(node)}`);
  const schema = { type };
  if (typeof node.description === 'string') schema.description = node.description;
  if (Array.isArray(node.enum)) schema.enum = [...node.enum];
  if (node.default !== undefined) schema.default = node.default;
  if (typeof node.minimum === 'number') schema.minimum = node.minimum;
  if (typeof node.maximum === 'number') schema.maximum = node.maximum;
  if (type === 'array') {
    if (node.items !== undefined) schema.items = specToJsonSchema(node.items);
  } else if (type === 'object') {
    const properties = {};
    const required = [];
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      properties[key] = specToJsonSchema(child);
      if (child.required === true) required.push(key);
    }
    schema.properties = properties;
    if (required.length > 0) schema.required = required;
    if (node.additionalProperties === false) schema.additionalProperties = false;
  } else if (!SCALAR_TYPES.has(type)) {
    throw new TypeError(`不支持的参数类型 ${JSON.stringify(type)}`);
  }
  return schema;
}

/** Compile `{ name: spec }` into an object-root JSON Schema. */
export function parametersToJsonSchema(spec = {}) {
  const properties = {};
  const required = [];
  for (const [key, node] of Object.entries(spec)) {
    properties[key] = specToJsonSchema(node);
    if (node.required === true) required.push(key);
  }
  const schema = { type: 'object', properties, additionalProperties: false };
  if (required.length > 0) schema.required = required;
  return schema;
}

/** Normalize scalar arguments and check required fields. */
export function coerceArguments(schema, rawArgs) {
  const args = rawArgs === undefined || rawArgs === null ? {} : rawArgs;
  if (typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是一个对象。');
  const out = {};
  for (const [key, node] of Object.entries(schema.properties ?? {})) {
    const value = args[key];
    if (value === undefined || value === null) continue;
    out[key] = coerceScalar(node, value, key);
  }
  for (const key of schema.required ?? []) {
    if (out[key] === undefined) throw new Error(`缺少必填参数 ${key}。`);
  }
  return out;
}

function coerceScalar(node, value, key) {
  switch (node.type) {
    case 'integer': {
      const parsed = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
      if (!Number.isFinite(parsed)) throw new Error(`参数 ${key} 必须是整数。`);
      return parsed;
    }
    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(String(value));
      if (!Number.isFinite(parsed)) throw new Error(`参数 ${key} 必须是数字。`);
      return parsed;
    }
    case 'string':
      return typeof value === 'string' ? value : String(value);
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new Error(`参数 ${key} 必须是布尔值。`);
    case 'array': {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Fall through to the teaching error.
        }
      }
      if (!Array.isArray(value)) throw new Error(`参数 ${key} 必须是数组（或 JSON 数组字符串）。`);
      return value;
    }
    case 'object': {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
          // Fall through to the teaching error.
        }
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`参数 ${key} 必须是对象（或 JSON 对象字符串）。`);
      }
      return value;
    }
    default:
      return value;
  }
}

/** Define and validate one tool registration. */
export function defineTool(options) {
  const { name, description, parameters = {}, output } = options;
  if (typeof name !== 'string' || name === '') throw new TypeError('工具必须有 name');
  if (name === 'run_code') throw new Error('run_code 是 PTC 模式保留的工具名');
  if (typeof description !== 'string' || description === '') throw new TypeError(`工具 ${name} 必须有 description`);
  if (output === null || typeof output !== 'object') throw new TypeError(`工具 ${name} 必须声明 output`);
  if (typeof output.render !== 'function') throw new TypeError(`工具 ${name} 的 output.render 必须是函数`);
  if (typeof options.execute !== 'function') throw new TypeError(`工具 ${name} 必须有 execute`);

  const schema = parametersToJsonSchema(parameters);
  const outputSchema = specToJsonSchema(output.schema);
  const definition = {
    name,
    description,
    parameters: schema,
    output: {
      schema: outputSchema,
      render: output.render,
      ...(typeof output.presentationMeta === 'function' ? { presentationMeta: output.presentationMeta } : {}),
    },
    async execute(rawArgs, exec) {
      return options.execute(coerceArguments(schema, rawArgs), exec);
    },
  };
  if (typeof options.isConcurrencySafe === 'function') definition.isConcurrencySafe = options.isConcurrencySafe;
  if (typeof options.presentCall === 'function') definition.presentCall = options.presentCall;
  if (options.timeoutMs !== undefined) definition.timeoutMs = options.timeoutMs;
  return definition;
}

/** Shared text output schema. */
export const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string', required: true } },
  },
  render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
};
