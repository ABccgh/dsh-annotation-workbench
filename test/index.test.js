import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, normalizeConfig } from '../index.js';

test('host entry mounts the store, API route and title tap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-index-'));
  const services = new Map();
  const routes = [];
  let titleTap;
  const disposers = [];
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return dispose;
    },
    provide(name, value) {
      services.set(name, value);
    },
    webServer: {
      register(route) {
        routes.push(route);
        return () => {};
      },
      tapIndex(transform) {
        titleTap = transform;
        return () => {};
      },
    },
  };
  try {
    await apply(ctx, {
      dataRoot: join(dir, 'projects'),
      deviceFile: join(dir, 'device.json'),
      branding: true,
      maxImportItems: 1000,
    });
    assert.equal(services.has('annotation'), true);
    assert.equal(routes.length, 1);
    assert.equal(routes[0].kind, 'prefix');
    assert.equal(routes[0].path, '/annotation/api');
    assert.equal(typeof routes[0].handler, 'function');
    assert.equal(typeof titleTap, 'function');
    const html = '<html><head><title>Old</title></head></html>';
    assert.match(titleTap(html), /标注台 · 数据标注工作台/);
    const health = await services.get('annotation').health();
    assert.equal(health.ok, true);
  } finally {
    for (const dispose of disposers) {
      try {
        await dispose();
      } catch {
        // Cleanup is best effort in this fake lifecycle.
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizeConfig keeps safe defaults and accepts overrides', () => {
  const config = normalizeConfig({ dataRoot: 'X:/data', branding: false, maxImportItems: 12 });
  assert.equal(config.dataRoot, 'X:/data');
  assert.equal(config.branding, false);
  assert.equal(config.maxImportItems, 12);
  assert.equal(config.openOnStart, true);
  assert.ok(config.maxJsonBodyBytes > 0);
});
