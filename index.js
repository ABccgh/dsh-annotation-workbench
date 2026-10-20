/**
 * Host half of the annotation workbench bundle.
 *
 * Owns the project store, the authenticated HTTP API used by the Web half, and
 * the document-title branding. No @deepseek-ai imports: this package is
 * installed as a linked profile bundle and resolves only relative/node modules.
 *
 * @module @local/annotation-workbench
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { AnnotationStore } from './lib/store.js';
import { createApi } from './lib/api.js';

export const name = 'annotation-workbench';

/** The web carrier is the only hard service this root plugin needs. */
export const inject = ['webServer'];

/**
 * Normalize the Loader config. Unknown values fall back to safe defaults rather
 * than failing activation: a broken optional field should not hide the UI.
 * @param {Record<string, unknown>} raw
 */
export function normalizeConfig(raw = {}) {
  const text = (value, fallback) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback);
  const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.trunc(Number(value)) : fallback);
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
  return {
    dataRoot: text(raw.dataRoot, join(dshHome, 'annotation-projects')),
    deviceFile: text(raw.deviceFile, join(dshHome, 'annotation-workbench', 'device.json')),
    branding: raw.branding !== false,
    openOnStart: raw.openOnStart !== false,
    maxImportItems: positive(raw.maxImportItems, 50000),
    maxJsonBodyBytes: positive(raw.maxJsonBodyBytes, 4 * 1024 * 1024),
    mediaCacheSeconds: positive(raw.mediaCacheSeconds, 60),
  };
}

/**
 * Mount the workbench.
 * @param {any} ctx Cordis context with webServer.
 * @param {Record<string, unknown>} config Loader row config.
 */
export async function apply(ctx, config = {}) {
  const effective = normalizeConfig(config);
  const log = (level, message) => {
    try {
      ctx.logger?.[level]?.(`[annotation] ${message}`);
    } catch {
      // Logging must not break activation.
    }
  };

  const store = new AnnotationStore({
    dataRoot: effective.dataRoot,
    deviceFile: effective.deviceFile,
    logger: ctx.logger,
    config: effective,
  });
  await store.init();
  ctx.effect(() => ctx.provide('annotation', store));
  ctx.effect(() => () => { void store.close(); }, 'annotation: store close');

  const api = createApi({ store, ctx, config: effective });
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: '/annotation/api',
      handler: (req, res) => { void api.handle(req, res); },
    }),
    'annotation: http api',
  );

  if (effective.branding) {
    ctx.effect(
      () => ctx.webServer.tapIndex((html) => html.replace(
        /<title>[^<]*<\/title>/i,
        '<title>标注台 · 数据标注工作台</title>',
      )),
      'annotation: document title',
    );
  }

  log('info', `已挂载：dataRoot=${effective.dataRoot}，设备文件=${effective.deviceFile}`);
}
