/**
 * Shared low-level helpers for the annotation workbench.
 *
 * Zero external dependencies: only node:* modules. The host plugin is installed
 * as a `link:` profile bundle, so importing any @deepseek-ai package here would
 * fail module resolution and take the whole plugin down.
 *
 * @module @local/annotation-workbench/lib/util
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  appendFile,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

/** Current time as an ISO string. */
export function nowIso() {
  return new Date().toISOString();
}

/** Short random identifier with a prefix. */
export function randomId(prefix = 'id', length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let index = 0; index < length; index += 1) out += alphabet[bytes[index] % alphabet.length];
  return `${prefix}-${out}`;
}

/** Deterministic short hash. */
export function shortHash(value, length = 8) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, length);
}

/** Turn a human project name into a filesystem-safe slug. */
export function slugify(text, fallback = 'project') {
  const raw = String(text ?? '').trim();
  const ascii = raw
    .normalize('NFKD')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const base = ascii === '' ? fallback : ascii.slice(0, 48);
  return `${base}-${shortHash(raw || fallback, 5)}`;
}

/** Reject ids that could escape a directory or confuse the router. */
export function assertSafeId(id) {
  const text = String(id ?? '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(text)) {
    throw new Error(`不安全的 id：${JSON.stringify(id)}`);
  }
  return text;
}

/**
 * Resolve a path and prove it stays inside root. The root itself is allowed.
 * @param {string} root
 * @param {string} target
 * @returns {string}
 */
export function resolveInside(root, target) {
  const rootAbs = resolve(root);
  const targetAbs = resolve(rootAbs, target);
  if (targetAbs !== rootAbs && !targetAbs.startsWith(rootAbs + sep)) {
    throw new Error(`路径越界：${target}`);
  }
  return targetAbs;
}

/** Relative path from root, using forward slashes for portable records. */
export function relativeInside(root, target) {
  return relative(resolve(root), resolve(target)).split(sep).join('/');
}

/** Create a directory if needed. */
export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

/** Read JSON, returning fallback on ENOENT or malformed content. */
export async function readJson(path, fallback = undefined) {
  try {
    const text = await readFile(path, 'utf8');
    if (text.trim() === '') return fallback;
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    if (error instanceof SyntaxError) return fallback;
    throw error;
  }
}

/**
 * Write JSON through a temp file and rename. On Windows a rename over an
 * existing file can fail; retry after unlinking the destination.
 * @param {string} path
 * @param {unknown} value
 */
export async function writeJsonAtomic(path, value) {
  await ensureDir(dirname(path));
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(temp, text, 'utf8');
  try {
    await rename(temp, path);
    return;
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'EACCES'].includes(error?.code)) {
      await rm(temp, { force: true });
      throw error;
    }
  }
  await rm(path, { force: true });
  await rename(temp, path);
}

/**
 * Read JSONL, ignoring blank lines and (by default) a trailing partial line.
 * Corrupt complete lines are skipped; pass onError to observe them.
 * @param {string} path
 * @param {{ toleratePartial?: boolean, onError?: (error: Error, line: string, index: number) => void }} [options]
 * @returns {Promise<any[]>}
 */
export async function readJsonl(path, options = {}) {
  const { toleratePartial = true, onError } = options;
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const lines = text.split(/\r?\n/);
  if (toleratePartial && text !== '' && !text.endsWith('\n') && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last.trim() !== '' && !isCompleteJson(last)) lines.pop();
  }
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    try {
      out.push(JSON.parse(line));
    } catch (error) {
      onError?.(error, line, index);
    }
  }
  return out;
}

function isCompleteJson(line) {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

/**
 * Append one JSON line. If a previous writer left a partial final line, start a
 * new line first rather than gluing two records together.
 * @param {string} path
 * @param {unknown} value
 */
export async function appendJsonl(path, value) {
  await ensureDir(dirname(path));
  const line = JSON.stringify(value);
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
  await appendFile(path, `${prefix}${line}\n`, 'utf8');
}

/**
 * Run fn while holding an exclusive lock file. Stale locks are removed after
 * staleMs. The lock is only used for small shared configuration files.
 * @template T
 * @param {string} lockPath
 * @param {() => Promise<T>} fn
 * @param {{ timeoutMs?: number, staleMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withFileLock(lockPath, fn, options = {}) {
  const { timeoutMs = 5000, staleMs = 30000 } = options;
  const token = `${process.pid}-${randomBytes(6).toString('hex')}`;
  const started = Date.now();
  await ensureDir(dirname(lockPath));
  let acquired = false;
  while (!acquired) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ token, pid: process.pid, ts: nowIso() }));
      } finally {
        await handle.close();
      }
      acquired = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const info = await stat(lockPath);
        stale = Date.now() - info.mtimeMs > staleMs;
      } catch (statError) {
        if (statError?.code === 'ENOENT') continue;
      }
      if (stale) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`等待文件锁超时：${basename(lockPath)}`);
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      const current = await readJson(lockPath);
      if (current?.token === token) await unlink(lockPath);
    } catch {
      // The lock may already have been removed by a stale-lock takeover.
    }
  }
}

/**
 * Recursively list files. Symlinks are skipped to keep shared folders safe.
 * @param {string} root
 * @param {{ extensions?: string[], maxFiles?: number, skipDirs?: string[] }} [options]
 * @returns {Promise<{path: string, rel: string, size: number, name: string, ext: string}[]>}
 */
export async function walkFiles(root, options = {}) {
  const { extensions, maxFiles = 100000, skipDirs = ['.git', 'node_modules', 'exports', 'labels', 'reviews', 'claims'] } = options;
  const allowed = extensions ? new Set(extensions.map((entry) => entry.toLowerCase().replace(/^\./, ''))) : null;
  const out = [];
  const queue = [resolve(root)];
  while (queue.length > 0 && out.length < maxFiles) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) queue.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).slice(1).toLowerCase();
      if (allowed && !allowed.has(ext)) continue;
      let info;
      try {
        info = await stat(abs);
      } catch {
        continue;
      }
      out.push({ path: abs, rel: relativeInside(root, abs), size: info.size, name: entry.name, ext });
      if (out.length >= maxFiles) break;
    }
  }
  return out;
}

/**
 * Parse delimited text with quoted fields, escaped quotes, embedded newlines,
 * BOM and CRLF. The first row is the header.
 * @param {string} text
 * @param {string} [delimiter]
 * @returns {{ header: string[], rows: string[][] }}
 */
export function parseCsv(text, delimiter = ',') {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (char === '\r') {
      // Ignore CR; LF ends the row.
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length > 0 && rows[rows.length - 1].every((value) => value === '')) rows.pop();
  const header = rows.length > 0 ? rows[0].map((value) => value.trim()) : [];
  return { header, rows: rows.slice(1) };
}

/** Parse an SRT timecode or a plain seconds value. */
export function parseTimecode(text) {
  const value = String(text ?? '').trim().replace(',', '.');
  if (value === '') return NaN;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return NaN;
}

/** Format seconds as HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT). */
export function formatTimecode(seconds, options = {}) {
  const { comma = false } = options;
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${comma ? ',' : '.'}${pad(millis, 3)}`;
}

/** Parse SRT into segments. */
export function parseSrt(text) {
  const blocks = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (lines.length < 2) continue;
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;
    const [startRaw, endRaw] = lines[timingIndex].split('-->').map((part) => part.trim().split(/\s+/)[0]);
    const start = parseTimecode(startRaw);
    const end = parseTimecode(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const body = lines.slice(timingIndex + 1).join('\n').trim();
    out.push({ start, end, text: body });
  }
  return out;
}

/** Parse WebVTT into segments. */
export function parseVtt(text) {
  const normalized = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;
    if (lines[0].startsWith('WEBVTT')) continue;
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;
    const [startRaw, endRaw] = lines[timingIndex].split('-->').map((part) => part.trim().split(/\s+/)[0]);
    const start = parseTimecode(startRaw);
    const end = parseTimecode(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const body = lines.slice(timingIndex + 1).join('\n').trim();
    out.push({ start, end, text: body });
  }
  return out;
}

/** Serialize segments as SRT. */
export function formatSrt(segments) {
  return (Array.isArray(segments) ? segments : [])
    .filter((segment) => segment && segment.end > segment.start)
    .map((segment, index) => {
      const text = String(segment.text ?? '').trim();
      return `${index + 1}\n${formatTimecode(segment.start, { comma: true })} --> ${formatTimecode(segment.end, { comma: true })}\n${text}\n`;
    })
    .join('\n');
}

/** Serialize segments as WebVTT. */
export function formatVtt(segments) {
  const body = (Array.isArray(segments) ? segments : [])
    .filter((segment) => segment && segment.end > segment.start)
    .map((segment, index) => {
      const text = String(segment.text ?? '').trim();
      return `${index + 1}\n${formatTimecode(segment.start)} --> ${formatTimecode(segment.end)}\n${text}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

const MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
  webm: 'video/webm', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8', jsonl: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8', srt: 'text/plain; charset=utf-8', vtt: 'text/vtt; charset=utf-8',
  pdf: 'application/pdf',
};

/** Guess a browser MIME type from a file extension. */
export function guessMime(path) {
  const ext = extname(String(path ?? '')).slice(1).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

/** Make a safe single path segment for a generated file. */
export function safeFilename(name, fallback = 'item') {
  const raw = basename(String(name ?? '').replace(/[\\/]+/g, '_'));
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 96);
  return cleaned === '' ? fallback : cleaned;
}

/** Human byte size. */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value / 1024;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return `${scaled.toFixed(scaled >= 10 ? 1 : 2)} ${units[index]}`;
}

/** Clamp a number. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Deep equality for plain JSON values. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  if (typeof a === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

/** Unique values by a key function, preserving first occurrence. */
export function uniqBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const key = keyFn(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** Copy a file, creating the destination directory. */
export async function copyFileInto(source, destination) {
  await ensureDir(dirname(destination));
  await copyFile(source, destination);
  return destination;
}

/** Directory timestamp used in export folder names. */
export function fileStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
