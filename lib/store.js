/**
 * Annotation project store: local project loading, append-only label and review
 * events, queue materialization, review state, stats, agreement, and export
 * orchestration. Legacy claim/assign helpers remain for old project compatibility
 * but have no API, tool or UI entry points.
 *
 * @module @local/annotation-workbench/lib/store
 */

import { createHash, randomBytes } from 'node:crypto';
import { appendFile, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import {
  appendJsonl,
  assertSafeId,
  ensureDir,
  fileStamp,
  formatBytes,
  guessMime,
  nowIso,
  randomId,
  readJson,
  readJsonl,
  relativeInside,
  resolveInside,
  safeFilename,
  slugify,
  withFileLock,
  writeJsonAtomic,
} from './util.js';
import {
  DEMO_SVG,
  demoItems,
  getTemplate,
  listTemplates,
  templateGuideline,
  templateSchema,
} from './templates.js';
import { importItems as runImport } from './import.js';
import { writeExport } from './export.js';
import { computeAgreement } from './agreement.js';
import { validateLabels, validateSchema } from './validate.js';

const LABEL_STATUSES = new Set(['draft', 'submitted', 'skipped', 'flagged']);
const REVIEW_DECISIONS = new Set(['approve', 'reject']);
const CLAIM_MINUTES = 15;

/** Expected domain error with an HTTP status and a stable code. */
export class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const fail = (code, message, status = 400, details = undefined) => {
  throw new AppError(code, message, status, details);
};

/** Create a tiny PCM WAV tone for the audio demo. */
function demoToneWav(seconds = 2, sampleRate = 8000) {
  const samples = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.25 * 32767);
    data.writeInt16LE(value, index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Latest entry by ISO timestamp, ties by actor id. */
function latestBy(list, key = 'ts') {
  let best;
  for (const entry of list) {
    if (!best) {
      best = entry;
      continue;
    }
    const a = String(entry[key] ?? '');
    const b = String(best[key] ?? '');
    if (a > b || (a === b && String(entry.actorId ?? '') > String(best.actorId ?? ''))) best = entry;
  }
  return best;
}

/** Read all files in a directory (one level). */
async function readDirFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => join(dir, entry.name));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

/** Read all JSONL files under a directory tree at most two levels deep. */
async function readJsonlTree(dir) {
  const files = await readDirFiles(dir);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    const childFiles = await readDirFiles(child);
    files.push(...childFiles.filter((file) => file.endsWith('.jsonl')));
  }
  const out = [];
  for (const file of files.filter((entry) => entry.endsWith('.jsonl'))) {
    out.push(...await readJsonl(file));
  }
  return out;
}

/** Newest mtime plus file count under a two-level directory. */
async function dirStamp(dir) {
  let newest = 0;
  let count = 0;
  const visit = async (path) => {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        count += 1;
        try {
          newest = Math.max(newest, (await stat(child)).mtimeMs);
        } catch {
          // Ignore files that disappear mid-scan.
        }
      }
    }
  };
  await visit(dir);
  return `${count}:${newest}`;
}

async function fileStampOf(path) {
  try {
    return String((await stat(path)).mtimeMs);
  } catch {
    return '0';
  }
}

/** Batch append items without one syscall per row. */
async function appendItems(path, items) {
  if (items.length === 0) return;
  await ensureDir(dirname(path));
  let prefix = '';
  try {
    const info = await stat(path);
    if (info.size > 0) {
      const handle = await open(path, 'r');
      try {
        const buffer = Buffer.alloc(1);
        await handle.read(buffer, 0, 1, info.size - 1);
        if (buffer[0] !== 0x0a) prefix = '\n';
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const body = items.map((item) => JSON.stringify(item)).join('\n');
  await appendFile(path, `${prefix}${body}\n`, 'utf8');
}

/** Serialize writes per key inside one Host process. */
class KeyLocks {
  constructor() {
    this.chains = new Map();
  }

  async run(key, fn) {
    const previous = this.chains.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolvePromise) => { release = resolvePromise; });
    this.chains.set(key, previous.then(() => current));
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.chains.get(key) === current) this.chains.delete(key);
    }
  }
}

/**
 * @typedef {{ id: string, name: string }} Actor
 */

export class AnnotationStore {
  constructor({ dataRoot, deviceFile, logger, config = {} } = {}) {
    this.logger = logger;
    this.config = {
      maxImportItems: 50000,
      maxJsonBodyBytes: 4 * 1024 * 1024,
      mediaCacheSeconds: 60,
      ...config,
    };
    this.dataRoot = resolve(String(dataRoot ?? join(process.cwd(), 'annotation-projects')));
    this.deviceFile = resolve(String(deviceFile ?? join(this.dataRoot, '.device.json')));
    this.device = undefined;
    this.cache = new Map();
    this.locks = new KeyLocks();
    this.templates = listTemplates();
    this.ready = false;
  }

  log(level, message) {
    try {
      this.logger?.[level]?.(`[annotation] ${message}`);
    } catch {
      // Logging must never break a user operation.
    }
  }

  async init() {
    await ensureDir(this.dataRoot);
    await ensureDir(dirname(this.deviceFile));
    const existing = await readJson(this.deviceFile, undefined);
    if (existing && typeof existing === 'object') {
      this.device = {
        formatVersion: 1,
        actorId: existing.actorId ?? randomId('actor'),
        actorName: existing.actorName || '标注员',
        onboarded: existing.onboarded === true,
        dataRoot: existing.dataRoot ? resolve(existing.dataRoot) : this.dataRoot,
        activeProject: existing.activeProject ?? null,
        openOnStart: existing.openOnStart !== false,
        ui: existing.ui && typeof existing.ui === 'object' ? existing.ui : {},
      };
      this.dataRoot = this.device.dataRoot;
      await ensureDir(this.dataRoot);
    } else {
      this.device = {
        formatVersion: 1,
        actorId: randomId('actor'),
        actorName: '标注员',
        onboarded: false,
        dataRoot: this.dataRoot,
        activeProject: null,
        openOnStart: true,
        ui: {},
      };
      await writeJsonAtomic(this.deviceFile, this.device);
    }
    this.ready = true;
    this.log('info', `就绪 dataRoot=${this.dataRoot} actor=${this.device.actorId}`);
    return this;
  }

  actor(input) {
    const id = String(input?.id ?? input?.actorId ?? this.device.actorId);
    const name = String(input?.name ?? input?.actorName ?? this.device.actorName ?? '标注员').trim() || '标注员';
    assertSafeId(id);
    return { id, name: name.slice(0, 80) };
  }

  async health() {
    let projectCount = 0;
    try {
      projectCount = (await this.listProjects()).length;
    } catch {
      // Report a usable health object even when the data root is broken.
    }
    return {
      ok: true,
      version: '1.0.0',
      dataRoot: this.dataRoot,
      actor: { id: this.device.actorId, name: this.device.actorName },
      projectCount,
    };
  }

  async getDevice() {
    return {
      actorId: this.device.actorId,
      actorName: this.device.actorName,
      onboarded: this.device.onboarded === true,
      dataRoot: this.dataRoot,
      activeProject: this.device.activeProject ?? null,
      openOnStart: this.device.openOnStart !== false,
      ui: { ...this.device.ui },
    };
  }

  async setDevice(patch = {}) {
    const next = { ...this.device };
    if (typeof patch.actorName === 'string' && patch.actorName.trim() !== '') {
      next.actorName = patch.actorName.trim().slice(0, 80);
      next.onboarded = true;
    }
    if (typeof patch.dataRoot === 'string' && patch.dataRoot.trim() !== '') {
      next.dataRoot = resolve(patch.dataRoot.trim());
    }
    if (typeof patch.activeProject === 'string' || patch.activeProject === null) {
      next.activeProject = patch.activeProject;
    }
    if (typeof patch.openOnStart === 'boolean') next.openOnStart = patch.openOnStart;
    if (patch.ui && typeof patch.ui === 'object') next.ui = { ...next.ui, ...patch.ui };
    this.device = next;
    this.dataRoot = next.dataRoot;
    this.cache.clear();
    await ensureDir(this.dataRoot);
    await writeJsonAtomic(this.deviceFile, this.device);
    return this.getDevice();
  }

  async listProjects() {
    let entries;
    try {
      entries = await readdir(this.dataRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.trash') continue;
      const dir = join(this.dataRoot, entry.name);
      const project = await readJson(join(dir, 'project.json'), undefined);
      if (!project || typeof project !== 'object') continue;
      let count = 0;
      try {
        count = (await readJsonl(join(dir, 'items.jsonl'))).length;
      } catch {
        count = 0;
      }
      projects.push({
        id: project.id ?? entry.name,
        name: project.name ?? entry.name,
        template: project.template ?? 'custom',
        description: project.description ?? '',
        createdAt: project.createdAt ?? '',
        updatedAt: project.updatedAt ?? project.createdAt ?? '',
        revision: project.revision ?? 1,
        itemCount: count,
      });
    }
    projects.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return projects;
  }

  async resolveProject(ref) {
    const wanted = typeof ref === 'string' ? ref.trim() : '';
    if (wanted !== '') {
      try {
        assertSafeId(wanted);
        const direct = join(this.dataRoot, wanted);
        const project = await readJson(join(direct, 'project.json'), undefined);
        if (project) return { dir: direct, project };
      } catch {
        // Fall through to a name scan.
      }
    }
    const projects = await this.listProjects();
    const match = wanted === ''
      ? projects.find((entry) => entry.id === this.device.activeProject)
      : projects.find((entry) => entry.name === wanted || entry.id === wanted);
    if (!match) {
      fail('PROJECT_NOT_FOUND', wanted === '' ? '还没有选中项目；先创建或打开一个项目。' : `找不到项目：${wanted}`, 404);
    }
    const dir = resolveInside(this.dataRoot, match.id);
    const project = await readJson(join(dir, 'project.json'), undefined);
    if (!project) fail('PROJECT_NOT_FOUND', `项目文件缺失：${match.id}`, 404);
    return { dir, project };
  }

  async stateStamp(dir) {
    const project = await fileStampOf(join(dir, 'project.json'));
    const items = await fileStampOf(join(dir, 'items.jsonl'));
    const labels = await dirStamp(join(dir, 'labels'));
    const reviews = await dirStamp(join(dir, 'reviews'));
    const claims = await dirStamp(join(dir, 'claims'));
    const members = await fileStampOf(join(dir, 'members.jsonl'));
    const activity = await fileStampOf(join(dir, 'activity.jsonl'));
    const gold = await fileStampOf(join(dir, 'gold.jsonl'));
    const meta = await fileStampOf(join(dir, 'meta.jsonl'));
    const assignments = await fileStampOf(join(dir, 'assignments.json'));
    return [project, items, labels, reviews, claims, members, activity, gold, meta, assignments].join('|');
  }

  async loadState(ref, { reload = false } = {}) {
    const { dir, project } = await this.resolveProject(ref);
    const stamp = await this.stateStamp(dir);
    const cached = this.cache.get(project.id);
    if (!reload && cached && cached.stamp === stamp) return cached;

    const items = await readJsonl(join(dir, 'items.jsonl'));
    const labelEvents = await readJsonlTree(join(dir, 'labels'));
    const reviewEvents = await readJsonlTree(join(dir, 'reviews'));
    const members = await readJsonl(join(dir, 'members.jsonl'));
    const activity = await readJsonl(join(dir, 'activity.jsonl'));
    const goldEvents = await readJsonl(join(dir, 'gold.jsonl'));
    const metaEvents = await readJsonl(join(dir, 'meta.jsonl'));
    const assignments = await readJson(join(dir, 'assignments.json'), {});

    const annotations = new Map();
    for (const event of labelEvents) {
      if (!event || typeof event !== 'object' || !event.itemId || !event.actorId) continue;
      let byActor = annotations.get(event.itemId);
      if (!byActor) {
        byActor = new Map();
        annotations.set(event.itemId, byActor);
      }
      const previous = byActor.get(event.actorId);
      if (!previous || String(event.ts ?? '') >= String(previous.ts ?? '')) byActor.set(event.actorId, event);
    }

    const reviews = new Map();
    for (const event of reviewEvents) {
      if (!event || typeof event !== 'object' || !event.itemId) continue;
      const list = reviews.get(event.itemId) ?? [];
      list.push(event);
      reviews.set(event.itemId, list);
    }
    for (const [itemId, list] of reviews) {
      list.sort((left, right) => String(right.ts ?? '').localeCompare(String(left.ts ?? '')));
      reviews.set(itemId, list);
    }

    const latestReview = new Map();
    for (const [itemId, list] of reviews) {
      if (list.length > 0) latestReview.set(itemId, latestBy(list));
    }

    const claims = new Map();
    for (const file of await readDirFiles(join(dir, 'claims'))) {
      if (!file.endsWith('.json')) continue;
      const claim = await readJson(file, undefined);
      if (claim?.itemId) claims.set(claim.itemId, claim);
    }

    const gold = new Map();
    for (const event of goldEvents) {
      if (event?.itemId && event.labels) gold.set(event.itemId, event.labels);
    }

    const meta = new Map();
    for (const event of metaEvents) {
      if (event?.itemId && event.meta) meta.set(event.itemId, event.meta);
    }

    const memberMap = new Map();
    for (const event of members) {
      if (!event?.actorId) continue;
      const previous = memberMap.get(event.actorId);
      if (!previous || String(event.ts ?? '') >= String(previous.ts ?? '')) memberMap.set(event.actorId, event);
    }

    const state = {
      dir,
      project,
      stamp,
      items,
      itemMap: new Map(items.map((item) => [item.id, item])),
      annotations,
      reviews,
      latestReview,
      members: memberMap,
      activity,
      gold,
      meta,
      claims,
      assignments: assignments && typeof assignments === 'object' ? assignments : {},
    };
    this.cache.set(project.id, state);
    return state;
  }

  async touchMember(state, actor, role = 'annotator') {
    await appendJsonl(join(state.dir, 'members.jsonl'), {
      type: 'member',
      actorId: actor.id,
      actorName: actor.name,
      role,
      ts: nowIso(),
    });
  }

  async logActivity(state, action, detail = {}, actor = undefined) {
    await appendJsonl(join(state.dir, 'activity.jsonl'), {
      type: 'activity',
      action,
      detail,
      actorId: actor?.id ?? this.device.actorId,
      actorName: actor?.name ?? this.device.actorName,
      ts: nowIso(),
    });
  }

  latestAnnotation(state, itemId, actorId) {
    return state.annotations.get(itemId)?.get(actorId);
  }

  itemStatus(state, itemId) {
    const review = state.latestReview.get(itemId);
    if (review?.decision === 'approve') return 'approved';
    if (review?.decision === 'reject') return 'rejected';
    const annotations = state.annotations.get(itemId);
    if (annotations) {
      const values = [...annotations.values()];
      if (values.some((event) => event.status === 'submitted')) return 'submitted';
      if (values.some((event) => event.status === 'flagged')) return 'flagged';
      if (values.some((event) => event.status === 'draft')) return 'in_progress';
    }
    return 'unlabeled';
  }

  reviewState(state, itemId) {
    const review = state.latestReview.get(itemId);
    if (review?.decision === 'approve') return 'approved';
    if (review?.decision === 'reject') return 'rejected';
    return this.itemStatus(state, itemId) === 'submitted' ? 'pending' : 'none';
  }

  itemPreview(item) {
    if (!item) return '';
    const payload = item.payload ?? {};
    if (typeof payload.text === 'string' && payload.text.trim() !== '') return payload.text.trim().slice(0, 90);
    if (Array.isArray(payload.messages) && payload.messages.length > 0) {
      const last = [...payload.messages].reverse().find((message) => message.content);
      if (last) return String(last.content).slice(0, 90);
    }
    if (Array.isArray(payload.candidates) && payload.candidates[0]?.text) {
      return String(payload.candidates[0].text).slice(0, 90);
    }
    if (Array.isArray(item.media) && item.media[0]?.path) return basename(item.media[0].path);
    return item.id;
  }

  effectiveItem(item, state) {
    const meta = state.meta.get(item.id);
    return meta ? { ...item, meta: { ...(item.meta ?? {}), ...meta } } : item;
  }

  queueRow(state, item, actor) {
    const annotations = state.annotations.get(item.id);
    const mine = annotations?.get(actor.id);
    const actors = annotations ? [...annotations.values()].map((event) => event.actorName || event.actorId) : [];
    const claim = state.claims.get(item.id);
    const assignedTo = state.assignments?.[item.id] ?? null;
    return {
      id: item.id,
      kind: item.kind,
      preview: this.itemPreview(item),
      status: this.itemStatus(state, item.id),
      myStatus: mine?.status ?? 'none',
      review: this.reviewState(state, item.id),
      actors: [...new Set(actors)],
      mediaCount: Array.isArray(item.media) ? item.media.length : 0,
      batch: item.batch ?? '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      priority: Number(item.priority ?? 0),
      claimedBy: claim?.actorId ?? null,
      claimedUntil: claim?.expiresAt ?? null,
      assignedTo,
      updatedAt: mine?.ts ?? state.latestReview.get(item.id)?.ts ?? item.createdAt ?? '',
    };
  }

  countsFor(state) {
    const counts = { total: state.items.length, unlabeled: 0, in_progress: 0, submitted: 0, approved: 0, rejected: 0, flagged: 0 };
    for (const item of state.items) {
      const status = this.itemStatus(state, item.id);
      if (counts[status] !== undefined) counts[status] += 1;
    }
    return counts;
  }

  matchesQuery(row, item, query) {
    if (!query) return true;
    const haystack = [row.id, row.preview, row.batch, ...(row.tags ?? []), item?.payload?.text ?? ''].join(' ').toLowerCase();
    return haystack.includes(String(query).toLowerCase());
  }

  async queue(ref, options = {}) {
    const { mode = 'annotate', filter = {}, q = '', cursor = 0, limit = 50 } = options;
    const state = await this.loadState(ref);
    const actor = this.actor(options.actor);
    const statusFilter = filter.status ?? (mode === 'review' ? 'submitted' : '');
    const claimedByOther = (itemId) => {
      const claim = state.claims.get(itemId);
      return claim && claim.actorId !== actor.id && String(claim.expiresAt ?? '') > nowIso();
    };
    const rows = [];
    for (const item of state.items) {
      const row = this.queueRow(state, item, actor);
      if (!this.matchesQuery(row, item, q)) continue;
      if (filter.kind && row.kind !== filter.kind) continue;
      if (filter.batch && row.batch !== filter.batch) continue;
      if (filter.tag && !row.tags.includes(filter.tag)) continue;
      if (filter.assignedToMe && row.assignedTo && row.assignedTo !== actor.id) continue;
      if (statusFilter === 'mine') {
        if (!['draft', 'submitted', 'flagged'].includes(row.myStatus)) continue;
      } else if (statusFilter === 'review') {
        if (row.review !== 'pending') continue;
      } else if (statusFilter && statusFilter !== 'all' && row.status !== statusFilter) {
        continue;
      } else if (mode === 'review' && statusFilter === 'submitted' && row.status !== 'submitted') {
        continue;
      }
      if (mode === 'annotate' && claimedByOther(item.id) && statusFilter !== 'all') continue;
      rows.push(row);
    }
    const total = rows.length;
    const start = Math.max(0, Number(cursor) || 0);
    const take = Math.min(200, Math.max(1, Number(limit) || 50));
    return {
      items: rows.slice(start, start + take),
      nextCursor: start + take < total ? start + take : null,
      total,
      counts: this.countsFor(state),
    };
  }

  async next(ref, options = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(options.actor);
    const mode = options.mode ?? 'annotate';
    const queue = await this.queue(ref, { mode, filter: options.filter ?? {}, q: '', cursor: 0, limit: 200, actor });
    const rows = queue.items;
    if (mode === 'review') {
      const singleUser = state.project.settings?.singleUser !== false;
      const candidate = rows.find((row) => {
        if (row.status !== 'submitted') return false;
        if (!singleUser && !state.project.settings?.selfReview) {
          return !state.annotations.get(row.id)?.has(actor.id);
        }
        return true;
      });
      return candidate ? this.getItem(ref, candidate.id, actor) : null;
    }
    const candidate = rows.find((row) => {
      if (row.claimedBy && row.claimedBy !== actor.id) return false;
      if (row.status === 'approved') return false;
      if (row.myStatus === 'submitted') return false;
      return true;
    });
    return candidate ? this.getItem(ref, candidate.id, actor) : null;
  }

  async getItem(ref, itemId, actorInput) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const item = state.itemMap.get(String(itemId));
    if (!item) fail('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
    const effective = this.effectiveItem(item, state);
    const annotations = [...(state.annotations.get(item.id)?.values() ?? [])]
      .sort((left, right) => String(left.actorName ?? '').localeCompare(String(right.actorName ?? '')));
    const reviews = [...(state.reviews.get(item.id) ?? [])];
    const latest = state.latestReview.get(item.id);
    const mine = annotations.find((event) => event.actorId === actor.id);
    const claim = state.claims.get(item.id) ?? null;
    const media = (Array.isArray(effective.media) ? effective.media : []).map((entry, index) => ({
      index,
      name: basename(entry.path ?? ''),
      mime: entry.mime || guessMime(entry.path),
      url: `/annotation/api/projects/${encodeURIComponent(state.project.id)}/media/${encodeURIComponent(item.id)}/${index}`,
    }));
    return {
      item: effective,
      annotations,
      reviews,
      claim,
      media,
      status: this.itemStatus(state, item.id),
      myStatus: mine?.status ?? 'none',
      review: this.reviewState(state, item.id),
      finalLabels: latest?.finalLabels ?? {},
      assignedTo: state.assignments?.[item.id] ?? null,
      project: {
        id: state.project.id,
        name: state.project.name,
        template: state.project.template,
        schema: state.project.schema,
        settings: state.project.settings,
        revision: state.project.revision,
      },
      serverTime: nowIso(),
    };
  }

  async createProject({ name, template = 'custom', schema, guideline, actor: actorInput, description = '' } = {}) {
    const actor = this.actor(actorInput);
    const cleanName = String(name ?? '').trim();
    if (cleanName === '') fail('NAME_REQUIRED', '项目名称不能为空');
    const templateDef = getTemplate(template);
    const projectSchema = schema ?? templateSchema(templateDef.id);
    const check = validateSchema(projectSchema);
    if (!check.ok) fail('SCHEMA_INVALID', '字段 schema 不合法', 422, check.errors);
    let id = slugify(cleanName);
    let dir = resolveInside(this.dataRoot, id);
    let exists = true;
    try {
      await stat(join(dir, 'project.json'));
    } catch {
      exists = false;
    }
    if (exists) {
      id = `${id}-${randomId('', 4)}`;
      dir = resolveInside(this.dataRoot, id);
    }
    await ensureDir(dir);
    const now = nowIso();
    const project = {
      formatVersion: 1,
      id,
      name: cleanName,
      description: String(description ?? '').slice(0, 500),
      template: templateDef.id,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      revision: 1,
      schema: projectSchema,
      settings: {
        allowGaps: true,
        selfReview: true,
        singleUser: true,
        exportScope: 'approved',
        allowExternalMedia: false,
        ...(templateDef.kind === 'video' || templateDef.kind === 'audio' ? { allowGaps: true } : {}),
      },
    };
    await writeJsonAtomic(join(dir, 'project.json'), project);
    await ensureDir(join(dir, 'media'));
    await ensureDir(join(dir, 'labels'));
    await ensureDir(join(dir, 'reviews'));
    await ensureDir(join(dir, 'exports'));
    await appendFile(join(dir, 'items.jsonl'), '', 'utf8');
    await writeFile(join(dir, 'guideline.md'), String(guideline ?? templateGuideline(templateDef.id)), 'utf8');
    await appendJsonl(join(dir, 'members.jsonl'), { type: 'member', actorId: actor.id, actorName: actor.name, role: 'admin', ts: now });
    await appendJsonl(join(dir, 'activity.jsonl'), { type: 'activity', action: 'project.create', detail: { template: templateDef.id }, actorId: actor.id, actorName: actor.name, ts: now });
    await this.setDevice({ activeProject: id });
    this.cache.delete(id);
    return this.getProject(id);
  }

  async getProject(ref) {
    const state = await this.loadState(ref);
    return {
      project: state.project,
      stats: await this.stats(ref),
      members: await this.members(ref),
      counts: this.countsFor(state),
      templates: this.templates,
    };
  }

  /**
   * Delete a project. `trash` moves the directory under `<dataRoot>/.trash`;
   * `purge` removes it permanently. The exact project name must be supplied as
   * a confirmation, so a stale UI cannot delete the wrong directory by id alone.
   *
   * @param {string} ref project id or name
   * @param {{ mode?: 'trash'|'purge', confirmName?: string }} options
   */
  async deleteProject(ref, options = {}) {
    const mode = options.mode === undefined ? 'trash' : String(options.mode);
    if (mode !== 'trash' && mode !== 'purge') {
      fail('INVALID_DELETE_MODE', '删除方式只能是 trash（回收站）或 purge（彻底删除）', 400);
    }
    const state = await this.loadState(ref);
    const project = state.project;
    const expected = String(project.name ?? '').trim();
    const supplied = String(options.confirmName ?? '').trim();
    if (expected === '' || supplied !== expected) {
      fail('CONFIRM_MISMATCH', '请输入完整的项目名称以确认删除', 422, { expected });
    }

    let trashName;
    if (mode === 'trash') {
      const trashRoot = resolveInside(this.dataRoot, '.trash');
      await ensureDir(trashRoot);
      let target = join(trashRoot, `${project.id}-${fileStamp()}`);
      try {
        await stat(target);
        target = `${target}-${randomId('', 4)}`;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      trashName = basename(target);
      try {
        await rename(state.dir, target);
      } catch (error) {
        this.log('warn', `回收站移动失败：${error instanceof Error ? error.message : String(error)}`);
        fail('DELETE_FAILED', `无法移动项目到回收站：${error instanceof Error ? error.message : String(error)}`, 409);
      }
    } else {
      try {
        await rm(state.dir, { recursive: true, force: true });
      } catch (error) {
        this.log('warn', `彻底删除失败：${error instanceof Error ? error.message : String(error)}`);
        fail('DELETE_FAILED', `无法彻底删除项目：${error instanceof Error ? error.message : String(error)}`, 500);
      }
    }

    this.cache.delete(project.id);
    if (String(this.device.activeProject ?? '') === String(project.id)) {
      try {
        await this.setDevice({ activeProject: null });
      } catch (error) {
        this.log('warn', `清空 activeProject 失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.log('info', `已删除项目 ${project.id}（${mode}${trashName ? ` -> ${trashName}` : ''}）`);
    return {
      deleted: true,
      id: project.id,
      name: project.name,
      mode,
      ...(trashName ? { trashName } : {}),
    };
  }

  async updateProject(ref, patch = {}, expectedRevision = undefined) {
    const state = await this.loadState(ref);
    const project = state.project;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(project.revision)) {
      fail('REVISION_CONFLICT', '项目已被其他人修改，请刷新后重试', 409, { revision: project.revision });
    }
    const next = {
      ...project,
      name: typeof patch.name === 'string' && patch.name.trim() !== '' ? patch.name.trim().slice(0, 120) : project.name,
      description: typeof patch.description === 'string' ? patch.description.slice(0, 500) : project.description,
      settings: patch.settings && typeof patch.settings === 'object' ? { ...project.settings, ...patch.settings } : project.settings,
      revision: Number(project.revision ?? 1) + 1,
      updatedAt: nowIso(),
    };
    await withFileLock(join(state.dir, '.lock'), () => writeJsonAtomic(join(state.dir, 'project.json'), next));
    this.cache.delete(project.id);
    return this.getProject(project.id);
  }

  async getGuideline(ref) {
    const state = await this.loadState(ref);
    let text = '';
    try {
      text = await readFile(join(state.dir, 'guideline.md'), 'utf8');
    } catch {
      text = '';
    }
    return { text, revision: state.project.revision };
  }

  async setGuideline(ref, text, expectedRevision = undefined) {
    const state = await this.loadState(ref);
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(state.project.revision)) {
      fail('REVISION_CONFLICT', '项目已被其他人修改，请刷新后重试', 409, { revision: state.project.revision });
    }
    await withFileLock(join(state.dir, '.lock'), async () => {
      const fsPromises = await import('node:fs/promises');
      await fsPromises.writeFile(join(state.dir, 'guideline.md'), String(text ?? ''), 'utf8');
      const next = { ...state.project, revision: Number(state.project.revision ?? 1) + 1, updatedAt: nowIso() };
      await writeJsonAtomic(join(state.dir, 'project.json'), next);
    });
    await this.logActivity(state, 'guideline.update', {});
    this.cache.delete(state.project.id);
    return this.getProject(state.project.id);
  }

  async setSchema(ref, schema, expectedRevision = undefined) {
    const state = await this.loadState(ref);
    const check = validateSchema(schema);
    if (!check.ok) fail('SCHEMA_INVALID', '字段 schema 不合法', 422, check.errors);
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(state.project.revision)) {
      fail('REVISION_CONFLICT', '项目已被其他人修改，请刷新后重试', 409, { revision: state.project.revision });
    }
    await withFileLock(join(state.dir, '.lock'), async () => {
      const next = { ...state.project, schema, revision: Number(state.project.revision ?? 1) + 1, updatedAt: nowIso() };
      await writeJsonAtomic(join(state.dir, 'project.json'), next);
    });
    await this.logActivity(state, 'schema.update', { fields: schema?.fields?.length ?? 0 });
    this.cache.delete(state.project.id);
    return this.getProject(state.project.id);
  }

  async previewImport(ref, { source, format = 'auto', mapping = {} } = {}) {
    const state = await this.loadState(ref);
    const sourcePath = String(source ?? '').trim();
    if (sourcePath === '') fail('SOURCE_REQUIRED', '请填写导入路径');
    const abs = isAbsolute(sourcePath) ? resolve(sourcePath) : resolve(sourcePath);
    let info;
    try {
      info = await stat(abs);
    } catch {
      fail('SOURCE_NOT_FOUND', `路径不存在：${sourcePath}`, 404);
    }
    const detected = format === 'auto'
      ? (info.isDirectory() ? 'folder' : extname(abs).slice(1).toLowerCase() || 'jsonl')
      : format;
    let sample = [];
    let columns = [];
    let warnings = [];
    if (info.isDirectory()) {
      sample = [{ path: abs, note: '目录导入：将按扩展名识别媒体/文本文件' }];
    } else if (detected === 'srt' || detected === 'vtt') {
      const text = await (await import('node:fs/promises')).readFile(abs, 'utf8');
      const { parseSrt, parseVtt } = await import('./util.js');
      const segments = detected === 'srt' ? parseSrt(text) : parseVtt(text);
      sample = segments.slice(0, 3).map((segment) => ({ start: segment.start, end: segment.end, text: segment.text }));
      columns = ['start', 'end', 'text'];
    } else if (detected === 'csv' || detected === 'tsv') {
      const text = await (await import('node:fs/promises')).readFile(abs, 'utf8');
      const { parseCsv } = await import('./util.js');
      const { header, rows } = parseCsv(text, detected === 'tsv' ? '\t' : ',');
      columns = header;
      sample = rows.slice(0, 3).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])));
    } else {
      const text = await (await import('node:fs/promises')).readFile(abs, 'utf8');
      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(0, 3);
      for (const line of lines) {
        try {
          sample.push(JSON.parse(line));
        } catch {
          warnings.push('预览中有一行不是合法 JSON');
        }
      }
      columns = sample[0] && typeof sample[0] === 'object' ? Object.keys(sample[0]) : [];
    }
    return {
      source: abs,
      format: detected,
      columns,
      sample,
      warnings,
      suggestedMapping: {
        id: columns.includes('id') ? 'id' : '',
        text: columns.includes('text') ? 'text' : '',
        media: columns.find((key) => ['media', 'video', 'audio', 'image', 'path', 'file'].includes(key)) ?? '',
      },
      project: state.project.id,
    };
  }

  async importItems(ref, options = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(options.actor);
    const result = await runImport({
      projectDir: state.dir,
      project: state.project,
      source: options.source,
      format: options.format ?? 'auto',
      mapping: options.mapping ?? {},
      copyMedia: options.copyMedia !== false,
      limits: { maxItems: this.config.maxImportItems },
      log: (message) => this.log('info', message),
    });
    if (result.items.length > 0) {
      await appendItems(join(state.dir, 'items.jsonl'), result.items);
      await this.touchMember(state, actor);
      await this.logActivity(state, 'items.import', {
        imported: result.items.length,
        skipped: result.skipped ?? 0,
        warnings: result.warnings?.length ?? 0,
        source: options.source,
      }, actor);
    }
    this.cache.delete(state.project.id);
    return {
      imported: result.items.length,
      skipped: result.skipped ?? 0,
      warnings: result.warnings ?? [],
      mediaFiles: result.mediaFiles ?? [],
      missingMedia: result.missingMedia ?? [],
      project: state.project.id,
    };
  }

  async saveLabel(ref, { itemId, actor: actorInput, labels = {}, status = 'draft', note = '', durationMs = 0 } = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const item = state.itemMap.get(String(itemId));
    if (!item) fail('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
    if (!LABEL_STATUSES.has(status)) fail('STATUS_INVALID', `未知状态：${status}`);
    if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) fail('LABELS_INVALID', 'labels 必须是对象');
    const validation = validateLabels({
      schema: state.project.schema,
      item: this.effectiveItem(item, state),
      labels,
      project: state.project,
      allowIncomplete: status !== 'submitted',
    });
    if (!validation.ok && status === 'submitted') {
      fail('VALIDATION_FAILED', '提交前校验未通过', 422, validation.errors);
    }
    const month = nowIso().slice(0, 7);
    const file = join(state.dir, 'labels', actor.id, `${month}.jsonl`);
    const event = {
      type: 'label',
      itemId: item.id,
      actorId: actor.id,
      actorName: actor.name,
      ts: nowIso(),
      status,
      labels,
      note: String(note ?? '').slice(0, 4000),
      durationMs: Math.max(0, Math.min(24 * 3600 * 1000, Number(durationMs) || 0)),
      schemaRevision: Number(state.project.revision ?? 1),
    };
    await this.locks.run(`labels:${state.project.id}:${actor.id}`, async () => {
      await appendJsonl(file, event);
    });
    await this.touchMember(state, actor);
    if (status === 'submitted' || status === 'skipped') {
      await this.release(state.project.id, { itemId: item.id, actor });
    }
    this.cache.delete(state.project.id);
    const detail = await this.getItem(state.project.id, item.id, actor);
    return { ...detail, warnings: validation.warnings };
  }

  async review(ref, { itemId, actor: actorInput, decision, finalLabels, comment = '' } = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const item = state.itemMap.get(String(itemId));
    if (!item) fail('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
    if (!REVIEW_DECISIONS.has(decision)) fail('DECISION_INVALID', `未知复核结论：${decision}`);
    const current = state.annotations.get(item.id);
    const singleUser = state.project.settings?.singleUser !== false;
    if (!singleUser && !state.project.settings?.selfReview && current?.has(actor.id)) {
      fail('SELF_REVIEW', '不能复核自己标注的条目；请换一条或让项目管理员开启 selfReview', 403);
    }
    let resolved = finalLabels;
    if (!resolved || typeof resolved !== 'object') {
      const submitted = [...(current?.values() ?? [])].filter((event) => event.status === 'submitted');
      const source = latestBy(submitted);
      resolved = source?.labels ?? {};
    }
    const validation = validateLabels({
      schema: state.project.schema,
      item: this.effectiveItem(item, state),
      labels: resolved,
      project: state.project,
      allowIncomplete: false,
    });
    if (!validation.ok) fail('VALIDATION_FAILED', '最终标签校验未通过', 422, validation.errors);
    const file = join(state.dir, 'reviews', `${actor.id}.jsonl`);
    await this.locks.run(`reviews:${state.project.id}:${actor.id}`, async () => {
      await appendJsonl(file, {
        type: 'review',
        itemId: item.id,
        actorId: actor.id,
        actorName: actor.name,
        ts: nowIso(),
        decision,
        finalLabels: resolved,
        comment: String(comment ?? '').slice(0, 4000),
        schemaRevision: Number(state.project.revision ?? 1),
      });
    });
    await this.touchMember(state, actor, 'reviewer');
    await this.logActivity(state, `review.${decision}`, { itemId: item.id }, actor);
    this.cache.delete(state.project.id);
    return this.getItem(state.project.id, item.id, actor);
  }

  async claim(ref, { itemId, actor: actorInput } = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const item = state.itemMap.get(String(itemId));
    if (!item) fail('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
    const existing = state.claims.get(item.id);
    if (existing && existing.actorId !== actor.id && String(existing.expiresAt ?? '') > nowIso()) {
      fail('ITEM_CLAIMED', `条目已被 ${existing.actorName || existing.actorId} 领取`, 409, existing);
    }
    const claim = {
      itemId: item.id,
      actorId: actor.id,
      actorName: actor.name,
      ts: nowIso(),
      expiresAt: new Date(Date.now() + CLAIM_MINUTES * 60 * 1000).toISOString(),
    };
    await writeJsonAtomic(join(state.dir, 'claims', `${assertSafeId(item.id)}.json`), claim);
    this.cache.delete(state.project.id);
    return { claim };
  }

  async release(ref, { itemId, actor: actorInput } = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const existing = state.claims.get(itemId);
    if (existing && existing.actorId === actor.id) {
      await rm(join(state.dir, 'claims', `${assertSafeId(existing.itemId)}.json`), { force: true });
      this.cache.delete(state.project.id);
    }
    return { released: true };
  }

  async updateMeta(ref, { itemId, meta, actor: actorInput } = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const item = state.itemMap.get(String(itemId));
    if (!item) fail('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
    if (!meta || typeof meta !== 'object') fail('META_INVALID', 'meta 必须是对象');
    const clean = {};
    for (const key of ['durationMs', 'width', 'height', 'fps']) {
      if (meta[key] !== undefined && Number.isFinite(Number(meta[key])) && Number(meta[key]) > 0) clean[key] = Number(meta[key]);
    }
    await appendJsonl(join(state.dir, 'meta.jsonl'), { itemId: item.id, meta: clean, ts: nowIso(), actorId: actor.id });
    this.cache.delete(state.project.id);
    return { itemId: item.id, meta: clean };
  }

  async stats(ref) {
    const state = await this.loadState(ref);
    const counts = this.countsFor(state);
    const actorMap = new Map();
    const ensureActor = (actorId, actorName) => {
      let entry = actorMap.get(actorId);
      if (!entry) {
        entry = { actorId, actorName: actorName || actorId, submitted: 0, approved: 0, avgDurationMs: 0, totalDuration: 0, durationCount: 0, lastActive: '' };
        actorMap.set(actorId, entry);
      }
      if (actorName) entry.actorName = actorName;
      return entry;
    };
    for (const member of state.members.values()) ensureActor(member.actorId, member.actorName);
    for (const byActor of state.annotations.values()) {
      for (const event of byActor.values()) {
        const entry = ensureActor(event.actorId, event.actorName);
        if (event.status === 'submitted') entry.submitted += 1;
        if (Number(event.durationMs) > 0) {
          entry.totalDuration += Number(event.durationMs);
          entry.durationCount += 1;
        }
        if (String(event.ts ?? '') > String(entry.lastActive)) entry.lastActive = event.ts;
      }
    }
    for (const item of state.items) {
      const review = state.latestReview.get(item.id);
      if (review?.decision === 'approve') {
        const submitted = [...(state.annotations.get(item.id)?.values() ?? [])].filter((event) => event.status === 'submitted');
        const source = latestBy(submitted);
        if (source) ensureActor(source.actorId, source.actorName).approved += 1;
      }
    }
    for (const entry of actorMap.values()) {
      entry.avgDurationMs = entry.durationCount > 0 ? Math.round(entry.totalDuration / entry.durationCount) : 0;
      delete entry.totalDuration;
      delete entry.durationCount;
    }
    const today = nowIso().slice(0, 10);
    let todaySubmitted = 0;
    let todayApproved = 0;
    for (const byActor of state.annotations.values()) {
      for (const event of byActor.values()) {
        if (event.status === 'submitted' && String(event.ts ?? '').startsWith(today)) todaySubmitted += 1;
      }
    }
    for (const review of state.latestReview.values()) {
      if (review.decision === 'approve' && String(review.ts ?? '').startsWith(today)) todayApproved += 1;
    }
    const distribution = {};
    const primaryField = (state.project.schema?.fields ?? []).find((field) => Array.isArray(field.options) && field.options.length > 0);
    if (primaryField) {
      for (const byActor of state.annotations.values()) {
        for (const event of byActor.values()) {
          if (event.status !== 'submitted') continue;
          const value = event.labels?.[primaryField.id];
          const values = Array.isArray(value) ? value : [value];
          for (const entry of values) {
            if (entry === undefined || entry === null || entry === '') continue;
            distribution[String(entry)] = (distribution[String(entry)] ?? 0) + 1;
          }
        }
      }
    }
    const recent = [...state.activity]
      .sort((left, right) => String(right.ts ?? '').localeCompare(String(left.ts ?? '')))
      .slice(0, 20)
      .map((event) => ({ ts: event.ts, actorName: event.actorName ?? '', action: event.action ?? '', itemId: event.detail?.itemId ?? '' }));
    return {
      counts,
      actors: [...actorMap.values()].sort((left, right) => right.submitted - left.submitted),
      today: { submitted: todaySubmitted, approved: todayApproved },
      reviewBacklog: counts.submitted,
      labelDistribution: distribution,
      primaryField: primaryField ? { id: primaryField.id, label: primaryField.label } : null,
      recent,
      totalItems: counts.total,
    };
  }

  async agreement(ref) {
    const state = await this.loadState(ref);
    const annotations = new Map();
    for (const [itemId, byActor] of state.annotations) {
      annotations.set(itemId, [...byActor.values()]);
    }
    const gold = {};
    for (const [itemId, labels] of state.gold) gold[itemId] = labels;
    try {
      return computeAgreement({ items: state.items, annotations, schema: state.project.schema, gold });
    } catch (error) {
      this.log('warn', `一致性计算失败：${error instanceof Error ? error.message : String(error)}`);
      return { itemsCompared: 0, fields: [], overall: null, gold: null };
    }
  }

  async activity(ref, limit = 50) {
    const state = await this.loadState(ref);
    return [...state.activity]
      .sort((left, right) => String(right.ts ?? '').localeCompare(String(left.ts ?? '')))
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
  }

  async members(ref) {
    const state = await this.loadState(ref);
    const map = new Map();
    for (const event of state.members.values()) map.set(event.actorId, { ...event });
    for (const byActor of state.annotations.values()) {
      for (const event of byActor.values()) {
        const current = map.get(event.actorId);
        if (!current) map.set(event.actorId, { actorId: event.actorId, actorName: event.actorName, role: 'annotator', ts: event.ts });
        else if (String(event.ts ?? '') > String(current.ts ?? '')) current.ts = event.ts;
      }
    }
    return [...map.values()].map((entry) => ({
      actorId: entry.actorId,
      actorName: entry.actorName,
      role: entry.role ?? 'annotator',
      lastActive: entry.ts ?? '',
    }));
  }

  async exportData(ref, { format = 'jsonl', scope, itemId = undefined } = {}) {
    const state = await this.loadState(ref);
    const annotations = new Map();
    for (const [id, byActor] of state.annotations) annotations.set(id, [...byActor.values()]);
    const reviews = new Map();
    for (const [id, list] of state.reviews) reviews.set(id, list);
    const result = await writeExport({
      projectDir: state.dir,
      project: state.project,
      items: state.items,
      annotations,
      reviews,
      format,
      scope: scope ?? state.project.settings?.exportScope ?? 'approved',
      itemId,
      stats: await this.stats(ref),
      agreement: await this.agreement(ref),
      stamp: fileStamp(),
    });
    await this.logActivity(state, 'export', { format, scope, files: result.files?.length ?? 0 });
    this.cache.delete(state.project.id);
    return result;
  }

  async assign(ref, { mode = 'round-robin', actorIds, actor: actorInput } = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const assignments = mode === 'clear' ? {} : {};
    if (mode !== 'clear') {
      const members = (actorIds && Array.isArray(actorIds) && actorIds.length > 0)
        ? actorIds.map(String)
        : [...state.members.values()].map((entry) => entry.actorId);
      if (members.length === 0) fail('MEMBERS_EMPTY', '还没有成员可以分配');
      state.items.forEach((item, index) => {
        assignments[item.id] = members[index % members.length];
      });
    }
    await withFileLock(join(state.dir, '.lock'), async () => {
      await writeJsonAtomic(join(state.dir, 'assignments.json'), assignments);
      const next = {
        ...state.project,
        settings: { ...state.project.settings, assignmentMode: mode === 'clear' ? 'free' : 'assigned' },
        revision: Number(state.project.revision ?? 1) + 1,
        updatedAt: nowIso(),
      };
      await writeJsonAtomic(join(state.dir, 'project.json'), next);
    });
    await this.logActivity(state, 'assign', { mode, count: Object.keys(assignments).length }, actor);
    this.cache.delete(state.project.id);
    return { mode, assignments, count: Object.keys(assignments).length };
  }

  async setGold(ref, { itemId, labels, actor: actorInput } = {}) {
    const state = await this.loadState(ref);
    const actor = this.actor(actorInput);
    const item = state.itemMap.get(String(itemId));
    if (!item) fail('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
    if (!labels || typeof labels !== 'object') fail('LABELS_INVALID', 'labels 必须是对象');
    await appendJsonl(join(state.dir, 'gold.jsonl'), { itemId: item.id, labels, updatedAt: nowIso(), actorId: actor.id });
    await this.logActivity(state, 'gold.set', { itemId: item.id }, actor);
    this.cache.delete(state.project.id);
    return { itemId: item.id, labels };
  }

  async validate(ref, { itemId } = {}) {
    const state = await this.loadState(ref);
    const targetItems = itemId ? [state.itemMap.get(String(itemId))].filter(Boolean) : state.items;
    const errors = [];
    const warnings = [];
    let checked = 0;
    for (const item of targetItems) {
      const byActor = state.annotations.get(item.id);
      const submitted = [...(byActor?.values() ?? [])].filter((event) => event.status === 'submitted');
      const source = latestBy(submitted);
      if (!source) continue;
      checked += 1;
      const result = validateLabels({
        schema: state.project.schema,
        item: this.effectiveItem(item, state),
        labels: source.labels,
        project: state.project,
        allowIncomplete: false,
      });
      for (const error of result.errors) errors.push({ itemId: item.id, ...error });
      for (const warning of result.warnings) warnings.push({ itemId: item.id, ...warning });
    }
    return { ok: errors.length === 0, checked, errors, warnings };
  }

  async mediaPath(ref, itemId, index) {
    const state = await this.loadState(ref);
    const item = state.itemMap.get(String(itemId));
    if (!item) fail('ITEM_NOT_FOUND', `找不到条目：${itemId}`, 404);
    const entry = (item.media ?? [])[Number(index)];
    if (!entry?.path) fail('MEDIA_NOT_FOUND', '条目没有这个媒体文件', 404);
    let abs;
    if (isAbsolute(entry.path)) {
      if (!state.project.settings?.allowExternalMedia) {
        fail('MEDIA_EXTERNAL', '该项目未允许外部媒体路径', 403);
      }
      abs = resolve(entry.path);
    } else {
      abs = resolveInside(state.dir, entry.path);
    }
    let info;
    try {
      info = await stat(abs);
    } catch {
      fail('MEDIA_NOT_FOUND', `媒体文件不存在：${entry.path}`, 404);
    }
    if (!info.isFile()) fail('MEDIA_NOT_FOUND', `不是文件：${entry.path}`, 404);
    let resolved = abs;
    try {
      resolved = await realpath(abs);
    } catch {
      resolved = abs;
    }
    if (!isAbsolute(entry.path) || !state.project.settings?.allowExternalMedia) {
      const projectReal = resolve(state.dir);
      if (resolved !== projectReal && !resolved.startsWith(projectReal + '\\') && !resolved.startsWith(projectReal + '/')) {
        fail('MEDIA_OUTSIDE', '媒体路径解析到了项目目录之外', 403);
      }
    }
    return {
      absPath: resolved,
      mime: entry.mime || guessMime(abs),
      size: info.size,
      name: basename(abs),
      mtimeMs: info.mtimeMs,
    };
  }

  async resolveExport(ref, relPath) {
    const state = await this.loadState(ref);
    const base = resolveInside(state.dir, 'exports');
    const abs = resolveInside(base, relPath);
    let info;
    try {
      info = await stat(abs);
    } catch {
      fail('EXPORT_NOT_FOUND', `导出文件不存在：${relPath}`, 404);
    }
    if (!info.isFile()) fail('EXPORT_NOT_FOUND', `不是文件：${relPath}`, 404);
    return { absPath: abs, size: info.size, name: basename(abs), mime: guessMime(abs) };
  }

  async projectDirOf(ref) {
    const state = await this.loadState(ref);
    return state.dir;
  }

  async seedDemo(actorInput) {
    const actor = this.actor(actorInput);
    const active = this.device.activeProject;
    if (!active) fail('PROJECT_REQUIRED', '先创建或打开一个项目', 404);
    const state = await this.loadState(active);
    if (state.items.length > 0) {
      return { project: state.project.id, imported: 0, skipped: state.items.length, message: '项目已有条目，未重复写入示例' };
    }
    await ensureDir(join(state.dir, 'media'));
    const template = getTemplate(state.project.template);
    const items = demoItems(template.id);
    for (const item of items) {
      if (item.kind === 'image') {
        await (await import('node:fs/promises')).writeFile(join(state.dir, 'media', 'demo-image.svg'), DEMO_SVG, 'utf8');
        item.media = [{ path: 'media/demo-image.svg', mime: 'image/svg+xml' }];
        item.meta = { ...(item.meta ?? {}), width: 960, height: 540 };
      }
      if (item.kind === 'audio' || template.kind === 'video' || template.kind === 'audio') {
        await (await import('node:fs/promises')).writeFile(join(state.dir, 'media', 'demo-tone.wav'), demoToneWav(2));
        item.kind = item.kind === 'audio' ? 'audio' : item.kind;
        item.media = [{ path: 'media/demo-tone.wav', mime: 'audio/wav' }];
        item.meta = { ...(item.meta ?? {}), durationMs: 2000 };
      }
    }
    await appendItems(join(state.dir, 'items.jsonl'), items);
    await this.touchMember(state, actor);
    await this.logActivity(state, 'demo.seed', { count: items.length }, actor);
    this.cache.delete(state.project.id);
    return { project: state.project.id, imported: items.length, skipped: 0 };
  }

  async close() {
    this.cache.clear();
  }
}

export { listTemplates };
