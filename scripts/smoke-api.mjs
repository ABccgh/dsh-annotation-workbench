/**
 * Developer smoke test against the real data root: boots the store and exercises
 * the authenticated HTTP handler with a permissive fake connection.
 *
 * Usage: node scripts/smoke-api.mjs
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { AnnotationStore } from '../lib/store.js';
import { createApi } from '../lib/api.js';

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
const dataRoot = process.env.ANNOTATION_DATA_ROOT || join(dshHome, 'annotation-projects');
const deviceFile = process.env.ANNOTATION_DEVICE_FILE
  || join(dshHome, 'annotation-workbench', 'device.json');

class Req {
  method = 'GET';
  headers = { host: '127.0.0.1:55840' };
  constructor(method, url) {
    this.method = method;
    this.url = url;
  }
  async *[Symbol.asyncIterator]() {}
  resume() {}
}

class Res {
  statusCode = 200;
  headers = {};
  chunks = [];
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); }
  write(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); }
  end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); }
  json() { return JSON.parse(Buffer.concat(this.chunks).toString('utf8')); }
}

const store = new AnnotationStore({ dataRoot, deviceFile, config: { maxImportItems: 1000 } });
await store.init();
const ctx = { get: (name) => (name === 'connection' ? { requestRejection: () => undefined } : undefined) };
const api = createApi({ store, ctx, config: { maxJsonBodyBytes: 1024 * 1024 } });

async function call(method, path) {
  const req = new Req(method, `/annotation/api${path}`);
  const res = new Res();
  await api.handle(req, res);
  return res;
}

try {
  const health = await call('GET', '/health');
  console.log('health', health.statusCode, health.json());
  const projects = await call('GET', '/projects');
  console.log('projects', projects.statusCode, projects.json().map((entry) => `${entry.id}:${entry.itemCount}`));
  const project = projects.json()[0];
  if (!project) process.exit(0);
  const queue = await call('GET', `/projects/${encodeURIComponent(project.id)}/queue?limit=5`);
  console.log('queue', queue.statusCode, queue.json().total, queue.json().items.length);
  const first = queue.json().items[0];
  if (first) {
    const item = await call('GET', `/projects/${encodeURIComponent(project.id)}/items/${encodeURIComponent(first.id)}`);
    console.log('item', item.statusCode, item.json().item?.id, item.json().item?.kind, item.json().media?.length);
  }
} finally {
  await store.close();
}
