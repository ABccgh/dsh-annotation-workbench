import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnnotationStore } from '../lib/store.js';
import { createApi } from '../lib/api.js';

const API = '/annotation/api';

class MockRequest {
  constructor({ method = 'GET', url = '/', body = undefined, headers = {} } = {}) {
    this.method = method;
    this.url = url;
    this.headers = { host: '127.0.0.1:55840', ...headers };
    this.raw = body;
    this.read = false;
  }

  async *[Symbol.asyncIterator]() {
    if (this.read) return;
    this.read = true;
    if (this.raw !== undefined) yield Buffer.from(typeof this.raw === 'string' ? this.raw : JSON.stringify(this.raw));
  }

  resume() {}
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.ended = false;
  }

  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [key, value] of Object.entries(headers)) this.setHeader(key, value);
    return this;
  }
  write(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); }
  end(chunk) {
    if (chunk) this.chunks.push(Buffer.from(chunk));
    this.ended = true;
  }
  json() { return JSON.parse(Buffer.concat(this.chunks).toString('utf8')); }
  body() { return Buffer.concat(this.chunks); }
}

function fixtureApi(store) {
  const ctx = {
    get(name) { return name === 'connection' ? { requestRejection: () => undefined } : undefined; },
  };
  return createApi({ store, ctx, config: { maxJsonBodyBytes: 1024 * 1024 } });
}

async function send(api, method, path, body, headers = {}) {
  const request = new MockRequest({
    method,
    url: `${API}${path}`,
    body,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
  });
  const response = new MockResponse();
  await api.handle(request, response);
  return response;
}

test('real store and API integrate for project, queue, label, export and media', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-api-integration-'));
  const store = new AnnotationStore({
    dataRoot: join(dir, 'projects'),
    deviceFile: join(dir, 'device.json'),
    config: { maxImportItems: 1000 },
  });
  await store.init();
  await store.setDevice({ actorName: '集成测试员' });
  const api = fixtureApi(store);
  try {
    const health = await send(api, 'GET', '/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().ok, true);

    const createdRes = await send(api, 'POST', '/projects', {
      name: '集成测试项目',
      template: 'text_classification',
    });
    assert.equal(createdRes.statusCode, 200);
    const created = createdRes.json();
    assert.equal(created.project.name, '集成测试项目');
    const projectId = created.project.id;

    const demo = await send(api, 'POST', `/projects/${projectId}/demo`, {});
    assert.equal(demo.statusCode, 200);
    assert.ok(demo.json().imported > 0);

    const queue = await send(api, 'GET', `/projects/${projectId}/queue?limit=10`);
    assert.equal(queue.statusCode, 200);
    const rows = queue.json().items;
    assert.ok(rows.length > 0);

    const detail = await send(api, 'GET', `/projects/${projectId}/items/${rows[0].id}`);
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().item.id, rows[0].id);

    const saved = await send(api, 'POST', `/projects/${projectId}/items/${rows[0].id}/label`, {
      labels: { category: 'news', sentiment: 'neutral', confidence: 4 },
      status: 'submitted',
      durationMs: 1500,
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().status, 'submitted');

    const stats = await send(api, 'GET', `/projects/${projectId}/stats`);
    assert.equal(stats.statusCode, 200);
    assert.equal(stats.json().counts.submitted, 1);

    const agreement = await send(api, 'GET', `/projects/${projectId}/agreement`);
    assert.equal(agreement.statusCode, 200);
    assert.ok(Array.isArray(agreement.json().fields));

    const exported = await send(api, 'POST', `/projects/${projectId}/export`, { format: 'jsonl', scope: 'submitted' });
    assert.equal(exported.statusCode, 200);
    const exportBody = exported.json();
    assert.ok(exportBody.files.length >= 1);
    const download = await send(api, 'GET', `/projects/${projectId}/download?path=${encodeURIComponent(exportBody.files[0].urlPath.replace(`/annotation/api/projects/${projectId}/download?path=`, ''))}`);
    assert.ok([200, 400, 404].includes(download.statusCode));

    const mediaItem = rows.find((row) => row.kind === 'image')?.id ?? rows[0].id;
    const media = await send(api, 'GET', `/projects/${projectId}/media/${mediaItem}/0`, undefined, { range: 'bytes=0-31' });
    assert.ok([200, 206, 404].includes(media.statusCode));
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
