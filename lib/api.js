/**
 * Authenticated JSON HTTP API for the annotation workbench.
 *
 * The Host mounts this module behind `webServer.register({ kind: 'prefix',
 * path: '/annotation/api' })`, so `req.url` always carries the full path
 * (including the prefix). Everything below the prefix is a plain JSON API for
 * the Web half: projects, queue, annotations, reviews, media streaming,
 * exports, and the import-wizard directory browser.
 *
 * Two invariants matter:
 *
 * 1. **Every request is fenced by the composition's `connection` service.**
 *    `requestRejection({ headers })` enforces the Host/Origin trust fence and
 *    browser authentication; a 401/403 answer stops the request before any
 *    store call. The API itself is same-origin only and sets `no-store`.
 * 2. **No absolute path leaves the server except where a path is the payload.**
 *    `/health` may report the data root; `/browse` and the import preview are
 *    path browsers by nature; export results are stripped down to
 *    `{name,size,mime,urlPath}` so the browser downloads through this API
 *    instead of learning the shared folder layout.
 *
 * Domain failures are thrown by the store as `AppError`-shaped objects with
 * `.code`, `.status`, and optional `.details`; they are mapped straight to the
 * error envelope `{ error: { code, message, details? } }`. Anything else is a
 * 500 with a generic message (the stack goes to the logger, never the client).
 *
 * @module @local/annotation-workbench/lib/api
 */

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { appendJsonl, ensureDir, guessMime, resolveInside, safeFilename } from './util.js';

/** Mount prefix; the Host web carrier routes this whole subtree here. */
const PREFIX = '/annotation/api';

/** Fallback JSON body ceiling when the config does not provide one. */
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Directory browsing never lists more than this many entries in one page. */
const BROWSE_LIMIT = 500;

/** Methods whose request body is JSON. */
const JSON_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Expected, mapped API failure. */
class ApiError extends Error {
  /**
   * @param {number} status HTTP status code.
   * @param {string} code Stable machine-readable code.
   * @param {string} message Human-readable Chinese message.
   * @param {unknown} [details] Optional structured details.
   */
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* ------------------------------------------------------------------------- *
 * Response helpers
 * ------------------------------------------------------------------------- */

/** Serialize a JSON response (never cached: the API serves live facts). */
function sendJson(res, status, payload) {
  let body;
  try {
    body = JSON.stringify(payload ?? null);
  } catch {
    status = 500;
    body = JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '响应序列化失败' } });
  }
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

/** Error envelope shared by every failure response. */
function sendApiError(res, status, code, message, details = undefined) {
  const error = { code: String(code ?? 'ERROR'), message: String(message ?? '请求失败') };
  if (details !== undefined) error.details = details;
  sendJson(res, status, { error });
}

/** `Content-Disposition` that survives non-ASCII export names. */
function contentDisposition(name) {
  const fallback = safeFilename(String(name ?? 'export'), 'export').replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(String(name ?? 'export'))}`;
}

/** True when a content-type header names JSON. */
function isJsonMediaType(value) {
  const base = String(value ?? '').split(';')[0].trim().toLowerCase();
  return base === 'application/json' || base.endsWith('+json');
}

/** Stop reading a request that will not be consumed. */
function drain(req) {
  try {
    req.resume?.();
  } catch {
    // Draining is best effort.
  }
}

/**
 * Read a UTF-8 request body with a hard byte ceiling.
 * @throws {ApiError} 413 when the body exceeds the ceiling.
 */
async function readBoundedBody(req, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      drain(req);
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `请求体超过 ${limitBytes} 字节上限`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

/**
 * Read and parse a JSON write body.
 *
 * An empty body is `{}` (POST demo carries none). A non-empty body must
 * declare a JSON media type, which gives a clear 415 instead of silently
 * accepting form posts.
 * @throws {ApiError} 400/413/415.
 */
async function readJsonBody(req, limitBytes) {
  const headers = req?.headers ?? {};
  const declared = headers['content-length'] === undefined ? undefined : Number(headers['content-length']);
  if (Number.isFinite(declared) && declared > limitBytes) {
    drain(req);
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `请求体超过 ${limitBytes} 字节上限`);
  }
  const text = await readBoundedBody(req, limitBytes);
  if (text.trim() === '') return {};
  const contentType = headers['content-type'];
  if (!isJsonMediaType(contentType)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', '写接口只接受 application/json 请求体');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'BAD_JSON', '请求体不是合法 JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'INVALID_BODY', '请求体必须是 JSON 对象');
  }
  return parsed;
}

/**
 * Stream a byte range of a file into a response and end it.
 *
 * Deliberately not `stream.pipe(res)`: the workbench's own tests (and the
 * integration test) use minimal response doubles that only implement
 * `write`/`end`, so the pump writes chunks itself and only waits for `drain`
 * when the destination reports backpressure and supports the event.
 */
async function streamFileRange(res, absPath, start, end) {
  const stream = createReadStream(absPath, { start, end });
  let completed = false;
  try {
    for await (const chunk of stream) {
      if (res.write(chunk) === false) {
        await new Promise((resolvePromise) => {
          if (typeof res.once === 'function') res.once('drain', resolvePromise);
          else resolvePromise();
        });
      }
    }
    completed = true;
  } finally {
    stream.destroy();
    if (completed) res.end();
  }
}

/**
 * Parse one `Range: bytes=...` header for a single-range response.
 * Multiple ranges and unknown units deliberately fall back to a full 200.
 * @returns {null | 'unsatisfiable' | {start:number,end:number}}
 */
function parseRangeHeader(header, total) {
  if (header === undefined || header === null) return null;
  const text = String(header).trim();
  if (text === '' || !/^bytes=/i.test(text)) return null;
  const spec = text.slice(6).trim();
  if (spec.includes(',')) return null;
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match) return 'unsatisfiable';
  const [, startRaw, endRaw] = match;
  if (startRaw === '' && endRaw === '') return 'unsatisfiable';
  if (!Number.isFinite(total) || total <= 0) return 'unsatisfiable';
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable';
    return { start: Math.max(0, total - suffix), end: total - 1 };
  }
  const start = Number(startRaw);
  let end = endRaw === '' ? total - 1 : Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unsatisfiable';
  if (start >= total || end < start) return 'unsatisfiable';
  if (end >= total) end = total - 1;
  return { start, end };
}

/** Map a Node fs error to a stable API answer, or null for unknown errors. */
function mapFsError(error, what = '路径') {
  switch (error?.code) {
    case 'ENOENT':
      return new ApiError(404, 'NOT_FOUND', `${what}不存在`);
    case 'ENOTDIR':
      return new ApiError(400, 'NOT_DIRECTORY', `${what}不是目录`);
    case 'EACCES':
    case 'EPERM':
      return new ApiError(403, 'FORBIDDEN', `无权访问${what}`);
    default:
      return null;
  }
}

/** Decode one path segment, rejecting traversal segments and bad escapes. */
function decodeSegment(segment) {
  let value;
  try {
    value = decodeURIComponent(segment);
  } catch {
    throw new ApiError(400, 'BAD_PATH', 'URL 编码不合法');
  }
  if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new ApiError(403, 'ROUTE_FORBIDDEN', '路径不合法');
  }
  return value;
}

/** Small positive integer query parameter with a fallback. */
function queryInt(value, fallback) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* ------------------------------------------------------------------------- *
 * Factory
 * ------------------------------------------------------------------------- */

/**
 * Create the API handler.
 *
 * @param {object} options
 * @param {object} options.store AnnotationStore instance (the only business dependency).
 * @param {object} options.ctx Cordis context; `ctx.get('connection')` provides the auth fence.
 * @param {Record<string, unknown>} [options.config] Effective plugin config.
 * @returns {{ handle: (req: any, res: any) => Promise<void> }}
 */
export function createApi({ store, ctx, config = {} } = {}) {
  if (!store) throw new TypeError('createApi 需要 store');
  const maxBodyBytes = Number(config?.maxJsonBodyBytes) > 0
    ? Math.trunc(Number(config.maxJsonBodyBytes))
    : DEFAULT_MAX_BODY_BYTES;
  const mediaCacheSeconds = Number.isFinite(Number(config?.mediaCacheSeconds)) && Number(config.mediaCacheSeconds) >= 0
    ? Math.trunc(Number(config.mediaCacheSeconds))
    : 60;
  const clientErrorFile = String(
    config?.clientErrorFile
    || (config?.deviceFile ? join(dirname(String(config.deviceFile)), 'client-errors.jsonl') : join(process.cwd(), 'client-errors.jsonl')),
  );
  let clientErrorWindowStart = 0;
  let clientErrorWindowCount = 0;
  const recentClientErrorKeys = new Map();

  /** Best-effort logger; logging failures never affect a response. */
  const log = (level, message) => {
    try {
      ctx?.logger?.[level]?.(`[annotation-api] ${message}`);
    } catch {
      // Logging must not break the API.
    }
  };

  /** Current `connection` service, if any. */
  const connectionService = () => {
    try {
      return typeof ctx?.get === 'function' ? ctx.get('connection') : undefined;
    } catch {
      return undefined;
    }
  };

  /** Ask the trust fence first; returns 401/403 or undefined. */
  const authRejection = (req) => {
    const connection = connectionService();
    if (!connection || typeof connection.requestRejection !== 'function') return undefined;
    let rejection;
    try {
      rejection = connection.requestRejection({ headers: req?.headers ?? {} });
    } catch {
      return 403;
    }
    if (rejection === undefined || rejection === null || rejection === false) return undefined;
    const status = Number(rejection);
    return status === 401 || status === 403 ? status : 403;
  };

  /** Resolve the acting identity: explicit body/query override, else device. */
  const resolveActor = async (body, query = undefined) => {
    const rawBody = body && typeof body === 'object' ? body : {};
    const fromBody = rawBody.actor;
    if (typeof fromBody === 'string' && fromBody.trim() !== '') {
      return { id: fromBody.trim(), name: fromBody.trim() };
    }
    if (fromBody && typeof fromBody === 'object' && fromBody.id !== undefined && fromBody.id !== null) {
      return { id: String(fromBody.id), name: String(fromBody.name ?? fromBody.id) };
    }
    if (rawBody.actorId !== undefined && rawBody.actorId !== null && String(rawBody.actorId).trim() !== '') {
      const id = String(rawBody.actorId).trim();
      return { id, name: String(rawBody.actorName ?? id) };
    }
    const queryActor = query?.get?.('actorId');
    if (typeof queryActor === 'string' && queryActor.trim() !== '') {
      return { id: queryActor.trim(), name: queryActor.trim() };
    }
    const device = await store.getDevice();
    return { id: device.actorId, name: device.actorName };
  };

  /** Queue filters: `filter=<json>` merged with the individual query keys. */
  const parseFilter = (query) => {
    let filter = {};
    const raw = query.get('filter');
    if (raw !== null && raw.trim() !== '') {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new ApiError(400, 'INVALID_FILTER', 'filter 必须是 JSON 对象');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ApiError(400, 'INVALID_FILTER', 'filter 必须是 JSON 对象');
      }
      filter = { ...parsed };
    }
    for (const key of ['status', 'kind', 'batch', 'tag']) {
      const value = query.get(key);
      if (value !== null && value !== '') filter[key] = value;
    }
    const assigned = query.get('assignedToMe');
    if (assigned === '1' || assigned === 'true') filter.assignedToMe = true;
    return filter;
  };

  /** Read `mode=annotate|review` from a query. */
  const parseMode = (query) => (query.get('mode') === 'review' ? 'review' : 'annotate');

  const queueOptions = async (url) => {
    const query = url.searchParams;
    return {
      mode: parseMode(query),
      filter: parseFilter(query),
      q: query.get('q') ?? '',
      cursor: Math.max(0, queryInt(query.get('cursor'), 0)),
      limit: queryInt(query.get('limit'), 50),
      actor: await resolveActor(undefined, query),
    };
  };

  const requireItemId = (body) => {
    const itemId = body?.itemId;
    if (itemId === undefined || itemId === null || String(itemId).trim() === '') {
      throw new ApiError(422, 'ITEM_ID_REQUIRED', '缺少 itemId');
    }
    return String(itemId);
  };

  /* ----------------------------------------------------------------------- *
   * Route handlers
   * ----------------------------------------------------------------------- */

  const handlers = {
    async health({ res }) {
      const health = await store.health();
      // The store reports `{ id, name }`; the Web client assumes the device
      // shape `{ actorId, actorName }`. Serve both spellings so neither half
      // has to guess.
      let actor = health?.actor;
      if (actor && typeof actor === 'object') {
        actor = {
          ...actor,
          actorId: actor.actorId ?? actor.id,
          actorName: actor.actorName ?? actor.name,
        };
      }
      sendJson(res, 200, { ...health, actor });
    },

    async getDevice({ res }) {
      sendJson(res, 200, await store.getDevice());
    },

    async clientError({ res, body }) {
      let serialized;
      try {
        serialized = JSON.stringify(body ?? {});
      } catch {
        serialized = '';
      }
      if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) {
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '客户端错误载荷超过 64 KB 上限');
      }
      const now = Date.now();
      if (now - clientErrorWindowStart > 60000) {
        clientErrorWindowStart = now;
        clientErrorWindowCount = 0;
      }
      clientErrorWindowCount += 1;
      if (clientErrorWindowCount > 20) {
        res.statusCode = 204;
        res.end();
        return;
      }
      const text = (value, max) => String(value ?? '').slice(0, max);
      const message = text(body?.message, 4000);
      const stack = text(body?.stack, 24000);
      const key = `${message}\n${stack}`.slice(0, 1500);
      const previous = recentClientErrorKeys.get(key);
      if (previous !== undefined && now - previous < 10000) {
        res.statusCode = 204;
        res.end();
        return;
      }
      recentClientErrorKeys.set(key, now);
      if (recentClientErrorKeys.size > 200) {
        for (const [oldKey, at] of recentClientErrorKeys) {
          if (now - at > 60000) recentClientErrorKeys.delete(oldKey);
        }
      }
      try {
        await ensureDir(dirname(clientErrorFile));
        await appendJsonl(clientErrorFile, {
          serverTs: new Date().toISOString(),
          kind: text(body?.kind, 80) || 'client',
          message,
          stack,
          componentStack: text(body?.componentStack, 12000),
          href: text(body?.href, 1000),
          userAgent: text(body?.userAgent, 500),
          version: text(body?.version, 40),
          clientTs: text(body?.ts, 60),
        });
      } catch (error) {
        log('warn', `客户端错误日志写入失败：${error instanceof Error ? error.message : String(error)}`);
      }
      res.statusCode = 204;
      res.end();
    },

    async setDevice({ res, body }) {
      sendJson(res, 200, await store.setDevice(body));
    },

    async templates({ res }) {
      const templates = typeof store.templates === 'function' ? await store.templates() : store.templates;
      sendJson(res, 200, Array.isArray(templates) ? templates : []);
    },

    async listProjects({ res }) {
      sendJson(res, 200, await store.listProjects());
    },

    async createProject({ res, body }) {
      const actor = await resolveActor(body);
      const result = await store.createProject({
        name: body.name,
        template: body.template,
        description: body.description,
        schema: body.schema,
        guideline: body.guideline,
        actor,
      });
      sendJson(res, 200, result);
    },

    async getProject({ res, params }) {
      sendJson(res, 200, await store.getProject(params.id));
    },

    async updateProject({ res, params, body }) {
      let result = await store.updateProject(
        params.id,
        { name: body.name, description: body.description, settings: body.settings },
        body.revision,
      );
      if (body.schema !== undefined) result = await store.setSchema(params.id, body.schema, undefined);
      if (body.guideline !== undefined) result = await store.setGuideline(params.id, body.guideline, undefined);
      sendJson(res, 200, result);
    },

    async deleteProject({ res, params, body }) {
      const result = await store.deleteProject(params.id, {
        mode: body.mode ?? 'trash',
        confirmName: body.confirmName,
      });
      sendJson(res, 200, result);
    },

    async getGuideline({ res, params }) {
      sendJson(res, 200, await store.getGuideline(params.id));
    },

    async setGuideline({ res, params, body }) {
      if (typeof body.text !== 'string') throw new ApiError(422, 'GUIDELINE_REQUIRED', 'text 必须是字符串');
      sendJson(res, 200, await store.setGuideline(params.id, body.text, body.revision));
    },

    async getSchema({ res, params }) {
      const detail = await store.getProject(params.id);
      const project = detail?.project ?? detail ?? {};
      sendJson(res, 200, { schema: project.schema ?? null, revision: project.revision ?? null });
    },

    async setSchema({ res, params, body }) {
      if (body.schema === undefined) throw new ApiError(422, 'SCHEMA_REQUIRED', '缺少 schema');
      sendJson(res, 200, await store.setSchema(params.id, body.schema, body.revision));
    },

    async previewImport({ res, params, body }) {
      const result = await store.previewImport(params.id, {
        source: body.source,
        format: body.format,
        mapping: body.mapping,
      });
      // The store resolves `source` to an absolute path; echo the user's input
      // instead so the browser never learns the server directory layout.
      const payload = { ...result };
      if (typeof body.source === 'string') payload.source = body.source;
      sendJson(res, 200, payload);
    },

    async importItems({ res, params, body }) {
      const actor = await resolveActor(body);
      sendJson(res, 200, await store.importItems(params.id, {
        source: body.source,
        format: body.format,
        mapping: body.mapping,
        copyMedia: body.copyMedia,
        actor,
      }));
    },

    async queue({ res, params, url }) {
      sendJson(res, 200, await store.queue(params.id, await queueOptions(url)));
    },

    async next({ res, params, url }) {
      const options = await queueOptions(url);
      const item = await store.next(params.id, {
        mode: options.mode,
        filter: options.filter,
        actor: options.actor,
      });
      sendJson(res, 200, { item: item ?? null });
    },

    async getItem({ res, params, url }) {
      const actor = await resolveActor(undefined, url.searchParams);
      sendJson(res, 200, await store.getItem(params.id, params.itemId, actor));
    },

    async saveLabel({ res, params, body }) {
      const actor = await resolveActor(body);
      sendJson(res, 200, await store.saveLabel(params.id, {
        itemId: params.itemId,
        labels: body.labels ?? {},
        status: body.status ?? 'draft',
        note: body.note,
        durationMs: body.durationMs,
        actor,
      }));
    },

    async review({ res, params, body }) {
      const actor = await resolveActor(body);
      sendJson(res, 200, await store.review(params.id, {
        itemId: params.itemId,
        decision: body.decision,
        finalLabels: body.finalLabels,
        comment: body.comment,
        actor,
      }));
    },

    async updateMeta({ res, params, body }) {
      const actor = await resolveActor(body);
      const meta = body.meta && typeof body.meta === 'object' ? body.meta : body;
      sendJson(res, 200, await store.updateMeta(params.id, { itemId: params.itemId, meta, actor }));
    },

    async media({ req, res, params }) {
      const index = Number.parseInt(String(params.index), 10);
      if (!Number.isInteger(index) || index < 0) throw new ApiError(400, 'INVALID_INDEX', '媒体序号不合法');
      const media = await store.mediaPath(params.id, params.itemId, index);
      const total = Number(media?.size) || 0;
      const isHead = String(req.method ?? 'GET').toUpperCase() === 'HEAD';
      res.setHeader('accept-ranges', 'bytes');
      res.setHeader('content-type', media?.mime || guessMime(media?.absPath));
      res.setHeader('cache-control', `private, max-age=${mediaCacheSeconds}`);
      res.setHeader('x-content-type-options', 'nosniff');
      const range = parseRangeHeader(req.headers?.range, total);
      if (range === 'unsatisfiable') {
        res.setHeader('content-range', `bytes */${total}`);
        sendApiError(res, 416, 'RANGE_NOT_SATISFIABLE', '请求的字节范围超出文件大小');
        return;
      }
      if (range === null) {
        res.statusCode = 200;
        res.setHeader('content-length', String(total));
        if (isHead || total === 0) {
          res.end();
          return;
        }
        await streamFileRange(res, media.absPath, 0, total - 1);
        return;
      }
      res.statusCode = 206;
      res.setHeader('content-length', String(range.end - range.start + 1));
      res.setHeader('content-range', `bytes ${range.start}-${range.end}/${total}`);
      if (isHead) {
        res.end();
        return;
      }
      await streamFileRange(res, media.absPath, range.start, range.end);
    },

    async stats({ res, params }) {
      sendJson(res, 200, await store.stats(params.id));
    },

    async agreement({ res, params }) {
      sendJson(res, 200, await store.agreement(params.id));
    },

    async activity({ res, params, url }) {
      const limit = queryInt(url.searchParams.get('limit'), 50);
      sendJson(res, 200, await store.activity(params.id, limit));
    },

    async exportData({ res, params, body }) {
      const result = await store.exportData(params.id, {
        format: body.format ?? 'jsonl',
        scope: body.scope,
        itemId: body.itemId,
      });
      // Strip absolute paths: the browser downloads through /download?path=.
      // `urlPath` keeps the export helper's project-relative spelling;
      // `downloadPath` is the ready-to-use API URL the Web half can set as href.
      const projectRef = encodeURIComponent(String(params.id ?? result?.project ?? ''));
      const files = Array.isArray(result?.files)
        ? result.files.map((file) => {
          const relative = String(file?.urlPath ?? '');
          return {
            name: file?.name ?? '',
            size: Number(file?.size) || 0,
            mime: file?.mime ?? 'application/octet-stream',
            urlPath: relative,
            downloadPath: relative === ''
              ? ''
              : `${PREFIX}/projects/${projectRef}/download?path=${encodeURIComponent(relative)}`,
          };
        })
        : [];
      sendJson(res, 200, {
        files,
        summary: result?.summary ?? { files: files.length },
      });
    },

    async download({ req, res, params, url }) {
      const rawPath = url.searchParams.get('path');
      if (rawPath === null || rawPath.trim() === '') {
        throw new ApiError(400, 'PATH_REQUIRED', '缺少 path 参数');
      }
      // Accept both export-result `urlPath` spellings: paths are relative to
      // the project directory (`exports/<stamp>/file`) or to the exports root
      // (`<stamp>/file`). Only the exports root is ever served.
      let relPath = rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      if (/^exports(\/|$)/i.test(relPath)) relPath = relPath.replace(/^exports\/?/i, '');
      if (relPath === '') throw new ApiError(404, 'EXPORT_NOT_FOUND', '导出文件不存在');
      const projectDir = await store.projectDirOf(params.id);
      const exportsRoot = resolveInside(projectDir, 'exports');
      try {
        resolveInside(exportsRoot, relPath);
      } catch {
        throw new ApiError(403, 'ROUTE_FORBIDDEN', '路径越界：只允许下载项目 exports 目录内的文件');
      }
      const file = await store.resolveExport(params.id, relPath);
      const total = Number(file.size) || 0;
      const isHead = String(req.method ?? 'GET').toUpperCase() === 'HEAD';
      res.statusCode = 200;
      res.setHeader('content-type', file.mime || guessMime(file.absPath));
      res.setHeader('content-length', String(total));
      res.setHeader('content-disposition', contentDisposition(file.name));
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-content-type-options', 'nosniff');
      if (isHead || total === 0) {
        res.end();
        return;
      }
      await streamFileRange(res, file.absPath, 0, total - 1);
    },

    async demo({ res, params, body }) {
      await store.setDevice({ activeProject: params.id });
      const actor = await resolveActor(body);
      sendJson(res, 200, await store.seedDemo(actor));
    },

    async setGold({ res, params, body }) {
      const actor = await resolveActor(body);
      sendJson(res, 200, await store.setGold(params.id, {
        itemId: body.itemId,
        labels: body.labels,
        actor,
      }));
    },

    async validate({ res, params, body }) {
      sendJson(res, 200, await store.validate(params.id, { itemId: body?.itemId }));
    },

    async browse({ res, url }) {
      const requested = url.searchParams.get('path');
      const device = await store.getDevice();
      const baseRoot = typeof device?.dataRoot === 'string' && device.dataRoot !== ''
        ? resolve(device.dataRoot)
        : resolve('.');
      let target;
      if (requested === null || requested.trim() === '') {
        target = baseRoot;
      } else {
        const raw = requested.trim();
        try {
          target = resolve(baseRoot, raw);
        } catch {
          throw new ApiError(400, 'BAD_PATH', '路径不合法');
        }
      }
      let info;
      try {
        info = await stat(target);
      } catch (error) {
        throw mapFsError(error, '目录') ?? error;
      }
      if (!info.isDirectory()) throw new ApiError(400, 'NOT_DIRECTORY', `不是目录：${target}`);
      let rawEntries;
      try {
        rawEntries = await readdir(target, { withFileTypes: true });
      } catch (error) {
        throw mapFsError(error, '目录') ?? error;
      }
      const candidates = rawEntries.filter((entry) => !entry.isSymbolicLink() && (entry.isDirectory() || entry.isFile()));
      candidates.sort((left, right) => {
        const leftDir = left.isDirectory();
        const rightDir = right.isDirectory();
        if (leftDir !== rightDir) return leftDir ? -1 : 1;
        return left.name.localeCompare(right.name, 'zh-Hans-CN');
      });
      const entries = [];
      for (const entry of candidates.slice(0, BROWSE_LIMIT)) {
        const isDirectory = entry.isDirectory();
        const abs = join(target, entry.name);
        let entryInfo;
        if (!isDirectory) {
          try {
            entryInfo = await stat(abs);
          } catch {
            entryInfo = undefined;
          }
        }
        entries.push({
          name: entry.name,
          path: abs,
          type: isDirectory ? 'dir' : 'file',
          isDirectory,
          size: isDirectory ? 0 : Number(entryInfo?.size) || 0,
          mtimeMs: isDirectory ? null : (entryInfo?.mtimeMs ?? null),
        });
      }
      const parent = dirname(target);
      sendJson(res, 200, {
        path: target,
        parent: parent === target ? null : parent,
        entries,
        count: entries.length,
        total: candidates.length,
        truncated: candidates.length > BROWSE_LIMIT,
      });
    },
  };

  /** Item-scoped writes are the canonical routes; these aliases accept itemId in the body. */
  const itemAliasHandler = (canonical) => async (context) => {
    const itemId = requireItemId(context.body);
    return handlers[canonical]({ ...context, params: { ...context.params, itemId } });
  };

  /* ----------------------------------------------------------------------- *
   * Route table
   *
   * Each entry lists the path pattern and the methods it supports. A path hit
   * with another method returns 405 + Allow; a miss returns 404.
   * ----------------------------------------------------------------------- */

  const routes = [
    { path: [], methods: { GET: handlers.health } },
    { path: ['health'], methods: { GET: handlers.health } },
    { path: ['client-error'], methods: { POST: handlers.clientError } },
    { path: ['device'], methods: { GET: handlers.getDevice, PUT: handlers.setDevice, PATCH: handlers.setDevice } },
    { path: ['templates'], methods: { GET: handlers.templates } },
    { path: ['projects'], methods: { GET: handlers.listProjects, POST: handlers.createProject } },
    { path: ['projects', ':id'], methods: { GET: handlers.getProject, PATCH: handlers.updateProject, DELETE: handlers.deleteProject } },
    { path: ['projects', ':id', 'guideline'], methods: { GET: handlers.getGuideline, PUT: handlers.setGuideline } },
    { path: ['projects', ':id', 'schema'], methods: { GET: handlers.getSchema, PUT: handlers.setSchema } },
    { path: ['projects', ':id', 'import', 'preview'], methods: { POST: handlers.previewImport } },
    { path: ['projects', ':id', 'import'], methods: { POST: handlers.importItems } },
    { path: ['projects', ':id', 'queue'], methods: { GET: handlers.queue } },
    { path: ['projects', ':id', 'next'], methods: { GET: handlers.next } },
    { path: ['projects', ':id', 'items', ':itemId'], methods: { GET: handlers.getItem } },
    { path: ['projects', ':id', 'items', ':itemId', 'label'], methods: { POST: handlers.saveLabel } },
    { path: ['projects', ':id', 'items', ':itemId', 'review'], methods: { POST: handlers.review } },
    { path: ['projects', ':id', 'items', ':itemId', 'meta'], methods: { POST: handlers.updateMeta } },
    { path: ['projects', ':id', 'media', ':itemId', ':index'], methods: { GET: handlers.media, HEAD: handlers.media } },
    { path: ['projects', ':id', 'stats'], methods: { GET: handlers.stats } },
    { path: ['projects', ':id', 'agreement'], methods: { GET: handlers.agreement } },
    { path: ['projects', ':id', 'activity'], methods: { GET: handlers.activity } },
    { path: ['projects', ':id', 'export'], methods: { POST: handlers.exportData } },
    { path: ['projects', ':id', 'download'], methods: { GET: handlers.download, HEAD: handlers.download } },
    { path: ['projects', ':id', 'demo'], methods: { POST: handlers.demo } },
    { path: ['projects', ':id', 'gold'], methods: { POST: handlers.setGold } },
    { path: ['projects', ':id', 'validate'], methods: { POST: handlers.validate } },
    // Compatibility aliases (same store methods as the item-scoped writes).
    { path: ['projects', ':id', 'labels'], methods: { POST: itemAliasHandler('saveLabel') } },
    { path: ['projects', ':id', 'reviews'], methods: { POST: itemAliasHandler('review') } },
    { path: ['browse'], methods: { GET: handlers.browse } },
  ];

  /** Find a route for the path segments and extract `:name` parameters. */
  const matchRoute = (segments) => {
    for (const route of routes) {
      if (route.path.length !== segments.length) continue;
      const params = {};
      let matched = true;
      for (let index = 0; index < route.path.length; index += 1) {
        const pattern = route.path[index];
        if (pattern.startsWith(':')) {
          params[pattern.slice(1)] = segments[index];
        } else if (pattern !== segments[index]) {
          matched = false;
          break;
        }
      }
      if (matched) return { route, params };
    }
    return undefined;
  };

  /* ----------------------------------------------------------------------- *
   * Dispatch
   * ----------------------------------------------------------------------- */

  const dispatch = async (req, res) => {
    const rawUrl = typeof req?.url === 'string' && req.url !== '' ? req.url : PREFIX;
    let url;
    try {
      url = new URL(rawUrl, 'http://local');
    } catch {
      throw new ApiError(400, 'BAD_URL', '请求 URL 无法解析');
    }
    const pathname = url.pathname;
    let rest;
    if (pathname === PREFIX || pathname === `${PREFIX}/`) rest = '';
    else if (pathname.startsWith(`${PREFIX}/`)) rest = pathname.slice(PREFIX.length);
    else throw new ApiError(404, 'NOT_FOUND', `未知接口：${pathname}`);
    const segments = rest.split('/').filter((segment) => segment !== '').map(decodeSegment);
    const match = matchRoute(segments);
    if (!match) throw new ApiError(404, 'NOT_FOUND', `未知接口：${req.method ?? 'GET'} ${pathname}`);
    const method = String(req?.method ?? 'GET').toUpperCase();
    const handler = match.route.methods[method];
    if (typeof handler !== 'function') {
      res.setHeader('allow', Object.keys(match.route.methods).join(', '));
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', `该接口不支持 ${method}`);
    }
    const body = JSON_WRITE_METHODS.has(method) ? await readJsonBody(req, maxBodyBytes) : undefined;
    await handler({ req, res, params: match.params, url, body, method });
  };

  /** Map any thrown value onto the error envelope. */
  const sendErrorFromException = (res, error) => {
    if (error instanceof ApiError) {
      sendApiError(res, error.status, error.code, error.message, error.details);
      return;
    }
    if (error && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) {
      sendApiError(
        res,
        error.status,
        typeof error.code === 'string' && error.code !== '' ? error.code : 'ERROR',
        String(error.message ?? '请求失败'),
        error.details,
      );
      return;
    }
    const message = String(error?.message ?? '');
    if (/越界|outside|traversal/i.test(message)) {
      sendApiError(res, 403, 'ROUTE_FORBIDDEN', '路径越界：拒绝访问');
      return;
    }
    if (error?.code === 'ENOENT') {
      sendApiError(res, 404, 'NOT_FOUND', '文件或目录不存在');
      return;
    }
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      sendApiError(res, 403, 'FORBIDDEN', '文件访问被拒绝');
      return;
    }
    log('error', `未处理异常：${error?.stack ?? String(error)}`);
    sendApiError(res, 500, 'INTERNAL_ERROR', '服务器内部错误');
  };

  /**
   * Handle one request. The Host calls this for every URL under the prefix.
   * @param {any} req Node request.
   * @param {any} res Node response.
   */
  const handle = async (req, res) => {
    try {
      const rejection = authRejection(req);
      if (rejection === 401) {
        sendApiError(res, 401, 'UNAUTHORIZED', '未通过身份验证：请重新登录标注台');
        return;
      }
      if (rejection === 403) {
        sendApiError(res, 403, 'FORBIDDEN', '请求被拒绝：来源或 Host 不受信任');
        return;
      }
      await dispatch(req, res);
    } catch (error) {
      if (res.headersSent) {
        try {
          res.destroy();
        } catch {
          // The socket may already be gone.
        }
        return;
      }
      sendErrorFromException(res, error);
    }
  };

  return { handle };
}
