/**
 * HTTP API contract tests.
 *
 * The real store is deliberately not imported: `lib/api.js` is exercised
 * against an in-memory fake that only implements the documented store surface.
 * Media and export routes need real bytes, so the fake stores run on a temp
 * directory that the test creates and removes.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createApi } from '../lib/api.js';
import { resolveInside } from '../lib/util.js';

const API = '/annotation/api';

/* ------------------------------------------------------------------------- *
 * Request/response mocks
 * ------------------------------------------------------------------------- */

/** Node-like request backed by a real Readable stream. */
function makeRequest({ method = 'GET', url, headers = {}, body = undefined } = {}) {
  const chunks = [];
  if (body !== undefined) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

/** JSON write request with the correct headers filled in. */
function jsonRequest(method, url, payload, headers = {}) {
  const text = JSON.stringify(payload ?? {});
  return makeRequest({
    method,
    url,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(text)),
      ...headers,
    },
    body: text,
  });
}

/** Node-like response: records headers and body, tracks headersSent. */
class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.started = false;
  }

  get headersSent() {
    return this.started;
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }

  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }

  removeHeader(name) {
    delete this.headers[String(name).toLowerCase()];
  }

  _write(chunk, _encoding, callback) {
    this.started = true;
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  end(chunk, encoding, callback) {
    this.started = true;
    return super.end(chunk, encoding, callback);
  }

  body() {
    return Buffer.concat(this.chunks);
  }

  text() {
    return this.body().toString('utf8');
  }

  json() {
    return JSON.parse(this.text());
  }
}

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
    counts: { total: 2, unlabeled: 0, in_progress: 1, submitted: 1, approved: 0, rejected: 0, flagged: 0 },
    actors: [{ actorId: 'actor-test', actorName: '测试员', submitted: 1, approved: 0, avgDurationMs: 1200 }],
    today: { submitted: 1, approved: 0 },
    reviewBacklog: 1,
    labelDistribution: { news: 1 },
    recent: [{ ts: '2026-10-20T00:00:00.000Z', actorName: '测试员', action: 'label.save', itemId: 'item-1' }],
  };
}

/**
 * @param {{ root: string, mediaFile: string }} paths
 */
function createFakeStore({ root, mediaFile }) {
  const state = {
    calls: [],
    device: {
      actorId: 'actor-test',
      actorName: '测试员',
      onboarded: true,
      dataRoot: root,
      activeProject: 'proj-1',
      openOnStart: true,
      ui: {},
    },
    project: {
      formatVersion: 1,
      id: 'proj-1',
      name: '测试项目',
      description: '',
      template: 'custom',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      revision: 1,
      schema: { fields: [{ id: 'label', label: '标签', type: 'text' }] },
      settings: { exportScope: 'approved', selfReview: false, assignmentMode: 'free', allowExternalMedia: false },
    },
  };

  const record = (name, payload) => {
    state.calls.push({ name, payload });
  };
  const callsOf = (name) => state.calls.filter((entry) => entry.name === name);

  const detail = (itemId = 'item-1', overrides = {}) => ({
    item: {
      id: itemId,
      kind: 'text',
      media: [],
      payload: { text: '示例文本' },
      meta: { durationMs: null, width: null, height: null, fps: null },
      batch: 'A',
      tags: [],
      priority: 0,
      createdAt: '2026-10-20T00:00:00.000Z',
    },
    annotations: [],
    reviews: [],
    claim: null,
    media: [{
      index: 0,
      name: 'blob.bin',
      mime: 'application/octet-stream',
      url: `${API}/projects/proj-1/media/${itemId}/0`,
    }],
    status: 'submitted',
    myStatus: 'draft',
    review: 'pending',
    finalLabels: {},
    assignedTo: null,
    project: {
      id: 'proj-1',
      name: '测试项目',
      template: 'custom',
      schema: state.project.schema,
      settings: state.project.settings,
      revision: state.project.revision,
    },
    serverTime: '2026-10-20T00:00:00.000Z',
    ...overrides,
  });

  const projectDetail = () => ({
    project: { ...state.project },
    stats: makeStats(),
    members: [{ actorId: 'actor-test', actorName: '测试员', role: 'admin', lastActive: '2026-10-20T00:00:00.000Z' }],
    counts: { total: 2, unlabeled: 0, in_progress: 1, submitted: 1, approved: 0, rejected: 0, flagged: 0 },
    templates: [{ id: 'custom', title: '自定义', description: '', kind: 'text', fieldCount: 2 }],
  });

  const store = {
    state,
    callsOf,
    templates: [{ id: 'custom', title: '自定义', description: '', kind: 'text', fieldCount: 2 }],

    async health() {
      record('health', {});
      return {
        ok: true,
        version: '1.0.0',
        dataRoot: root,
        actor: { id: state.device.actorId, name: state.device.actorName },
        projectCount: 1,
      };
    },

    async getDevice() {
      record('getDevice', {});
      return { ...state.device, ui: { ...state.device.ui } };
    },

    async setDevice(patch = {}) {
      record('setDevice', { patch });
      if (typeof patch.actorName === 'string' && patch.actorName.trim() !== '') {
        state.device.actorName = patch.actorName.trim();
      }
      if (typeof patch.activeProject === 'string' || patch.activeProject === null) {
        state.device.activeProject = patch.activeProject;
      }
      if (patch.ui && typeof patch.ui === 'object') state.device.ui = { ...state.device.ui, ...patch.ui };
      return { ...state.device, ui: { ...state.device.ui } };
    },

    async listProjects() {
      record('listProjects', {});
      return [{
        id: state.project.id,
        name: state.project.name,
        template: state.project.template,
        description: state.project.description,
        createdAt: state.project.createdAt,
        updatedAt: state.project.updatedAt,
        revision: state.project.revision,
        itemCount: 2,
      }];
    },

    async createProject(input = {}) {
      record('createProject', input);
      const project = {
        ...state.project,
        id: 'proj-2',
        name: input.name ?? '未命名',
        template: input.template ?? 'custom',
        description: input.description ?? '',
        revision: 1,
        schema: input.schema ?? { fields: [] },
      };
      state.device.activeProject = project.id;
      return {
        project,
        stats: makeStats(),
        members: [],
        counts: { total: 0, unlabeled: 0, in_progress: 0, submitted: 0, approved: 0, rejected: 0, flagged: 0 },
        templates: store.templates,
      };
    },

    async getProject(ref) {
      record('getProject', { ref });
      if (ref === 'missing') throw storeError('PROJECT_NOT_FOUND', '找不到项目：missing', 404);
      return projectDetail();
    },

    async updateProject(ref, patch = {}, expectedRevision = undefined) {
      record('updateProject', { ref, patch, expectedRevision });
      if (ref === 'missing') throw storeError('PROJECT_NOT_FOUND', '找不到项目：missing', 404);
      if (expectedRevision !== undefined && Number(expectedRevision) !== state.project.revision) {
        throw storeError('REVISION_CONFLICT', '项目已被其他人修改，请刷新后重试', 409, { revision: state.project.revision });
      }
      if (typeof patch.name === 'string' && patch.name.trim() !== '') state.project.name = patch.name.trim();
      if (typeof patch.description === 'string') state.project.description = patch.description;
      if (patch.settings && typeof patch.settings === 'object') state.project.settings = { ...state.project.settings, ...patch.settings };
      state.project.revision += 1;
      return projectDetail();
    },

    async deleteProject(ref, options = {}) {
      record('deleteProject', { ref, options });
      if (ref === 'missing') throw storeError('PROJECT_NOT_FOUND', '找不到项目：missing', 404);
      if (String(options.confirmName || '') !== '测试项目') {
        throw storeError('CONFIRM_MISMATCH', '请输入完整的项目名称以确认删除', 422);
      }
      if (options.mode !== undefined && options.mode !== 'trash' && options.mode !== 'purge') {
        throw storeError('INVALID_DELETE_MODE', '删除方式非法', 400);
      }
      return {
        deleted: true,
        id: ref,
        name: '测试项目',
        mode: options.mode || 'trash',
        ...(options.mode === 'trash' ? { trashName: `${ref}-20261020-000000` } : {}),
      };
    },

    async getGuideline(ref) {
      record('getGuideline', { ref });
      return { text: '# 测试规范\n\n只测边界情况。', revision: state.project.revision };
    },

    async setGuideline(ref, text, expectedRevision = undefined) {
      record('setGuideline', { ref, text, expectedRevision });
      if (typeof text !== 'string') throw storeError('GUIDELINE_INVALID', 'text 非法', 400);
      state.project.revision += 1;
      return projectDetail();
    },

    async setSchema(ref, schema, expectedRevision = undefined) {
      record('setSchema', { ref, schema, expectedRevision });
      if (!schema || typeof schema !== 'object' || !Array.isArray(schema.fields)) {
        throw storeError('SCHEMA_INVALID', '字段 schema 不合法', 422, [{ field: 'fields', message: '必须是数组' }]);
      }
      state.project.schema = schema;
      state.project.revision += 1;
      return projectDetail();
    },

    async previewImport(ref, options = {}) {
      record('previewImport', { ref, options });
      if (options.source === undefined || options.source === '') {
        throw storeError('SOURCE_REQUIRED', '请填写导入路径', 400);
      }
      // Deliberately absolute: the API must echo the user input, not this path.
      return {
        source: join(root, 'data.jsonl'),
        format: options.format ?? 'jsonl',
        columns: ['id', 'text'],
        sample: [{ id: 'a', text: 'hello' }],
        warnings: [],
        suggestedMapping: { id: 'id', text: 'text', media: '' },
        project: 'proj-1',
      };
    },

    async importItems(ref, options = {}) {
      record('importItems', { ref, options });
      if (!options.source) throw storeError('SOURCE_REQUIRED', '请填写导入路径', 400);
      return {
        imported: 3,
        skipped: 1,
        warnings: ['有一行不是合法 JSON'],
        mediaFiles: ['media/a.png'],
        missingMedia: [],
        project: 'proj-1',
      };
    },

    async queue(ref, options = {}) {
      record('queue', { ref, options });
      return {
        items: [{
          id: 'item-1',
          kind: 'text',
          preview: '示例文本',
          status: 'submitted',
          myStatus: 'draft',
          review: 'pending',
          actors: ['测试员'],
          mediaCount: 0,
          batch: 'A',
          tags: [],
          priority: 0,
          claimedBy: null,
          assignedTo: null,
          updatedAt: '2026-10-20T00:00:00.000Z',
        }],
        nextCursor: null,
        total: 1,
        counts: { total: 2, submitted: 1 },
      };
    },

    async next(ref, options = {}) {
      record('next', { ref, options });
      return detail('item-1');
    },

    async getItem(ref, itemId, actor) {
      record('getItem', { ref, itemId, actor });
      if (itemId === 'missing') throw storeError('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
      return detail(itemId);
    },

    async saveLabel(ref, input = {}) {
      record('saveLabel', { ref, input });
      return { ...detail(input.itemId), myStatus: input.status ?? 'draft', warnings: [] };
    },

    async review(ref, input = {}) {
      record('review', { ref, input });
      if (input.itemId === 'self') throw storeError('SELF_REVIEW', '不能复核自己标注的条目', 403);
      return { ...detail(input.itemId), review: input.decision === 'approve' ? 'approved' : 'rejected', status: input.decision === 'approve' ? 'approved' : 'rejected' };
    },

    async claim(ref, input = {}) {
      record('claim', { ref, input });
      return { claim: { itemId: input.itemId, actorId: 'actor-test', expiresAt: '2026-10-20T00:15:00.000Z' } };
    },

    async release(ref, input = {}) {
      record('release', { ref, input });
      return { released: true };
    },

    async updateMeta(ref, input = {}) {
      record('updateMeta', { ref, input });
      return { itemId: input.itemId, meta: input.meta ?? {} };
    },

    async stats(ref) {
      record('stats', { ref });
      return makeStats();
    },

    async agreement(ref) {
      record('agreement', { ref });
      return { itemsCompared: 2, fields: [{ field: 'label', type: 'text', pairs: 2, score: 0.8 }], overall: 0.8, gold: null };
    },

    async activity(ref, limit) {
      record('activity', { ref, limit });
      return [{ type: 'activity', action: 'label.save', actorId: 'actor-test', ts: '2026-10-20T00:00:00.000Z', detail: {} }];
    },

    async members(ref) {
      record('members', { ref });
      return [{ actorId: 'actor-test', actorName: '测试员', role: 'admin', lastActive: '2026-10-20T00:00:00.000Z' }];
    },

    async exportData(ref, options = {}) {
      record('exportData', { ref, options });
      return {
        files: [{
          name: 'export.jsonl',
          path: join(root, 'proj-1', 'exports', 'export.jsonl'),
          urlPath: 'exports/export.jsonl',
          size: 2048,
          mime: 'application/x-ndjson',
        }],
        dir: join(root, 'proj-1', 'exports'),
        summary: { items: 2, format: options.format ?? 'jsonl' },
      };
    },

    async assign(ref, options = {}) {
      record('assign', { ref, options });
      return { mode: options.mode ?? 'round-robin', assignments: {}, count: 0 };
    },

    async setGold(ref, options = {}) {
      record('setGold', { ref, options });
      return { itemId: options.itemId, labels: options.labels ?? {} };
    },

    async validate(ref, options = {}) {
      record('validate', { ref, options });
      return { ok: true, checked: 2, errors: [], warnings: [] };
    },

    async mediaPath(ref, itemId, index) {
      record('mediaPath', { ref, itemId, index });
      if (itemId === 'missing') throw storeError('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
      if (Number(index) !== 0) throw storeError('MEDIA_NOT_FOUND', '条目没有这个媒体文件', 404);
      return { absPath: mediaFile, mime: 'application/octet-stream', size: 1000, name: 'blob.bin', mtimeMs: 0 };
    },

    async resolveExport(ref, relPath) {
      record('resolveExport', { ref, relPath });
      const base = resolveInside(join(root, 'proj-1'), 'exports');
      const abs = resolveInside(base, relPath); // plain Error on traversal, like the real store
      let info;
      try {
        info = await stat(abs);
      } catch {
        throw storeError('EXPORT_NOT_FOUND', `导出文件不存在：${relPath}`, 404);
      }
      return { absPath: abs, size: info.size, name: 'export.jsonl', mime: 'application/x-ndjson' };
    },

    async projectDirOf(ref) {
      record('projectDirOf', { ref });
      return join(root, 'proj-1');
    },

    async seedDemo(actor) {
      record('seedDemo', { actor });
      return { project: state.device.activeProject ?? 'proj-1', imported: 2, skipped: 0 };
    },

    async close() {},
  };

  return store;
}

/* ------------------------------------------------------------------------- *
 * Harness
 * ------------------------------------------------------------------------- */

let root;
let projectDir;
let mediaFile;
let store;
let api;

/** Context whose connection service always accepts (or rejects with `rejection`). */
function makeCtx(rejection = undefined) {
  return {
    get(name) {
      if (name === 'connection') {
        return { requestRejection: () => rejection };
      }
      return undefined;
    },
    logger: { info() {}, warn() {}, error() {} },
  };
}

function makeApi(overrides = {}) {
  return createApi({
    store,
    ctx: overrides.ctx ?? makeCtx(),
    config: { maxJsonBodyBytes: 4 * 1024 * 1024, mediaCacheSeconds: 60, clientErrorFile: join(root, 'client-errors.jsonl'), ...overrides.config },
  });
}

async function get(pathname, headers = {}) {
  const res = new MockResponse();
  await api.handle(makeRequest({ method: 'GET', url: `${API}${pathname}`, headers }), res);
  return res;
}

async function send(method, pathname, payload, headers = {}) {
  const res = new MockResponse();
  await api.handle(jsonRequest(method, `${API}${pathname}`, payload, headers), res);
  return res;
}

async function deleteRequest(pathname) {
  const res = new MockResponse();
  await api.handle(makeRequest({ method: 'DELETE', url: `${API}${pathname}`, headers: {} }), res);
  return res;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aw-api-'));
  projectDir = join(root, 'proj-1');
  await mkdir(join(projectDir, 'media'), { recursive: true });
  await mkdir(join(projectDir, 'exports'), { recursive: true });
  mediaFile = join(projectDir, 'media', 'blob.bin');
  const bytes = Buffer.alloc(1000);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256;
  await writeFile(mediaFile, bytes);
  await writeFile(join(projectDir, 'exports', 'export.jsonl'), '{"id":"a"}\n{"id":"b"}\n', 'utf8');
  await writeFile(join(projectDir, 'secret.txt'), 'do not serve me', 'utf8');
  store = createFakeStore({ root, mediaFile });
  api = makeApi();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------------------- *
 * Auth / routing
 * ------------------------------------------------------------------------- */

describe('auth fence', () => {
  it('rejects with 401 when the connection fence says unauthenticated', async () => {
    const guarded = createApi({ store, ctx: makeCtx(401), config: {} });
    const res = new MockResponse();
    await guarded.handle(makeRequest({ method: 'GET', url: `${API}/health` }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, 'UNAUTHORIZED');
  });

  it('rejects with 403 when the request is not trusted', async () => {
    const guarded = createApi({ store, ctx: makeCtx(403), config: {} });
    const res = new MockResponse();
    await guarded.handle(makeRequest({ method: 'POST', url: `${API}/projects` }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'FORBIDDEN');
  });

  it('stops before touching the store when rejected', async () => {
    const guarded = createApi({ store, ctx: makeCtx(401), config: {} });
    const res = new MockResponse();
    await guarded.handle(makeRequest({ method: 'GET', url: `${API}/health` }), res);
    assert.equal(store.callsOf('health').length, 0);
  });
});

describe('routing', () => {
  it('serves GET /health and reports the data root', async () => {
    const res = await get('/health');
    assert.equal(res.statusCode, 200);
    const payload = res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.dataRoot, root);
    assert.equal(payload.actor.id, 'actor-test');
    assert.equal(payload.actor.actorId, 'actor-test');
    assert.equal(payload.actor.actorName, '测试员');
  });

  it('404s an unknown API path', async () => {
    const res = await get('/does/not/exist');
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'NOT_FOUND');
  });

  it('404s a request outside the prefix', async () => {
    const res = new MockResponse();
    await api.handle(makeRequest({ method: 'GET', url: '/annotation/other' }), res);
    assert.equal(res.statusCode, 404);
  });

  it('405s a known path with the wrong method and advertises Allow', async () => {
    const res = await deleteRequest('/health');
    assert.equal(res.statusCode, 405);
    assert.equal(res.json().error.code, 'METHOD_NOT_ALLOWED');
    assert.equal(res.headers.allow, 'GET');
  });

  it('handles HEAD as GET for the API root', async () => {
    const res = new MockResponse();
    await api.handle(makeRequest({ method: 'GET', url: `${API}/` }), res);
    assert.equal(res.statusCode, 200);
  });
});

/* ------------------------------------------------------------------------- *
 * Device / templates / projects
 * ------------------------------------------------------------------------- */

describe('client error log', () => {
  it('appends one authenticated client error and dedupes repeats', async () => {
    const payload = {
      kind: 'slot',
      message: 'boom from render',
      stack: 'Error: boom\n    at WorkbenchApp',
      componentStack: '\n    in WorkbenchApp',
      href: 'dsh-app://app/',
      version: '1.0.0',
    };
    const first = await send('POST', '/client-error', payload);
    assert.equal(first.statusCode, 204);
    const second = await send('POST', '/client-error', payload);
    assert.equal(second.statusCode, 204);
    const text = await readFile(join(root, 'client-errors.jsonl'), 'utf8');
    const lines = text.trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.kind, 'slot');
    assert.equal(record.message, 'boom from render');
    assert.ok(record.serverTs);
  });

  it('rejects an unauthenticated client error', async () => {
    const guarded = createApi({
      store,
      ctx: makeCtx(401),
      config: { clientErrorFile: join(root, 'client-errors.jsonl') },
    });
    const res = new MockResponse();
    await guarded.handle(jsonRequest('POST', `${API}/client-error`, { message: 'x' }), res);
    assert.equal(res.statusCode, 401);
  });

  it('rejects a client error payload above 64 KB', async () => {
    const res = await send('POST', '/client-error', { kind: 'slot', message: 'x'.repeat(70 * 1024) });
    assert.equal(res.statusCode, 413);
  });
});

describe('device', () => {
  it('returns the device shape', async () => {
    const res = await get('/device');
    assert.equal(res.statusCode, 200);
    const device = res.json();
    assert.equal(device.actorId, 'actor-test');
    assert.equal(device.actorName, '测试员');
    assert.equal(device.openOnStart, true);
    assert.equal(device.activeProject, 'proj-1');
    assert.equal(typeof device.ui, 'object');
  });

  it('updates the device with PUT and accepts PATCH as an alias', async () => {
    const put = await send('PUT', '/device', { actorName: '新名字', ui: { autosave: true } });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().actorName, '新名字');
    assert.equal(put.json().ui.autosave, true);
    const patch = await send('PATCH', '/device', { openOnStart: false });
    assert.equal(patch.statusCode, 200);
    assert.equal(store.callsOf('setDevice').length, 2);
  });
});

describe('projects', () => {
  it('lists templates', async () => {
    const res = await get('/templates');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json()));
    assert.equal(res.json()[0].id, 'custom');
  });

  it('lists projects', async () => {
    const res = await get('/projects');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json()));
    assert.equal(res.json()[0].id, 'proj-1');
  });

  it('creates a project with the device actor', async () => {
    const res = await send('POST', '/projects', { name: '第二轮', template: 'video_caption', description: '字幕' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().project.name, '第二轮');
    const [call] = store.callsOf('createProject');
    assert.equal(call.payload.name, '第二轮');
    assert.equal(call.payload.template, 'video_caption');
    assert.deepEqual(call.payload.actor, { id: 'actor-test', name: '测试员' });
  });

  it('creates a project with an explicit body actor (test seam)', async () => {
    await send('POST', '/projects', { name: 'X', actor: { id: 'actor-x', name: '外部' } });
    const [call] = store.callsOf('createProject');
    assert.deepEqual(call.payload.actor, { id: 'actor-x', name: '外部' });
  });

  it('returns project detail and 404s a missing project', async () => {
    const res = await get('/projects/proj-1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().project.id, 'proj-1');
    assert.ok(res.json().stats.counts);
    const missing = await get('/projects/missing');
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'PROJECT_NOT_FOUND');
  });

  it('PATCHes with revision guard and maps a stale revision to 409', async () => {
    const stale = await send('PATCH', '/projects/proj-1', { name: '新名', revision: 99 });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, 'REVISION_CONFLICT');
    assert.equal(stale.json().error.details.revision, 1);
    const ok = await send('PATCH', '/projects/proj-1', { name: '新名', revision: 1 });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().project.name, '新名');
  });

  it('deletes a project only with the exact name confirmation', async () => {
    const ok = await send('DELETE', '/projects/proj-1', { confirmName: '测试项目', mode: 'trash' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().deleted, true);
    assert.equal(ok.json().mode, 'trash');
    const [call] = store.callsOf('deleteProject');
    assert.equal(call.payload.options.confirmName, '测试项目');
    assert.equal(call.payload.options.mode, 'trash');

    const mismatch = await send('DELETE', '/projects/proj-1', { confirmName: '错名', mode: 'trash' });
    assert.equal(mismatch.statusCode, 422);
    assert.equal(mismatch.json().error.code, 'CONFIRM_MISMATCH');

    const badMode = await send('DELETE', '/projects/proj-1', { confirmName: '测试项目', mode: 'nuke' });
    assert.equal(badMode.statusCode, 400);
    assert.equal(badMode.json().error.code, 'INVALID_DELETE_MODE');

    const missing = await send('DELETE', '/projects/missing', { confirmName: '测试项目', mode: 'trash' });
    assert.equal(missing.statusCode, 404);
  });

  it('applies schema/guideline passed through PATCH as compatibility', async () => {
    const res = await send('PATCH', '/projects/proj-1', {
      name: '别名兼容',
      schema: { fields: [{ id: 'tag', label: '标签', type: 'text' }] },
      guideline: '# 新规范',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(store.callsOf('setSchema').length, 1);
    assert.equal(store.callsOf('setGuideline').length, 1);
  });

  it('reads and writes the guideline', async () => {
    const got = await get('/projects/proj-1/guideline');
    assert.equal(got.statusCode, 200);
    assert.equal(got.json().revision, 1);
    assert.match(got.json().text, /测试规范/);
    const put = await send('PUT', '/projects/proj-1/guideline', { text: '# 新规范\n', revision: 1 });
    assert.equal(put.statusCode, 200);
    assert.equal(store.callsOf('setGuideline')[0].payload.text, '# 新规范\n');
    const invalid = await send('PUT', '/projects/proj-1/guideline', { text: 42 });
    assert.equal(invalid.statusCode, 422);
    assert.equal(invalid.json().error.code, 'GUIDELINE_REQUIRED');
  });

  it('reads and writes the schema', async () => {
    const got = await get('/projects/proj-1/schema');
    assert.equal(got.statusCode, 200);
    assert.equal(got.json().schema.fields[0].id, 'label');
    assert.equal(got.json().revision, 1);
    const put = await send('PUT', '/projects/proj-1/schema', {
      schema: { fields: [{ id: 'tag', label: '标签', type: 'select', options: [{ value: 'a', label: 'A' }] }] },
      revision: 1,
    });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().project.schema.fields[0].id, 'tag');
    const invalid = await send('PUT', '/projects/proj-1/schema', { schema: { nope: true } });
    assert.equal(invalid.statusCode, 422);
    assert.equal(invalid.json().error.code, 'SCHEMA_INVALID');
    assert.ok(Array.isArray(invalid.json().error.details));
  });
});

/* ------------------------------------------------------------------------- *
 * Import / queue / items
 * ------------------------------------------------------------------------- */

describe('import', () => {
  it('previews an import without leaking the resolved absolute source', async () => {
    const input = join(root, 'data.jsonl');
    const res = await send('POST', '/projects/proj-1/import/preview', { source: input, format: 'jsonl', mapping: { id: 'id' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().source, input);
    assert.equal(res.json().format, 'jsonl');
    assert.deepEqual(res.json().columns, ['id', 'text']);
    assert.equal(store.callsOf('previewImport')[0].payload.options.mapping.id, 'id');
  });

  it('imports with the device actor', async () => {
    const res = await send('POST', '/projects/proj-1/import', {
      source: join(root, 'data.jsonl'),
      format: 'jsonl',
      copyMedia: false,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().imported, 3);
    const [call] = store.callsOf('importItems');
    assert.equal(call.payload.options.copyMedia, false);
    assert.deepEqual(call.payload.options.actor, { id: 'actor-test', name: '测试员' });
  });
});

describe('queue', () => {
  it('passes mode/filter/q/cursor/limit to the store', async () => {
    const res = await get('/projects/proj-1/queue?mode=review&status=submitted&kind=text&q=abc&cursor=5&limit=10');
    assert.equal(res.statusCode, 200);
    const [call] = store.callsOf('queue');
    assert.equal(call.payload.options.mode, 'review');
    assert.deepEqual(call.payload.options.filter, { status: 'submitted', kind: 'text' });
    assert.equal(call.payload.options.q, 'abc');
    assert.equal(call.payload.options.cursor, 5);
    assert.equal(call.payload.options.limit, 10);
    assert.deepEqual(call.payload.options.actor, { id: 'actor-test', name: '测试员' });
    assert.equal(res.json().total, 1);
  });

  it('merges a JSON filter parameter with individual keys (client compatibility)', async () => {
    await get(`/projects/proj-1/queue?filter=${encodeURIComponent('{"status":"approved","assignedToMe":true}')}&tag=x`);
    const [call] = store.callsOf('queue');
    assert.deepEqual(call.payload.options.filter, { status: 'approved', assignedToMe: true, tag: 'x' });
  });

  it('400s a malformed filter parameter', async () => {
    const res = await get(`/projects/proj-1/queue?filter=${encodeURIComponent('{bad')}`);
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_FILTER');
  });

  it('wraps the next item in {item} and allows null', async () => {
    const res = await get('/projects/proj-1/next?mode=annotate');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().item.item.id, 'item-1');
    store.next = async () => null;
    const empty = await get('/projects/proj-1/next');
    assert.equal(empty.statusCode, 200);
    assert.equal(empty.json().item, null);
  });
});

describe('items', () => {
  it('returns item detail and 404s an unknown item', async () => {
    const res = await get('/projects/proj-1/items/item-1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().item.id, 'item-1');
    assert.ok(Array.isArray(res.json().media));
    const missing = await get('/projects/proj-1/items/missing');
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'ITEM_NOT_FOUND');
  });

  it('saves a label with status defaults to draft', async () => {
    const res = await send('POST', '/projects/proj-1/items/item-1/label', { labels: { label: '新闻' } });
    assert.equal(res.statusCode, 200);
    const [call] = store.callsOf('saveLabel');
    assert.equal(call.payload.input.itemId, 'item-1');
    assert.deepEqual(call.payload.input.labels, { label: '新闻' });
    assert.equal(call.payload.input.status, 'draft');
    assert.deepEqual(call.payload.input.actor, { id: 'actor-test', name: '测试员' });
  });

  it('saves a submitted label with note/duration', async () => {
    const res = await send('POST', '/projects/proj-1/items/item-1/label', {
      labels: { label: '新闻' },
      status: 'submitted',
      note: '边界情况',
      durationMs: 1200,
    });
    assert.equal(res.statusCode, 200);
    const [call] = store.callsOf('saveLabel');
    assert.equal(call.payload.input.status, 'submitted');
    assert.equal(call.payload.input.note, '边界情况');
    assert.equal(call.payload.input.durationMs, 1200);
  });

  it('accepts the collection-style label alias', async () => {
    const res = await send('POST', '/projects/proj-1/labels', { itemId: 'item-1', labels: { label: 'x' }, status: 'submitted' });
    assert.equal(res.statusCode, 200);
    assert.equal(store.callsOf('saveLabel')[0].payload.input.itemId, 'item-1');
    const aliasWithoutId = await send('POST', '/projects/proj-1/labels', { labels: {} });
    assert.equal(aliasWithoutId.statusCode, 422);
    assert.equal(aliasWithoutId.json().error.code, 'ITEM_ID_REQUIRED');
  });

  it('reviews an item and maps a domain 403', async () => {
    const ok = await send('POST', '/projects/proj-1/items/item-1/review', { decision: 'approve', comment: '好' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().status, 'approved');
    const self = await send('POST', '/projects/proj-1/items/self/review', { decision: 'reject' });
    assert.equal(self.statusCode, 403);
    assert.equal(self.json().error.code, 'SELF_REVIEW');
    assert.equal(store.callsOf('review').length, 2);
  });

  it('removed team routes return 404 in single-user mode', async () => {
    const claimed = await send('POST', '/projects/proj-1/items/item-1/claim', {});
    assert.equal(claimed.statusCode, 404);
    const released = await deleteRequest('/projects/proj-1/items/item-1/claim');
    assert.equal(released.statusCode, 404);
    const members = await get('/projects/proj-1/members');
    assert.equal(members.statusCode, 404);
    const assigned = await send('POST', '/projects/proj-1/assign', { mode: 'round-robin' });
    assert.equal(assigned.statusCode, 404);
  });

  it('updates item meta', async () => {
    const res = await send('POST', '/projects/proj-1/items/item-1/meta', { meta: { durationMs: 5000 } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().meta, { durationMs: 5000 });
    assert.deepEqual(store.callsOf('updateMeta')[0].payload.input.meta, { durationMs: 5000 });
  });
});

/* ------------------------------------------------------------------------- *
 * Media streaming
 * ------------------------------------------------------------------------- */

describe('media', () => {
  it('serves the whole file with Accept-Ranges and the exact length', async () => {
    const res = await get('/projects/proj-1/media/item-1/0');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.equal(res.headers['content-length'], '1000');
    assert.equal(res.headers['content-type'], 'application/octet-stream');
    assert.equal(res.body().length, 1000);
    assert.equal(res.body()[10], 10);
  });

  it('serves a byte range with 206 + Content-Range', async () => {
    const res = await get('/projects/proj-1/media/item-1/0', { range: 'bytes=100-199' });
    assert.equal(res.statusCode, 206);
    assert.equal(res.headers['content-range'], 'bytes 100-199/1000');
    assert.equal(res.headers['content-length'], '100');
    assert.equal(res.body().length, 100);
    assert.equal(res.body()[0], 100);
    assert.equal(res.body()[50], 150);
  });

  it('supports open-ended and suffix ranges', async () => {
    const tail = await get('/projects/proj-1/media/item-1/0', { range: 'bytes=900-' });
    assert.equal(tail.statusCode, 206);
    assert.equal(tail.headers['content-range'], 'bytes 900-999/1000');
    assert.equal(tail.body().length, 100);
    const suffix = await get('/projects/proj-1/media/item-1/0', { range: 'bytes=-50' });
    assert.equal(suffix.statusCode, 206);
    assert.equal(suffix.headers['content-range'], 'bytes 950-999/1000');
    assert.equal(suffix.body().length, 50);
  });

  it('416s an unsatisfiable range with Content-Range */size', async () => {
    const res = await get('/projects/proj-1/media/item-1/0', { range: 'bytes=2000-3000' });
    assert.equal(res.statusCode, 416);
    assert.equal(res.headers['content-range'], 'bytes */1000');
    assert.equal(res.json().error.code, 'RANGE_NOT_SATISFIABLE');
  });

  it('416s a malformed single range', async () => {
    const res = await get('/projects/proj-1/media/item-1/0', { range: 'bytes=abc-def' });
    assert.equal(res.statusCode, 416);
  });

  it('answers HEAD with headers and no body', async () => {
    const res = new MockResponse();
    await api.handle(makeRequest({ method: 'HEAD', url: `${API}/projects/proj-1/media/item-1/0` }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-length'], '1000');
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.equal(res.body().length, 0);
  });

  it('404s a missing media entry', async () => {
    const res = await get('/projects/proj-1/media/missing/0');
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'ITEM_NOT_FOUND');
  });
});

/* ------------------------------------------------------------------------- *
 * Stats / export / download / browse
 * ------------------------------------------------------------------------- */

describe('stats and friends', () => {
  it('serves stats, agreement and activity (no members route)', async () => {
    const stats = await get('/projects/proj-1/stats');
    assert.equal(stats.statusCode, 200);
    assert.equal(stats.json().counts.total, 2);
    const agreement = await get('/projects/proj-1/agreement');
    assert.equal(agreement.statusCode, 200);
    assert.equal(agreement.json().overall, 0.8);
    const activity = await get('/projects/proj-1/activity?limit=7');
    assert.equal(activity.statusCode, 200);
    assert.equal(store.callsOf('activity')[0].payload.limit, 7);
    const members = await get('/projects/proj-1/members');
    assert.equal(members.statusCode, 404);
  });
});

describe('export', () => {
  it('exports and strips absolute paths from the response', async () => {
    const res = await send('POST', '/projects/proj-1/export', { format: 'jsonl', scope: 'approved' });
    assert.equal(res.statusCode, 200);
    const payload = res.json();
    assert.equal(payload.files.length, 1);
    assert.equal(payload.files[0].name, 'export.jsonl');
    assert.equal(payload.files[0].size, 2048);
    assert.equal(payload.files[0].urlPath, 'exports/export.jsonl');
    assert.equal(
      payload.files[0].downloadPath,
      `${API}/projects/proj-1/download?path=exports%2Fexport.jsonl`,
    );
    assert.ok(!res.text().includes(root), 'response must not leak the data root');
    assert.ok(!res.text().includes(projectDir), 'response must not leak the project directory');
    assert.equal(store.callsOf('exportData')[0].payload.options.format, 'jsonl');
  });

  it('downloads an export file with attachment headers', async () => {
    const res = await get('/projects/proj-1/download?path=export.jsonl');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/x-ndjson');
    assert.match(String(res.headers['content-disposition']), /^attachment;/);
    assert.equal(res.text(), '{"id":"a"}\n{"id":"b"}\n');
  });

  it('accepts the export urlPath and downloadPath verbatim', async () => {
    const exported = await send('POST', '/projects/proj-1/export', { format: 'jsonl' });
    const { urlPath, downloadPath } = exported.json().files[0];
    // `downloadPath` is a complete API URL; use it as-is.
    const viaDownloadPath = new MockResponse();
    await api.handle(makeRequest({ method: 'GET', url: downloadPath }), viaDownloadPath);
    assert.equal(viaDownloadPath.statusCode, 200);
    assert.equal(viaDownloadPath.text(), '{"id":"a"}\n{"id":"b"}\n');
    // The project-relative `urlPath` works through ?path= too (exports/ stripped).
    const viaUrlPath = await get(`/projects/proj-1/download?path=${encodeURIComponent(urlPath)}`);
    assert.equal(viaUrlPath.statusCode, 200);
    assert.deepEqual(
      store.callsOf('resolveExport').map((call) => call.payload.relPath),
      ['export.jsonl', 'export.jsonl'],
    );
  });

  it('403s a traversal download outside exports', async () => {
    const dotdot = await get('/projects/proj-1/download?path=..%2Fsecret.txt');
    assert.equal(dotdot.statusCode, 403);
    assert.equal(dotdot.json().error.code, 'ROUTE_FORBIDDEN');
    assert.ok(!dotdot.text().includes('do not serve me'));
    const absolute = await get(`/projects/proj-1/download?path=${encodeURIComponent(join(projectDir, 'secret.txt'))}`);
    assert.equal(absolute.statusCode, 403);
    assert.equal(store.callsOf('resolveExport').length, 0);
  });

  it('404s a missing export file', async () => {
    const res = await get('/projects/proj-1/download?path=nope.jsonl');
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'EXPORT_NOT_FOUND');
  });

  it('400s a download without path', async () => {
    const res = await get('/projects/proj-1/download');
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'PATH_REQUIRED');
  });
});

describe('browse', () => {
  it('lists directories and files without content', async () => {
    const res = await get(`/browse?path=${encodeURIComponent(projectDir)}`);
    assert.equal(res.statusCode, 200);
    const payload = res.json();
    assert.equal(payload.path, projectDir);
    assert.ok(Array.isArray(payload.entries));
    const names = payload.entries.map((entry) => entry.name);
    assert.ok(names.includes('media'));
    assert.ok(names.includes('exports'));
    const media = payload.entries.find((entry) => entry.name === 'media');
    assert.equal(media.isDirectory, true);
    assert.equal(media.type, 'dir');
    assert.equal(media.size, 0);
    assert.ok(media.path.endsWith('media'));
    for (const entry of payload.entries) {
      assert.equal(typeof entry.isDirectory, 'boolean');
      assert.ok(!('content' in entry));
    }
  });

  it('defaults to the device data root', async () => {
    const res = await get('/browse');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().path, root);
  });

  it('404s a missing directory and 400s a file', async () => {
    const missing = await get(`/browse?path=${encodeURIComponent(join(root, 'nope'))}`);
    assert.equal(missing.statusCode, 404);
    const file = await get(`/browse?path=${encodeURIComponent(mediaFile)}`);
    assert.equal(file.statusCode, 400);
    assert.equal(file.json().error.code, 'NOT_DIRECTORY');
  });
});

/* ------------------------------------------------------------------------- *
 * Body limits / content-type / error mapping
 * ------------------------------------------------------------------------- */

describe('request body handling', () => {
  it('400s malformed JSON', async () => {
    const req = makeRequest({
      method: 'POST',
      url: `${API}/projects`,
      headers: { 'content-type': 'application/json', 'content-length': '7' },
      body: '{bad""',
    });
    const res = new MockResponse();
    await api.handle(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'BAD_JSON');
  });

  it('415s a write with a non-JSON content type', async () => {
    const req = makeRequest({
      method: 'POST',
      url: `${API}/projects`,
      headers: { 'content-type': 'text/plain', 'content-length': '2' },
      body: '{}',
    });
    const res = new MockResponse();
    await api.handle(req, res);
    assert.equal(res.statusCode, 415);
    assert.equal(res.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('413s a body above the configured cap', async () => {
    const big = 'x'.repeat(5 * 1024 * 1024);
    const req = makeRequest({
      method: 'POST',
      url: `${API}/projects`,
      headers: { 'content-type': 'application/json', 'content-length': String(big.length) },
      body: big,
    });
    const res = new MockResponse();
    await api.handle(req, res);
    assert.equal(res.statusCode, 413);
    assert.equal(res.json().error.code, 'PAYLOAD_TOO_LARGE');
    assert.equal(store.callsOf('createProject').length, 0);
  });

  it('accepts an empty body for bodyless POSTs (demo)', async () => {
    const req = makeRequest({
      method: 'POST',
      url: `${API}/projects/proj-1/demo`,
      headers: { 'content-length': '0' },
    });
    const res = new MockResponse();
    await api.handle(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().project, 'proj-1');
  });

  it('500s an unexpected store error without leaking internals', async () => {
    store.stats = async () => {
      throw new Error('E:/very/secret/path is broken');
    };
    const res = await get('/projects/proj-1/stats');
    assert.equal(res.statusCode, 500);
    assert.equal(res.json().error.code, 'INTERNAL_ERROR');
    assert.ok(!res.text().includes('very/secret'));
  });

  it('maps an AppError-shaped failure to its status/code/details', async () => {
    store.validate = async () => {
      throw storeError('VALIDATION_FAILED', '提交前校验未通过', 422, [{ field: 'label', message: '必填' }]);
    };
    const res = await send('POST', '/projects/proj-1/validate', {});
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error.code, 'VALIDATION_FAILED');
    assert.equal(res.json().error.details[0].field, 'label');
  });
});

/* ------------------------------------------------------------------------- *
 * Remaining mutating routes
 * ------------------------------------------------------------------------- */

describe('remaining mutating routes', () => {
  it('seeds demo data after selecting the project', async () => {
    const res = await send('POST', '/projects/proj-1/demo', {});
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().imported, 2);
    const setDevice = store.callsOf('setDevice');
    assert.equal(setDevice[0].payload.patch.activeProject, 'proj-1');
    const seedIndex = store.state.calls.findIndex((call) => call.name === 'seedDemo');
    const deviceIndex = store.state.calls.findIndex((call) => call.name === 'setDevice');
    assert.ok(deviceIndex < seedIndex, 'project must be selected before seeding');
  });

  it('writes gold labels', async () => {
    const res = await send('POST', '/projects/proj-1/gold', { itemId: 'item-1', labels: { label: '金标' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().itemId, 'item-1');
    assert.deepEqual(store.callsOf('setGold')[0].payload.options.labels, { label: '金标' });
  });

  it('rejects the removed assignment route', async () => {
    const res = await send('POST', '/projects/proj-1/assign', { mode: 'round-robin', actorIds: ['actor-test'] });
    assert.equal(res.statusCode, 404);
  });

  it('validates the project', async () => {
    const res = await send('POST', '/projects/proj-1/validate', { itemId: 'item-1' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().ok, true);
    assert.equal(store.callsOf('validate')[0].payload.options.itemId, 'item-1');
  });
});
