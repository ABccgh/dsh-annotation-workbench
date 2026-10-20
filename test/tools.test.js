/**
 * Preset tool tests.
 *
 * The tool module is loaded into a fake Cordis context: `tools.register`
 * collects definitions and `annotation` is an in-memory fake store whose calls
 * are recorded. No real store, no HTTP, no profile install.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { apply as applyTools, inject as toolsInject, name as pluginName } from '../tools.js';

/* ------------------------------------------------------------------------- *
 * Fake store
 * ------------------------------------------------------------------------- */

/** Domain error shaped exactly like store.js `AppError`. */
function storeError(code, message, status, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function makeStats() {
  return {
    counts: { total: 4, unlabeled: 1, in_progress: 1, submitted: 1, approved: 1, rejected: 0, flagged: 0 },
    actors: [
      { actorId: 'actor-tools', actorName: '工具测试员', submitted: 2, approved: 1, avgDurationMs: 2400 },
      { actorId: 'actor-2', actorName: '李四', submitted: 0, approved: 0, avgDurationMs: 0 },
    ],
    today: { submitted: 2, approved: 1 },
    reviewBacklog: 1,
    labelDistribution: { zh: 2, en: 1 },
    primaryField: { id: 'language', label: '语言' },
    recent: [
      { ts: '2026-10-20T00:00:00.000Z', actorName: '工具测试员', action: 'label.save', itemId: 'item-1' },
    ],
  };
}

function createFakeStore() {
  const calls = [];
  const record = (name, payload) => {
    calls.push({ name, payload });
  };
  const callsOf = (name) => calls.filter((entry) => entry.name === name);
  const device = {
    actorId: 'actor-tools',
    actorName: '工具测试员',
    onboarded: true,
    dataRoot: 'D:/fake-root',
    activeProject: 'proj-tools',
    openOnStart: true,
    ui: {},
  };
  const project = {
    id: 'proj-tools',
    name: '工具项目',
    template: 'video_caption',
    revision: 2,
    schema: {
      fields: [
        { id: 'segments', label: '字幕分段', type: 'segments', required: true },
        { id: 'language', label: '语言', type: 'select', required: true, options: [{ value: 'zh', label: '中文' }] },
      ],
    },
    settings: { exportScope: 'approved', selfReview: false, assignmentMode: 'free' },
    createdAt: '2026-10-20T00:00:00.000Z',
  };
  const detail = {
    item: {
      id: 'item-1',
      kind: 'video',
      media: [{ path: 'media/item-1.mp4', mime: 'video/mp4' }],
      payload: {},
      meta: { durationMs: 5000 },
      batch: 'A',
      tags: [],
      priority: 0,
    },
    annotations: [{ actorId: 'actor-tools', actorName: '工具测试员', status: 'draft', ts: '2026-10-20T00:00:00.000Z', labels: {} }],
    reviews: [],
    claim: null,
    media: [{ index: 0, name: 'item-1.mp4', mime: 'video/mp4', url: '/annotation/api/projects/proj-tools/media/item-1/0' }],
    status: 'in_progress',
    myStatus: 'draft',
    review: 'none',
    finalLabels: {},
    assignedTo: null,
    project: { id: 'proj-tools', name: '工具项目', template: 'video_caption', schema: project.schema, settings: project.settings, revision: 2 },
    serverTime: '2026-10-20T00:00:00.000Z',
  };

  return {
    calls,
    callsOf,
    device,
    project,
    detail,

    async getDevice() {
      record('getDevice', {});
      return { ...device, ui: { ...device.ui } };
    },
    async listProjects() {
      record('listProjects', {});
      return [{ id: 'proj-tools', name: '工具项目', template: 'video_caption', description: '', revision: 2, itemCount: 4 }];
    },
    async createProject(input = {}) {
      record('createProject', input);
      return {
        project: {
          id: 'proj-new',
          name: input.name,
          template: input.template ?? 'custom',
          revision: 1,
          schema: input.schema ?? { fields: [] },
        },
        stats: makeStats(),
        members: [],
        counts: { total: 0 },
      };
    },
    async getProject(ref) {
      record('getProject', { ref });
      if (ref === 'missing') throw storeError('PROJECT_NOT_FOUND', '找不到项目：missing', 404);
      return { project, stats: makeStats(), members: [{ actorId: 'actor-tools', actorName: '工具测试员', role: 'admin' }], counts: { total: 4, submitted: 1 } };
    },
    async setDevice(patch = {}) {
      record('setDevice', { patch });
      Object.assign(device, patch);
      return { ...device };
    },
    async getGuideline(ref) {
      record('getGuideline', { ref });
      return { text: '# 课程规范\n\n1. 按语义切句。\n2. 时间码留 0.2 秒余量。', revision: 2 };
    },
    async setGuideline(ref, text) {
      record('setGuideline', { ref, text });
      project.revision += 1;
      return { project: { ...project } };
    },
    async setSchema(ref, schema) {
      record('setSchema', { ref, schema });
      project.schema = schema;
      project.revision += 1;
      return { project: { ...project } };
    },
    async seedDemo(actor) {
      record('seedDemo', { actor });
      return { project: device.activeProject ?? 'proj-tools', imported: 2, skipped: 0 };
    },
    async next(ref, options = {}) {
      record('next', { ref, options });
      return options.mode === 'review' ? null : detail;
    },
    async queue(ref, options = {}) {
      record('queue', { ref, options });
      return {
        items: [{
          id: 'item-1',
          kind: 'video',
          preview: '第一段字幕',
          status: 'submitted',
          myStatus: 'draft',
          review: 'pending',
          mediaCount: 1,
          batch: 'A',
          tags: ['demo'],
          priority: 0,
          claimedBy: null,
        }],
        nextCursor: null,
        total: 1,
        counts: { total: 4, submitted: 1, approved: 1 },
      };
    },
    async getItem(ref, itemId, actor) {
      record('getItem', { ref, itemId, actor });
      if (itemId === 'missing') throw storeError('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
      return detail;
    },
    async saveLabel(ref, input = {}) {
      record('saveLabel', { ref, input });
      if (input.status === 'submitted') {
        throw storeError('VALIDATION_FAILED', '提交前校验未通过', 422, [{ field: 'segments', message: '必填' }]);
      }
      return { status: input.status === 'draft' ? 'in_progress' : 'submitted', warnings: [] };
    },
    async review(ref, input = {}) {
      record('review', { ref, input });
      return { status: input.decision === 'approve' ? 'approved' : 'rejected' };
    },
    async claim(ref, input = {}) {
      record('claim', { ref, input });
      return { claim: { itemId: input.itemId, expiresAt: '2026-10-20T00:15:00.000Z' } };
    },
    async release(ref, input = {}) {
      record('release', { ref, input });
      return { released: true };
    },
    async importItems(ref, options = {}) {
      record('importItems', { ref, options });
      return { imported: 5, skipped: 0, warnings: [], mediaFiles: ['media/a.mp4'], missingMedia: [] };
    },
    async exportData(ref, options = {}) {
      record('exportData', { ref, options });
      return {
        files: [{ name: 'export.jsonl', size: 1024, urlPath: '/annotation/api/projects/proj-tools/download?path=export.jsonl' }],
        summary: { items: 4, format: options.format ?? 'jsonl' },
      };
    },
    async stats(ref) {
      record('stats', { ref });
      return makeStats();
    },
    async agreement(ref) {
      record('agreement', { ref });
      return {
        itemsCompared: 2,
        fields: [{ field: 'segments', type: 'segments', pairs: 2, score: 0.5 }],
        overall: 0.5,
        gold: { items: 1, fields: [{ field: 'segments', correct: 1, total: 1, score: 1 }] },
      };
    },
    async validate(ref, options = {}) {
      record('validate', { ref, options });
      return {
        ok: false,
        checked: 2,
        errors: [{ itemId: 'item-1', field: 'segments', message: '缺少分段' }],
        warnings: [{ itemId: 'item-2', field: 'note', message: '空备注' }],
      };
    },
    async setGold(ref, options = {}) {
      record('setGold', { ref, options });
      return { itemId: options.itemId, labels: options.labels };
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Fake Cordis context
 * ------------------------------------------------------------------------- */

async function makeTools() {
  const store = createFakeStore();
  const registered = [];
  const ctx = {
    annotation: store,
    tools: {
      register(definition) {
        registered.push(definition);
      },
    },
    get(name) {
      return name === 'annotation' ? store : undefined;
    },
    logger: { info() {}, warn() {}, error() {} },
  };
  await applyTools(ctx);
  const byName = (name) => registered.find((definition) => definition.name === name);
  return { ctx, store, registered, byName };
}

/** Execute one tool definition with raw args. */
function execute(definition, args) {
  return definition.execute(args, undefined);
}

let tools;

beforeEach(async () => {
  tools = await makeTools();
});

/* ------------------------------------------------------------------------- *
 * Registration and schemas
 * ------------------------------------------------------------------------- */

describe('plugin registration', () => {
  it('declares the preset dependencies and plugin name', () => {
    assert.equal(pluginName, 'annotation-tools');
    assert.deepEqual(toolsInject, ['tools', 'annotation']);
  });

  it('registers exactly the three annotation tools', () => {
    assert.equal(tools.registered.length, 3);
    const names = tools.registered.map((definition) => definition.name).sort();
    assert.deepEqual(names, ['annotation_data', 'annotation_project', 'annotation_tasks']);
  });

  it('uses Chinese descriptions for the model', () => {
    for (const definition of tools.registered) {
      assert.match(definition.description, /[\u4e00-\u9fa5]/, `${definition.name} 的描述应为中文`);
    }
  });

  it('exposes action enums and the documented parameters', () => {
    const projectTool = tools.byName('annotation_project');
    assert.deepEqual(projectTool.parameters.required, ['action']);
    assert.deepEqual(projectTool.parameters.properties.action.enum, [
      'list', 'create', 'open', 'status', 'get_guideline', 'set_guideline', 'get_schema', 'set_schema', 'demo',
    ]);
    for (const key of ['project', 'name', 'template', 'description', 'guideline', 'schema']) {
      assert.ok(projectTool.parameters.properties[key], `缺少参数 ${key}`);
    }

    const taskTool = tools.byName('annotation_tasks');
    assert.deepEqual(taskTool.parameters.required, ['action']);
    assert.deepEqual(taskTool.parameters.properties.action.enum, [
      'next', 'list', 'get', 'save', 'skip', 'flag', 'review',
    ]);
    assert.deepEqual(taskTool.parameters.properties.mode.enum, ['annotate', 'review']);
    assert.deepEqual(taskTool.parameters.properties.decision.enum, ['approve', 'reject']);
    assert.equal(taskTool.parameters.properties.filter.type, 'object');
    for (const key of ['project', 'itemId', 'limit', 'labels', 'status', 'note', 'finalLabels', 'comment']) {
      assert.ok(taskTool.parameters.properties[key], `缺少参数 ${key}`);
    }

    const dataTool = tools.byName('annotation_data');
    assert.deepEqual(dataTool.parameters.required, ['action']);
    assert.deepEqual(dataTool.parameters.properties.action.enum, [
      'import', 'export', 'stats', 'agreement', 'validate', 'gold',
    ]);
    for (const key of ['project', 'source', 'format', 'target', 'copyMedia', 'mapping', 'scope', 'itemId', 'labels', 'limit']) {
      assert.ok(dataTool.parameters.properties[key], `缺少参数 ${key}`);
    }
    assert.deepEqual(dataTool.parameters.properties.scope.enum, ['approved', 'submitted', 'all']);
  });

  it('declares the shared text output contract', () => {
    for (const definition of tools.registered) {
      assert.equal(definition.output.schema.type, 'object');
      assert.equal(definition.output.schema.properties.text.type, 'string');
      const rendered = definition.output.render({}, { text: '结果' });
      assert.deepEqual(rendered, [{ type: 'text', text: '结果' }]);
    }
  });

  it('does not throw into the runtime for bad arguments or domain failures', async () => {
    const taskTool = tools.byName('annotation_tasks');
    await assert.doesNotReject(() => execute(taskTool, { action: 'save' }));
    await assert.doesNotReject(() => execute(taskTool, { action: 'bogus' }));
  });
});

/* ------------------------------------------------------------------------- *
 * annotation_project
 * ------------------------------------------------------------------------- */

describe('annotation_project', () => {
  it('lists projects and marks the active one', async () => {
    const result = await execute(tools.byName('annotation_project'), { action: 'list' });
    assert.match(result.text, /共 1 个项目/);
    assert.match(result.text, /proj-tools/);
    assert.match(result.text, /当前项目/);
  });

  it('creates a project and accepts schema as a JSON string', async () => {
    const result = await execute(tools.byName('annotation_project'), {
      action: 'create',
      name: '新批次',
      template: 'text_span',
      schema: '{"fields":[{"id":"spans","label":"片段","type":"spans"}]}',
    });
    assert.match(result.text, /已创建项目/);
    const [call] = tools.store.callsOf('createProject');
    assert.equal(call.payload.name, '新批次');
    assert.equal(call.payload.template, 'text_span');
    assert.equal(call.payload.schema.fields[0].type, 'spans');
    assert.deepEqual(call.payload.actor, { id: 'actor-tools', name: '工具测试员' });
  });

  it('opens a project by selecting it on the device', async () => {
    const result = await execute(tools.byName('annotation_project'), { action: 'open', project: 'proj-tools' });
    assert.match(result.text, /已打开项目/);
    assert.equal(tools.store.callsOf('setDevice')[0].payload.patch.activeProject, 'proj-tools');
    assert.equal(tools.store.callsOf('getProject').length, 1);
  });

  it('reports project status with counts, fields and single-user settings', async () => {
    const result = await execute(tools.byName('annotation_project'), { action: 'status' });
    assert.match(result.text, /# 工具项目/);
    assert.match(result.text, /已提交 1/);
    assert.match(result.text, /segments/);
    assert.match(result.text, /单机=是/);
    assert.equal(result.text.includes('成员（'), false);
  });

  it('reads and writes the guideline', async () => {
    const got = await execute(tools.byName('annotation_project'), { action: 'get_guideline' });
    assert.match(got.text, /# 项目规范/);
    assert.match(got.text, /按语义切句/);
    const put = await execute(tools.byName('annotation_project'), { action: 'set_guideline', guideline: '# 新规范' });
    assert.match(put.text, /已更新项目规范/);
    assert.equal(tools.store.callsOf('setGuideline')[0].payload.text, '# 新规范');
    const missing = await execute(tools.byName('annotation_project'), { action: 'set_guideline' });
    assert.match(missing.text, /^失败: BAD_INPUT — /);
  });

  it('reads and writes the schema', async () => {
    const got = await execute(tools.byName('annotation_project'), { action: 'get_schema' });
    assert.match(got.text, /# 字段 schema/);
    assert.match(got.text, /segments \(segments\)/);
    const put = await execute(tools.byName('annotation_project'), {
      action: 'set_schema',
      schema: { fields: [{ id: 'label', label: '标签', type: 'text' }] },
    });
    assert.match(put.text, /已更新 schema/);
    assert.equal(tools.store.callsOf('setSchema')[0].payload.schema.fields[0].id, 'label');
    const badJson = await execute(tools.byName('annotation_project'), { action: 'set_schema', schema: '{nope' });
    assert.match(badJson.text, /^失败: INVALID_JSON — /);
  });

  it('seeds demo data on the selected project', async () => {
    const result = await execute(tools.byName('annotation_project'), { action: 'demo', project: 'proj-tools' });
    assert.match(result.text, /示例数据已写入/);
    assert.equal(tools.store.callsOf('setDevice')[0].payload.patch.activeProject, 'proj-tools');
    assert.equal(tools.store.callsOf('seedDemo').length, 1);
  });

  it('returns readable text for a missing project and unknown action', async () => {
    const missing = await execute(tools.byName('annotation_project'), { action: 'status', project: 'missing' });
    assert.match(missing.text, /^失败: PROJECT_NOT_FOUND — /);
    assert.match(missing.text, /修复建议：/);
    const unknown = await execute(tools.byName('annotation_project'), { action: 'nope' });
    assert.match(unknown.text, /^失败: BAD_ACTION — /);
  });

  it('requires a name when creating', async () => {
    const result = await execute(tools.byName('annotation_project'), { action: 'create' });
    assert.match(result.text, /^失败: NAME_REQUIRED — /);
  });
});

/* ------------------------------------------------------------------------- *
 * annotation_tasks
 * ------------------------------------------------------------------------- */

describe('annotation_tasks', () => {
  it('returns the next task with schema fields and actor identity', async () => {
    const result = await execute(tools.byName('annotation_tasks'), { action: 'next' });
    assert.match(result.text, /# 条目 item-1/);
    assert.match(result.text, /segments/);
    const [call] = tools.store.callsOf('next');
    assert.equal(call.payload.options.mode, 'annotate');
    assert.deepEqual(call.payload.options.actor, { id: 'actor-tools', name: '工具测试员' });
  });

  it('reports an empty queue readably', async () => {
    tools.store.next = async () => null;
    const result = await execute(tools.byName('annotation_tasks'), { action: 'next', mode: 'review' });
    assert.match(result.text, /没有待复核条目/);
    const annotate = await execute(tools.byName('annotation_tasks'), { action: 'next' });
    assert.match(annotate.text, /队列为空/);
  });

  it('lists the queue with filter, mode and limit', async () => {
    const result = await execute(tools.byName('annotation_tasks'), {
      action: 'list',
      mode: 'review',
      filter: { status: 'submitted' },
      limit: 5,
    });
    assert.match(result.text, /队列（复核）/);
    assert.match(result.text, /item-1/);
    const [call] = tools.store.callsOf('queue');
    assert.equal(call.payload.options.mode, 'review');
    assert.deepEqual(call.payload.options.filter, { status: 'submitted' });
    assert.equal(call.payload.options.limit, 5);
  });

  it('gets one item and reports a missing one', async () => {
    const result = await execute(tools.byName('annotation_tasks'), { action: 'get', itemId: 'item-1' });
    assert.match(result.text, /# 条目 item-1/);
    assert.match(result.text, /已有标注/);
    const missing = await execute(tools.byName('annotation_tasks'), { action: 'get', itemId: 'missing' });
    assert.match(missing.text, /^失败: ITEM_NOT_FOUND — /);
    const empty = await execute(tools.byName('annotation_tasks'), { action: 'get' });
    assert.match(empty.text, /^失败: ITEM_ID_REQUIRED — /);
  });

  it('saves drafts by default and submits when asked', async () => {
    const draft = await execute(tools.byName('annotation_tasks'), {
      action: 'save',
      itemId: 'item-1',
      labels: { segments: [] },
    });
    assert.match(draft.text, /已保存标注：item-1（状态 draft）/);
    const [call] = tools.store.callsOf('saveLabel');
    assert.equal(call.payload.input.status, 'draft');
    assert.deepEqual(call.payload.input.labels, { segments: [] });
    assert.equal(call.payload.input.durationMs, 0);
  });

  it('returns a readable failure with a hint when validation rejects a submit', async () => {
    const result = await execute(tools.byName('annotation_tasks'), {
      action: 'save',
      itemId: 'item-1',
      labels: {},
      status: 'submitted',
    });
    assert.match(result.text, /^失败: VALIDATION_FAILED — 提交前校验未通过/);
    assert.match(result.text, /修复建议：/);
    assert.match(result.text, /get_schema/);
  });

  it('skips and flags items through saveLabel', async () => {
    const skipped = await execute(tools.byName('annotation_tasks'), { action: 'skip', itemId: 'item-1' });
    assert.match(skipped.text, /已跳过条目/);
    const flagged = await execute(tools.byName('annotation_tasks'), { action: 'flag', itemId: 'item-1', note: '音画不同步' });
    assert.match(flagged.text, /已标记问题/);
    const statuses = tools.store.callsOf('saveLabel').map((call) => call.payload.input.status);
    assert.deepEqual(statuses, ['skipped', 'flagged']);
  });

  it('reviews items and rejects removed claim actions', async () => {
    const approved = await execute(tools.byName('annotation_tasks'), {
      action: 'review',
      itemId: 'item-1',
      decision: 'approve',
      comment: '好',
    });
    assert.match(approved.text, /通过/);
    const [reviewCall] = tools.store.callsOf('review');
    assert.equal(reviewCall.payload.input.decision, 'approve');
    assert.equal(reviewCall.payload.input.comment, '好');

    const rejected = await execute(tools.byName('annotation_tasks'), { action: 'review', itemId: 'item-1', decision: 'reject' });
    assert.match(rejected.text, /退回/);
    const invalid = await execute(tools.byName('annotation_tasks'), { action: 'review', itemId: 'item-1', decision: 'maybe' });
    assert.match(invalid.text, /^失败: DECISION_INVALID — /);

    for (const action of ['claim', 'release']) {
      const result = await execute(tools.byName('annotation_tasks'), { action, itemId: 'item-1' });
      assert.match(result.text, /^失败: BAD_ACTION — /);
    }
  });

  it('rejects an invalid label status before calling the store', async () => {
    const result = await execute(tools.byName('annotation_tasks'), {
      action: 'save',
      itemId: 'item-1',
      status: 'approved',
    });
    assert.match(result.text, /^失败: STATUS_INVALID — /);
    assert.equal(tools.store.callsOf('saveLabel').length, 0);
  });
});

/* ------------------------------------------------------------------------- *
 * annotation_data
 * ------------------------------------------------------------------------- */

describe('annotation_data', () => {
  it('imports from an absolute source with the device actor', async () => {
    const result = await execute(tools.byName('annotation_data'), {
      action: 'import',
      source: 'D:/data/items.jsonl',
      format: 'jsonl',
      copyMedia: false,
    });
    assert.match(result.text, /# 导入完成/);
    assert.match(result.text, /新增 5 条/);
    const [call] = tools.store.callsOf('importItems');
    assert.equal(call.payload.options.source, 'D:/data/items.jsonl');
    assert.equal(call.payload.options.format, 'jsonl');
    assert.equal(call.payload.options.copyMedia, false);
    assert.deepEqual(call.payload.options.actor, { id: 'actor-tools', name: '工具测试员' });
  });

  it('requires a source for import', async () => {
    const result = await execute(tools.byName('annotation_data'), { action: 'import' });
    assert.match(result.text, /^失败: SOURCE_REQUIRED — /);
  });

  it('exports with format, scope and itemId', async () => {
    const result = await execute(tools.byName('annotation_data'), {
      action: 'export',
      format: 'csv',
      scope: 'all',
      itemId: 'item-1',
    });
    assert.match(result.text, /# 导出完成/);
    assert.match(result.text, /export.jsonl/);
    const [call] = tools.store.callsOf('exportData');
    assert.equal(call.payload.options.format, 'csv');
    assert.equal(call.payload.options.scope, 'all');
    assert.equal(call.payload.options.itemId, 'item-1');
  });

  it('accepts target as a format alias and rejects unknown formats', async () => {
    const alias = await execute(tools.byName('annotation_data'), { action: 'export', target: 'srt' });
    assert.match(alias.text, /# 导出完成/);
    assert.equal(tools.store.callsOf('exportData')[0].payload.options.format, 'srt');
    const invalid = await execute(tools.byName('annotation_data'), { action: 'export', format: 'xlsx' });
    assert.match(invalid.text, /^失败: FORMAT_INVALID — /);
  });

  it('renders stats with counts, actors and distribution', async () => {
    const result = await execute(tools.byName('annotation_data'), { action: 'stats' });
    assert.match(result.text, /# 项目统计/);
    assert.match(result.text, /今日提交 2/);
    assert.match(result.text, /工具测试员/);
    assert.match(result.text, /zh=2/);
  });

  it('renders agreement including the gold comparison', async () => {
    const result = await execute(tools.byName('annotation_data'), { action: 'agreement' });
    assert.match(result.text, /# 一致性/);
    assert.match(result.text, /总体一致性：50\.0%/);
    assert.match(result.text, /金标/);
  });

  it('renders validation errors and warnings', async () => {
    const result = await execute(tools.byName('annotation_data'), { action: 'validate', itemId: 'item-1' });
    assert.match(result.text, /# 校验结果/);
    assert.match(result.text, /结论：未通过/);
    assert.match(result.text, /缺少分段/);
    assert.match(result.text, /空备注/);
    assert.equal(tools.store.callsOf('validate')[0].payload.options.itemId, 'item-1');
  });

  it('writes gold labels and validates the payload shape', async () => {
    const result = await execute(tools.byName('annotation_data'), {
      action: 'gold',
      itemId: 'item-1',
      labels: { segments: [] },
    });
    assert.match(result.text, /已写入金标/);
    const [call] = tools.store.callsOf('setGold');
    assert.deepEqual(call.payload.options.labels, { segments: [] });
    const missing = await execute(tools.byName('annotation_data'), { action: 'gold', itemId: 'item-1' });
    assert.match(missing.text, /^失败: LABELS_INVALID — /);
  });

  it('returns a readable failure for unknown actions', async () => {
    const result = await execute(tools.byName('annotation_data'), { action: 'bogus' });
    assert.match(result.text, /^失败: BAD_ACTION — /);
    assert.match(result.text, /修复建议：/);
  });
});
