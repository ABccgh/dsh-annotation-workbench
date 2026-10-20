/**
 * Preset-scoped tools for the annotation workbench Agent preset.
 *
 * Loaded as `@local/annotation-workbench/tools` inside the `annotation` preset
 * (see cordis.patch.yml). Every tool reads the composition's `annotation`
 * service — the same store the HTTP API and Web half use — so the Agent and
 * the browser operate on identical project state.
 *
 * Three tools, one per work stage:
 *
 * - `annotation_project` — projects, guideline, schema, demo data.
 * - `annotation_tasks`   — queue, item detail, save/skip/flag, review.
 * - `annotation_data`    — import, export, stats, agreement, validation, gold.
 *
 * Output is a single text block. **Domain failures never throw**: they come
 * back as `失败: <code> — <message>` plus a short fix hint, because an Agent
 * preset should be able to read the failure and try a different action instead
 * of aborting the turn.
 *
 * @module @local/annotation-workbench/tools
 */

import { defineTool, TEXT_OUTPUT } from './lib/tool-kit.js';
import { formatBytes } from './lib/util.js';

/** Cordis function-plugin name (preset row plugin id). */
export const name = 'annotation-tools';

/** Hard dependencies: the tool registry and the annotation store service. */
export const inject = ['tools', 'annotation'];

const PROJECT_ACTIONS = ['list', 'create', 'open', 'status', 'get_guideline', 'set_guideline', 'get_schema', 'set_schema', 'demo'];
const TASK_ACTIONS = ['next', 'list', 'get', 'save', 'skip', 'flag', 'review'];
const DATA_ACTIONS = ['import', 'export', 'stats', 'agreement', 'validate', 'gold'];
const EXPORT_FORMATS = ['jsonl', 'csv', 'srt', 'vtt', 'coco', 'report'];
const LABEL_STATUSES = ['draft', 'submitted', 'skipped', 'flagged'];

/** Error codes → one actionable suggestion each. */
const HINTS = {
  PROJECT_NOT_FOUND: '先调用 annotation_project action=list 确认项目 id，或用 action=create 新建；也可以省略 project 使用当前项目。',
  PROJECT_REQUIRED: '传入 project（项目 id 或名称），或先用 annotation_project action=open 打开一个项目。',
  ITEM_NOT_FOUND: '先调用 annotation_tasks action=list（或 next）拿到条目 id。',
  ITEM_ID_REQUIRED: '传入 itemId：先 annotation_tasks action=list 或 action=next 取一条。',
  NAME_REQUIRED: 'create 需要 name（项目名称）。',
  VALIDATION_FAILED: '按 get_schema 的字段定义修正 labels；草稿可用 status=draft 保存，确认后再 status=submitted。',
  SCHEMA_INVALID: '检查 schema.fields：id 唯一、type 在允许列表内、select 必须带 options 数组。',
  REVISION_CONFLICT: '项目已被其他人修改：先 annotation_project action=status 重新读取，再改一次。',
  SELF_REVIEW: '换一条不是自己标注的条目，或让项目管理员开启 selfReview。',
  DECISION_INVALID: 'decision 只能是 approve 或 reject。',
  STATUS_INVALID: 'status 只能是 draft / submitted / skipped / flagged。',
  LABELS_INVALID: 'labels 必须是对象，键名对应 schema 字段 id。',
  META_INVALID: 'meta 必须是对象。',
  SOURCE_REQUIRED: 'import 需要 source（文件或目录的绝对路径）；不确定路径时让用户用网页的导入向导浏览。',
  SOURCE_NOT_FOUND: '路径不存在：确认绝对路径拼写，或让用户在网页导入向导里选择。',
  MEDIA_NOT_FOUND: '该条目没有这个媒体文件，用 annotation_tasks action=get 查看 media 列表。',
  MEDIA_EXTERNAL: '项目未允许外部媒体路径，请把媒体放进项目 media/ 目录后重新导入。',
  EXPORT_NOT_FOUND: '导出文件不存在：先执行 annotation_data action=export 重新生成。',
  BAD_ACTION: '查看工具描述里的 action 枚举，使用其中一个。',
  BAD_INPUT: '检查参数名与类型；必填参数不能为空。',
  INVALID_JSON: 'schema/guideline 必须是合法 JSON；schema 形如 {"fields":[...]}。',
  FORMAT_INVALID: 'format 只能是 jsonl / csv / srt / vtt / coco / report。',
  INTERNAL_ERROR: '这是内部错误：先用 action=status 确认项目可读，再把完整报错告诉用户。',
};

/** Fallback advice for codes without a dedicated entry. */
const DEFAULT_HINT = '检查参数后重试；如仍失败，先用 annotation_project action=status 与 annotation_tasks action=list 重新确认项目状态。';

/**
 * A tool-level input problem (missing parameter, unknown action). Rendered as a
 * readable failure instead of being thrown into the tool runtime.
 */
function toolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Render any thrown value as `失败: <code> — <message>` plus a fix hint. */
function failureText(error) {
  const code = typeof error?.code === 'string' && error.code !== '' ? error.code : 'ERROR';
  const message = error instanceof Error ? error.message : String(error ?? '未知错误');
  const hint = HINTS[code] ?? DEFAULT_HINT;
  return `失败: ${code} — ${message}\n修复建议：${hint}`;
}

/** Run one action body, converting domain failures into readable text. */
async function run(fn) {
  try {
    const value = await fn();
    if (value && typeof value.text === 'string') return value;
    return { text: String(value ?? '') };
  } catch (error) {
    return { text: failureText(error) };
  }
}

/** Parse a JSON string argument when the model passed one. */
function parseJsonArg(value, what) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw toolError('INVALID_JSON', `${what} 不是合法 JSON：${text.slice(0, 200)}`);
  }
}

/**
 * Let a model pass an `object` parameter as a JSON string.
 *
 * `lib/tool-kit.js` coerces `object` parameters strictly, so a stringified
 * schema would surface as a raw argument error. Normalize it before coercion:
 * a parsable string becomes the object, and an unparsable one returns the same
 * readable `失败: INVALID_JSON — …` text as a domain failure.
 */
function acceptJsonStringSchema(definition) {
  const baseExecute = definition.execute;
  definition.execute = (rawArgs, exec) => {
    if (!rawArgs || typeof rawArgs !== 'object' || typeof rawArgs.schema !== 'string') {
      return baseExecute(rawArgs, exec);
    }
    let parsed;
    try {
      parsed = JSON.parse(rawArgs.schema);
    } catch {
      return { text: failureText(toolError('INVALID_JSON', `schema 不是合法 JSON：${rawArgs.schema.slice(0, 120)}`)) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { text: failureText(toolError('INVALID_JSON', 'schema 必须是 JSON 对象，形如 {"fields":[...]}')) };
    }
    return baseExecute({ ...rawArgs, schema: parsed }, exec);
  };
  return definition;
}

function requireText(value, code, message) {
  const text = typeof value === 'string' ? value.trim() : (value === undefined || value === null ? '' : String(value).trim());
  if (text === '') throw toolError(code, message);
  return text;
}

/** The annotation store service (inject guarantees it in production). */
function storeOf(ctx) {
  const direct = ctx?.annotation;
  if (direct) return direct;
  try {
    return typeof ctx?.get === 'function' ? ctx.get('annotation') : undefined;
  } catch {
    return undefined;
  }
}

/** Acting identity for this tool call: the local device identity. */
async function currentActor(store) {
  const device = await store.getDevice();
  return { id: device.actorId, name: device.actorName };
}

/* ------------------------------------------------------------------------- *
 * Text renderers
 * ------------------------------------------------------------------------- */

/** One compact line describing a field. */
function fieldLine(field) {
  const extras = [];
  if (field.required === true) extras.push('必填');
  if (Array.isArray(field.options) && field.options.length > 0) {
    const values = field.options.map((option) => String(option?.value ?? option)).slice(0, 8).join('/');
    extras.push(`选项 ${values}${field.options.length > 8 ? '…' : ''}`);
  }
  if (field.when && typeof field.when === 'object') extras.push(`仅 ${JSON.stringify(field.when)}`);
  return `- ${field.id} (${field.type}) ${field.label ?? ''}${extras.length > 0 ? ` · ${extras.join(' · ')}` : ''}`;
}

function renderSchemaText(schema) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  if (fields.length === 0) return '# 字段 schema\n\n（还没有字段。可用 annotation_project action=set_schema 写入 {"fields":[...]}）';
  return `# 字段 schema（${fields.length} 个字段）\n\n${fields.map(fieldLine).join('\n')}\n\n完整 schema：\n${JSON.stringify(schema).slice(0, 2000)}`;
}

function renderProjectSummary(detail) {
  const project = detail?.project ?? {};
  const counts = detail?.counts ?? detail?.stats?.counts ?? {};
  const stats = detail?.stats ?? {};
  const fields = Array.isArray(project.schema?.fields) ? project.schema.fields : [];
  const settings = project.settings ?? {};
  const lines = [
    `# ${project.name ?? '(未命名项目)'}（${project.id ?? '?'}）`,
    `模板：${project.template ?? 'custom'} · revision ${project.revision ?? '?'} · 创建于 ${project.createdAt ?? '未知'}`,
    `条目：总 ${counts.total ?? 0} · 未标 ${counts.unlabeled ?? 0} · 进行中 ${counts.in_progress ?? 0} · 已提交 ${counts.submitted ?? 0} · 已通过 ${counts.approved ?? 0} · 已退回 ${counts.rejected ?? 0} · 标记 ${counts.flagged ?? 0}`,
    `复核待办：${stats.reviewBacklog ?? counts.submitted ?? 0} · 今日提交 ${stats.today?.submitted ?? 0} · 今日通过 ${stats.today?.approved ?? 0}`,
    `设置：导出范围=${settings.exportScope ?? 'approved'} · 自检复核=${settings.selfReview === true || settings.singleUser !== false ? '开' : '关'} · 单机=${settings.singleUser !== false ? '是' : '否'} · 允许外部媒体=${settings.allowExternalMedia === true ? '是' : '否'}`,
  ];
  if (fields.length > 0) {
    lines.push('', `字段（${fields.length}）：`, ...fields.slice(0, 20).map(fieldLine));
    if (fields.length > 20) lines.push(`… 其余 ${fields.length - 20} 个字段略，见 action=get_schema`);
  }
  return lines.join('\n');
}

function renderGuidelineText(guideline) {
  const text = String(guideline?.text ?? '');
  const revision = guideline?.revision;
  return `# 项目规范${revision === undefined ? '' : `（revision ${revision}）`}\n\n${text.trim() === '' ? '（规范为空。可用 annotation_project action=set_guideline 写入）' : text}`;
}

function renderQueueText(result, mode) {
  const rows = Array.isArray(result?.items) ? result.items : [];
  const counts = result?.counts ?? {};
  const head = `队列（${mode === 'review' ? '复核' : '标注'}）共 ${result?.total ?? rows.length} 条`
    + ` · 总 ${counts.total ?? 0} · 已提交 ${counts.submitted ?? 0} · 已通过 ${counts.approved ?? 0}`;
  if (rows.length === 0) return `${head}\n\n没有符合条件的条目。`;
  const lines = rows.map((row) => `- ${row.id} [${row.kind}] 状态=${row.status} 我的=${row.myStatus} 复核=${row.review}`
    + ` 媒体=${row.mediaCount ?? 0}${row.batch ? ` 批次=${row.batch}` : ''}`
    + `${row.preview ? `\n  预览：${String(row.preview).slice(0, 100)}` : ''}`);
  const tail = result?.nextCursor === null || result?.nextCursor === undefined
    ? ''
    : `\n\n下一页 cursor=${result.nextCursor}`;
  return `${head}\n\n${lines.join('\n')}${tail}`;
}

function renderPayloadPreview(item) {
  const payload = item?.payload;
  if (!payload || typeof payload !== 'object') return '（无 payload）';
  if (typeof payload.text === 'string') return payload.text.slice(0, 500);
  return JSON.stringify(payload).slice(0, 800);
}

function renderItemDetail(detail) {
  if (!detail || !detail.item) return '条目不存在。';
  const item = detail.item;
  const media = Array.isArray(detail.media) ? detail.media : [];
  const annotations = Array.isArray(detail.annotations) ? detail.annotations : [];
  const reviews = Array.isArray(detail.reviews) ? detail.reviews : [];
  const schemaFields = Array.isArray(detail.project?.schema?.fields) ? detail.project.schema.fields : [];
  const lines = [
    `# 条目 ${item.id}（${item.kind}）`,
    `状态=${detail.status ?? '?'} · 我的标注=${detail.myStatus ?? 'none'} · 复核=${detail.review ?? 'none'}`,
    `媒体 ${media.length} 个${media.length > 0 ? `：${media.map((entry) => `${entry.name ?? entry.index}(${entry.mime ?? '?'})`).join('、')}` : ''}`,
    '',
    '内容：',
    renderPayloadPreview(item),
  ];
  if (schemaFields.length > 0) {
    lines.push('', `字段（${schemaFields.length}）：`, ...schemaFields.slice(0, 15).map(fieldLine));
  }
  if (annotations.length > 0) {
    lines.push('', `已有标注（${annotations.length}）：`);
    for (const event of annotations.slice(0, 10)) {
      lines.push(`- ${event.actorName ?? event.actorId}：${event.status} @ ${event.ts ?? ''}｜labels=${JSON.stringify(event.labels ?? {}).slice(0, 300)}`);
    }
  }
  if (Object.keys(detail.finalLabels ?? {}).length > 0) {
    lines.push('', `最终标签：${JSON.stringify(detail.finalLabels).slice(0, 600)}`);
  }
  if (reviews.length > 0) {
    lines.push('', '复核记录：');
    for (const event of reviews.slice(0, 5)) {
      lines.push(`- ${event.actorName ?? event.actorId}：${event.decision} @ ${event.ts ?? ''}${event.comment ? `｜${String(event.comment).slice(0, 200)}` : ''}`);
    }
  }
  return lines.join('\n');
}

function renderStatsText(stats) {
  const counts = stats?.counts ?? {};
  const actors = Array.isArray(stats?.actors) ? stats.actors : [];
  const lines = [
    '# 项目统计',
    `条目：总 ${counts.total ?? 0} · 未标 ${counts.unlabeled ?? 0} · 进行中 ${counts.in_progress ?? 0} · 已提交 ${counts.submitted ?? 0} · 已通过 ${counts.approved ?? 0} · 已退回 ${counts.rejected ?? 0} · 标记 ${counts.flagged ?? 0}`,
    `复核待办：${stats?.reviewBacklog ?? 0} · 今日提交 ${stats?.today?.submitted ?? 0} · 今日通过 ${stats?.today?.approved ?? 0}`,
  ];
  if (actors.length > 0) {
    lines.push('', '成员产出：');
    for (const actor of actors.slice(0, 15)) {
      lines.push(`- ${actor.actorName ?? actor.actorId}：提交 ${actor.submitted ?? 0} · 通过 ${actor.approved ?? 0} · 平均耗时 ${Math.round((actor.avgDurationMs ?? 0) / 1000)} 秒`);
    }
  }
  const distribution = stats?.labelDistribution ?? {};
  const keys = Object.keys(distribution);
  if (keys.length > 0) {
    lines.push('', `标签分布${stats?.primaryField ? `（${stats.primaryField.label}）` : ''}：${keys.slice(0, 20).map((key) => `${key}=${distribution[key]}`).join('、')}`);
  }
  const recent = Array.isArray(stats?.recent) ? stats.recent : [];
  if (recent.length > 0) {
    lines.push('', '最近活动：');
    for (const event of recent.slice(0, 10)) lines.push(`- ${event.ts ?? ''} ${event.actorName ?? ''} ${event.action ?? ''}${event.itemId ? ` ${event.itemId}` : ''}`);
  }
  return lines.join('\n');
}

function renderAgreementText(result) {
  const fields = Array.isArray(result?.fields) ? result.fields : [];
  const lines = [
    '# 一致性',
    `比较条目：${result?.itemsCompared ?? 0}`,
    `总体一致性：${result?.overall === null || result?.overall === undefined ? '数据不足' : `${(Number(result.overall) * 100).toFixed(1)}%`}`,
  ];
  if (fields.length > 0) {
    lines.push('', '字段一致性：');
    for (const field of fields) {
      const score = field?.score === null || field?.score === undefined ? '—' : `${(Number(field.score) * 100).toFixed(1)}%`;
      lines.push(`- ${field.field} (${field.type ?? '?'})：${score} · 对数 ${field.pairs ?? 0}`);
    }
  }
  const gold = result?.gold;
  if (gold && Array.isArray(gold.fields) && gold.fields.length > 0) {
    lines.push('', `金标（${gold.items ?? 0} 条）：`);
    for (const field of gold.fields) {
      lines.push(`- ${field.field}：正确 ${field.correct ?? 0}/${field.total ?? 0} · ${((Number(field.score) || 0) * 100).toFixed(1)}%`);
    }
  }
  return lines.join('\n');
}

function renderValidateText(result) {
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const lines = ['# 校验结果', `结论：${result?.ok === true ? '通过' : '未通过'} · 检查条目 ${result?.checked ?? 0} · 错误 ${errors.length} · 警告 ${warnings.length}`];
  if (errors.length > 0) {
    lines.push('', '错误：');
    for (const error of errors.slice(0, 30)) lines.push(`- ${error.itemId ?? '?'} · ${error.field ?? '?'}：${error.message ?? ''}`);
    if (errors.length > 30) lines.push(`… 其余 ${errors.length - 30} 条略`);
  }
  if (warnings.length > 0) {
    lines.push('', '警告：');
    for (const warning of warnings.slice(0, 20)) lines.push(`- ${warning.itemId ?? '?'} · ${warning.field ?? '?'}：${warning.message ?? ''}`);
  }
  return lines.join('\n');
}

function renderImportText(result) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const missing = Array.isArray(result?.missingMedia) ? result.missingMedia : [];
  const lines = [
    '# 导入完成',
    `新增 ${result?.imported ?? 0} 条 · 跳过 ${result?.skipped ?? 0} 条 · 警告 ${warnings.length} 条 · 媒体 ${Array.isArray(result?.mediaFiles) ? result.mediaFiles.length : 0} 个 · 缺失媒体 ${missing.length} 个`,
  ];
  if (warnings.length > 0) {
    lines.push('', '警告：');
    for (const warning of warnings.slice(0, 15)) lines.push(`- ${String(warning)}`);
  }
  if (missing.length > 0) {
    lines.push('', '缺失媒体：');
    for (const entry of missing.slice(0, 10)) lines.push(`- ${String(entry)}`);
  }
  return lines.join('\n');
}

function renderExportText(result) {
  const files = Array.isArray(result?.files) ? result.files : [];
  const lines = [`# 导出完成（${files.length} 个文件）`];
  for (const file of files.slice(0, 20)) {
    lines.push(`- ${file?.name ?? '?'} · ${formatBytes(file?.size ?? 0)}${file?.urlPath ? ` · 下载路径 ${file.urlPath}` : ''}`);
  }
  const summary = result?.summary;
  if (summary && typeof summary === 'object') {
    const entries = Object.entries(summary).filter(([, value]) => typeof value === 'string' || typeof value === 'number');
    if (entries.length > 0) lines.push('', `摘要：${entries.map(([key, value]) => `${key}=${value}`).join('、')}`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------------- *
 * Tool parameter specs
 * ------------------------------------------------------------------------- */

const PROJECT_PARAMETERS = {
  action: {
    type: 'string',
    required: true,
    enum: PROJECT_ACTIONS,
    description: '操作：list 列表 | create 新建 | open 打开 | status 状态 | get_guideline 读规范 | set_guideline 写规范 | get_schema 读字段 | set_schema 写字段 | demo 写入示例数据',
  },
  project: { type: 'string', description: '项目 id 或名称；省略时使用当前打开的项目（list/create 不需要）' },
  name: { type: 'string', description: '项目名称（create 必填）' },
  template: { type: 'string', description: '模板 id（create 用）：text_classification | text_span | image_classification | image_bbox | video_caption | audio_transcript | llm_preference | custom' },
  description: { type: 'string', description: '项目描述（create 可选）' },
  guideline: { type: 'string', description: '项目规范 Markdown（create / set_guideline 用）' },
  schema: { type: 'object', description: '字段 schema 对象 {fields:[...]}（create / set_schema 用）' },
};

const TASK_PARAMETERS = {
  action: {
    type: 'string',
    required: true,
    enum: TASK_ACTIONS,
    description: '操作：next 下一条 | list 队列 | get 条目详情 | save 保存标注 | skip 跳过 | flag 标记问题 | review 复核（自检）',
  },
  project: { type: 'string', description: '项目 id 或名称；省略时使用当前项目' },
  itemId: { type: 'string', description: '条目 id（get/save/skip/flag/review 必填）' },
  mode: { type: 'string', enum: ['annotate', 'review'], description: '任务模式：annotate 标注（默认）或 review 复核' },
  filter: {
    type: 'object',
    description: '队列筛选：{status,kind,batch,tag}',
    properties: {
      status: { type: 'string', description: '状态：unlabeled/in_progress/submitted/approved/rejected/flagged/mine/review/all' },
      kind: { type: 'string', description: '条目类型：text/image/video/audio/llm/document' },
      batch: { type: 'string', description: '批次名' },
      tag: { type: 'string', description: '标签名' },
    },
  },
  limit: { type: 'integer', minimum: 1, maximum: 200, description: 'list 返回条数，默认 20' },
  labels: { type: 'object', description: '标注结果对象，键名对应 schema 字段 id（save/skip/flag 用）' },
  status: { type: 'string', enum: ['draft', 'submitted'], description: 'save 的保存状态：draft 草稿（默认）或 submitted 提交' },
  note: { type: 'string', description: '备注（save/skip/flag 用）' },
  decision: { type: 'string', enum: ['approve', 'reject'], description: '复核结论（review 必填）' },
  finalLabels: { type: 'object', description: '复核后的最终标签（review 可选；省略时取最近一条 submitted）' },
  comment: { type: 'string', description: '复核意见（review 可选）' },
};

const DATA_PARAMETERS = {
  action: {
    type: 'string',
    required: true,
    enum: DATA_ACTIONS,
    description: '操作：import 导入 | export 导出 | stats 统计 | agreement 一致性 | validate 校验 | gold 写入金标',
  },
  project: { type: 'string', description: '项目 id 或名称；省略时使用当前项目' },
  source: { type: 'string', description: '导入源绝对路径：文件（jsonl/json/csv/tsv/srt/vtt/媒体）或目录（import 必填）' },
  format: { type: 'string', description: '导入格式 auto/jsonl/json/csv/tsv/srt/vtt/folder；导出格式 jsonl/csv/srt/vtt/coco/report' },
  target: { type: 'string', description: 'format 的别名（兼容旧写法）' },
  copyMedia: { type: 'boolean', description: '导入时是否把媒体复制进项目 media/（默认 true）' },
  mapping: { type: 'object', description: '列映射 {id,text,media,messages}（import 可选）' },
  scope: { type: 'string', enum: ['approved', 'submitted', 'all'], description: '导出范围（默认取项目设置）' },
  itemId: { type: 'string', description: '单条导出（srt/vtt）或校验、金标条目 id' },
  labels: { type: 'object', description: '金标标签对象（gold 必填）' },
  limit: { type: 'integer', minimum: 1, maximum: 200, description: '可选数量上限（当前用于统计展示，默认不裁剪）' },
};

/* ------------------------------------------------------------------------- *
 * Plugin entry
 * ------------------------------------------------------------------------- */

/**
 * Register the three annotation tools.
 * @param {any} ctx Cordis context with `tools` and `annotation` services.
 */
export function apply(ctx) {
  const store = storeOf(ctx);
  if (!store) {
    try {
      ctx?.logger?.warn?.('[annotation-tools] annotation 服务不可用，工具未注册');
    } catch {
      // Logging must not break activation.
    }
    return;
  }

  ctx.tools.register(acceptJsonStringSchema(defineTool({
    name: 'annotation_project',
    description:
      '标注台项目管理：列出/创建/打开项目，读取或更新项目规范（guideline）与字段 schema，写入示例数据。'
      + '写操作会记录当前设备身份；set_guideline/set_schema 会让项目 revision +1。'
      + '开始任何标注任务前先 action=status 读项目规范与字段定义，不要凭常识猜标签。',
    parameters: PROJECT_PARAMETERS,
    output: TEXT_OUTPUT,
    async execute(args) {
      return run(async () => {
        switch (args.action) {
          case 'list': {
            const projects = await store.listProjects();
            const device = await store.getDevice();
            const active = device.activeProject;
            if (!Array.isArray(projects) || projects.length === 0) {
              return '还没有项目。用 annotation_project action=create name="项目名" template=video_caption 新建一个。';
            }
            const lines = projects.map((project) => `- ${project.id} · ${project.name} [${project.template}] · 条目 ${project.itemCount ?? 0} · revision ${project.revision ?? 1}${project.id === active ? ' · ← 当前项目' : ''}`);
            return `共 ${projects.length} 个项目${active ? `，当前项目 ${active}` : '，尚未打开项目'}：\n${lines.join('\n')}`;
          }
          case 'create': {
            const name = requireText(args.name, 'NAME_REQUIRED', 'create 需要 name（项目名称）');
            const actor = await currentActor(store);
            const detail = await store.createProject({
              name,
              template: args.template ?? 'custom',
              description: args.description ?? '',
              schema: parseJsonArg(args.schema, 'schema'),
              guideline: args.guideline,
              actor,
            });
            const project = detail?.project ?? {};
            const fieldCount = Array.isArray(project.schema?.fields) ? project.schema.fields.length : 0;
            return `已创建项目：${project.id} · ${project.name}（模板 ${project.template}，字段 ${fieldCount} 个，revision ${project.revision}）。已设为当前项目。\n下一步：annotation_project action=get_schema 查看字段，或 annotation_data action=import 导入数据。`;
          }
          case 'open': {
            const ref = requireText(args.project, 'PROJECT_REQUIRED', 'open 需要 project（项目 id 或名称）');
            const detail = await store.getProject(ref);
            const project = detail?.project ?? {};
            await store.setDevice({ activeProject: project.id ?? ref });
            return `已打开项目：${project.id} · ${project.name}（模板 ${project.template}，条目 ${detail?.counts?.total ?? 0} 条）。\n下一步：annotation_project action=status 看进度，或 annotation_tasks action=next 开始标注。`;
          }
          case 'status': {
            const detail = await store.getProject(args.project);
            return renderProjectSummary(detail);
          }
          case 'get_guideline': {
            const guideline = await store.getGuideline(args.project);
            return renderGuidelineText(guideline);
          }
          case 'set_guideline': {
            if (typeof args.guideline !== 'string' || args.guideline.trim() === '') {
              throw toolError('BAD_INPUT', 'set_guideline 需要 guideline（Markdown 文本）');
            }
            const detail = await store.setGuideline(args.project, args.guideline, undefined);
            const project = detail?.project ?? {};
            return `已更新项目规范：${project.id ?? args.project ?? '当前项目'}，revision ${project.revision ?? '?'}（${args.guideline.length} 字）。`;
          }
          case 'get_schema': {
            const detail = await store.getProject(args.project);
            return renderSchemaText(detail?.project?.schema);
          }
          case 'set_schema': {
            const schema = parseJsonArg(args.schema, 'schema');
            if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
              throw toolError('BAD_INPUT', 'set_schema 需要 schema 对象，形如 {"fields":[...]}');
            }
            const detail = await store.setSchema(args.project, schema, undefined);
            const project = detail?.project ?? {};
            const fields = Array.isArray(project.schema?.fields) ? project.schema.fields : [];
            return `已更新 schema：${project.id ?? args.project ?? '当前项目'}，${fields.length} 个字段，revision ${project.revision ?? '?'}。\n${fields.map(fieldLine).join('\n')}`;
          }
          case 'demo': {
            const ref = requireText(args.project, 'PROJECT_REQUIRED', 'demo 需要 project（项目 id 或名称）');
            const detail = await store.getProject(ref);
            const projectId = detail?.project?.id ?? ref;
            await store.setDevice({ activeProject: projectId });
            const result = await store.seedDemo(await currentActor(store));
            return `示例数据已写入项目 ${result?.project ?? projectId}：新增 ${result?.imported ?? 0} 条，跳过 ${result?.skipped ?? 0} 条${result?.message ? `（${result.message}）` : ''}。\n下一步：annotation_tasks action=next 开始标注。`;
          }
          default:
            throw toolError('BAD_ACTION', `未知 action：${args.action}。可用：${PROJECT_ACTIONS.join(' / ')}`);
        }
      });
    },
  })));

  ctx.tools.register(defineTool({
    name: 'annotation_tasks',
    description:
      '标注台任务工作流：next 取下一个任务、list 列队列、get 看条目详情、save 保存标注、skip 跳过、flag 标记问题、'
      + 'review 复核（approve/reject，单机版本可自检）。保存标注默认 status=draft；只有 status=submitted 才进入待复核。'
      + '写标注前先 annotation_project action=get_schema 确认字段定义；不要修改原始 items/media。',
    parameters: TASK_PARAMETERS,
    output: TEXT_OUTPUT,
    async execute(args) {
      return run(async () => {
        const actor = await currentActor(store);
        switch (args.action) {
          case 'next': {
            const item = await store.next(args.project, {
              mode: args.mode === 'review' ? 'review' : 'annotate',
              filter: args.filter && typeof args.filter === 'object' ? args.filter : {},
              actor,
            });
            if (!item) {
              return args.mode === 'review'
                ? '没有待复核条目：所有提交都已处理。'
                : '队列为空：所有条目都处理完了，或筛选条件太窄（可去掉 filter/status 再试）。';
            }
            return renderItemDetail(item);
          }
          case 'list': {
            const limit = Math.max(1, Math.min(200, Number(args.limit) || 20));
            const result = await store.queue(args.project, {
              mode: args.mode === 'review' ? 'review' : 'annotate',
              filter: args.filter && typeof args.filter === 'object' ? args.filter : {},
              q: '',
              cursor: 0,
              limit,
              actor,
            });
            return renderQueueText(result, args.mode === 'review' ? 'review' : 'annotate');
          }
          case 'get': {
            const itemId = requireText(args.itemId, 'ITEM_ID_REQUIRED', 'get 需要 itemId');
            const detail = await store.getItem(args.project, itemId, actor);
            return renderItemDetail(detail);
          }
          case 'save': {
            const itemId = requireText(args.itemId, 'ITEM_ID_REQUIRED', 'save 需要 itemId');
            const status = args.status ?? 'draft';
            if (!LABEL_STATUSES.includes(status)) {
              throw toolError('STATUS_INVALID', `status 不合法：${status}`);
            }
            const result = await store.saveLabel(args.project, {
              itemId,
              labels: args.labels && typeof args.labels === 'object' ? args.labels : {},
              status,
              note: args.note ?? '',
              durationMs: 0,
              actor,
            });
            const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
            return `已保存标注：${itemId}（状态 ${status}）${result?.status ? `，条目当前状态 ${result.status}` : ''}。${warnings.length > 0 ? `\n警告（${warnings.length}）：${warnings.map((warning) => warning?.message ?? String(warning)).slice(0, 10).join('；')}` : ''}`;
          }
          case 'skip': {
            const itemId = requireText(args.itemId, 'ITEM_ID_REQUIRED', 'skip 需要 itemId');
            const result = await store.saveLabel(args.project, {
              itemId,
              labels: args.labels && typeof args.labels === 'object' ? args.labels : {},
              status: 'skipped',
              note: args.note ?? '跳过',
              durationMs: 0,
              actor,
            });
            return `已跳过条目：${itemId}${result?.status ? `（条目状态 ${result.status}）` : ''}。`;
          }
          case 'flag': {
            const itemId = requireText(args.itemId, 'ITEM_ID_REQUIRED', 'flag 需要 itemId');
            const result = await store.saveLabel(args.project, {
              itemId,
              labels: args.labels && typeof args.labels === 'object' ? args.labels : {},
              status: 'flagged',
              note: args.note ?? '标记问题',
              durationMs: 0,
              actor,
            });
            return `已标记问题：${itemId}${result?.status ? `（条目状态 ${result.status}）` : ''}。${args.note ? `备注：${args.note}` : ''}`;
          }
          case 'review': {
            const itemId = requireText(args.itemId, 'ITEM_ID_REQUIRED', 'review 需要 itemId');
            if (args.decision !== 'approve' && args.decision !== 'reject') {
              throw toolError('DECISION_INVALID', 'review 需要 decision=approve 或 reject');
            }
            const result = await store.review(args.project, {
              itemId,
              decision: args.decision,
              finalLabels: args.finalLabels && typeof args.finalLabels === 'object' ? args.finalLabels : undefined,
              comment: args.comment ?? '',
              actor,
            });
            return `已复核条目 ${itemId}：${args.decision === 'approve' ? '通过' : '退回'}。条目当前状态：${result?.status ?? '?'}。${args.comment ? `\n意见：${args.comment}` : ''}`;
          }
          default:
            throw toolError('BAD_ACTION', `未知 action：${args.action}。可用：${TASK_ACTIONS.join(' / ')}`);
        }
      });
    },
  }));

  ctx.tools.register(defineTool({
    name: 'annotation_data',
    description:
      '标注台数据与统计：import 导入（source 传文件或目录绝对路径）、export 导出（jsonl/csv/srt/vtt/coco/report）、'
      + 'stats 统计、agreement 一致性、validate 校验、gold 写入金标。'
      + '导出前先 action=validate；不要编造数据，不要修改原始条目与媒体。',
    parameters: DATA_PARAMETERS,
    output: TEXT_OUTPUT,
    async execute(args) {
      return run(async () => {
        const actor = await currentActor(store);
        switch (args.action) {
          case 'import': {
            const source = requireText(args.source, 'SOURCE_REQUIRED', 'import 需要 source（文件或目录的绝对路径）');
            const result = await store.importItems(args.project, {
              source,
              format: args.format ?? 'auto',
              mapping: args.mapping && typeof args.mapping === 'object' ? args.mapping : {},
              copyMedia: args.copyMedia,
              actor,
            });
            return renderImportText(result);
          }
          case 'export': {
            const rawFormat = args.format ?? args.target ?? 'jsonl';
            const format = String(rawFormat).trim().toLowerCase();
            if (!EXPORT_FORMATS.includes(format)) {
              throw toolError('FORMAT_INVALID', `不支持的导出格式：${rawFormat}`);
            }
            const result = await store.exportData(args.project, {
              format,
              scope: args.scope,
              itemId: args.itemId,
            });
            return renderExportText(result);
          }
          case 'stats': {
            return renderStatsText(await store.stats(args.project));
          }
          case 'agreement': {
            return renderAgreementText(await store.agreement(args.project));
          }
          case 'validate': {
            return renderValidateText(await store.validate(args.project, { itemId: args.itemId }));
          }
          case 'gold': {
            const itemId = requireText(args.itemId, 'ITEM_ID_REQUIRED', 'gold 需要 itemId');
            if (!args.labels || typeof args.labels !== 'object' || Array.isArray(args.labels)) {
              throw toolError('LABELS_INVALID', 'gold 需要 labels 对象');
            }
            const result = await store.setGold(args.project, { itemId, labels: args.labels, actor });
            return `已写入金标：${result?.itemId ?? itemId}（字段：${Object.keys(result?.labels ?? args.labels).join('、') || '无'}）。`;
          }
          default:
            throw toolError('BAD_ACTION', `未知 action：${args.action}。可用：${DATA_ACTIONS.join(' / ')}`);
        }
      });
    },
  }));
}
