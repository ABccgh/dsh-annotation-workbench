/**
 * Static checks for the browser half of the annotation workbench.
 *
 * These tests do not mount a browser: they read `client.js`, `icon.svg` and the
 * locale resources and enforce the packaging rules from CONTRACT.md plus a few
 * structural guarantees the client UI relies on (dictionary parity, no literal
 * colors outside the brand artwork, a syntax-clean browser script, ...).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(ROOT, '..');
const CLIENT_PATH = join(PACKAGE_ROOT, 'client.js');
const CLIENT = readFileSync(CLIENT_PATH, 'utf8');

/** Extract the body of an object literal assigned to `const <name> = {`. */
function objectBody(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  assert.notEqual(start, -1, `missing object literal ${name}`);
  const end = source.indexOf('\n    };', start);
  assert.notEqual(end, -1, `unterminated object literal ${name}`);
  return source.slice(start, end);
}

/** Collect quoted keys of a flat dictionary object literal. */
function dictionaryKeys(source, name) {
  const body = objectBody(source, name);
  const keys = [];
  const pattern = /'([^']+)':/g;
  let match;
  while ((match = pattern.exec(body))) keys.push(match[1]);
  return keys;
}

/** All dotted key paths of a JSON value (leaf oriented). */
function keyPaths(value, prefix = '') {
  if (Array.isArray(value)) return [`${prefix}[]`];
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().flatMap((key) => keyPaths(value[key], prefix === '' ? key : `${prefix}.${key}`));
  }
  return [prefix];
}

test('client.js is a syntax-clean classic browser script', () => {
  const result = spawnSync(process.execPath, ['--check', CLIENT_PATH], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `node --check failed: ${result.stderr || result.stdout}`);
  assert.equal(result.stderr.trim(), '');
});

test('client.js is valid UTF-8 without replacement characters', () => {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(CLIENT_PATH));
  assert.equal(decoded.includes('\uFFFD'), false, 'client.js contains U+FFFD replacement characters');
  assert.equal(decoded, CLIENT);
  assert.match(decoded, /标注台/);
});

test('module loader entry uses the package id and only requires react', () => {
  assert.match(CLIENT, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(CLIENT, /id:\s*'@local\/annotation-workbench'/);
  assert.match(CLIENT, /factory\(require\)\s*\{/);
  const factoryStart = CLIENT.indexOf('factory(require)');
  const factoryBody = CLIENT.slice(factoryStart);
  const requires = [...factoryBody.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
  assert.deepEqual(requires, ['react'], 'the factory may only require react');
  assert.match(CLIENT, /const React = require\('react'\);/);
  assert.match(CLIENT, /const h = React\.createElement;/);
});

test('client.js has no top-level module statements or build-step syntax', () => {
  assert.equal(/^\s*import\s/m.test(CLIENT), false, 'client.js must not use import statements');
  assert.equal(/^\s*export\s/m.test(CLIENT), false, 'client.js must not use export statements');
  assert.equal(/^\s*<[A-Za-z]/m.test(CLIENT), false, 'client.js must not contain JSX');
  assert.equal(CLIENT.includes('dangerouslySetInnerHTML'), false);
});

test('factory returns the documented inject list and apply function', () => {
  assert.match(CLIENT, /return \{ inject, apply \};/);
  const injectMatch = CLIENT.match(/const inject = \[([^\]]+)\];/);
  assert.ok(injectMatch, 'missing inject declaration');
  const inject = injectMatch[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  assert.deepEqual(inject, ['slots', 'locale', 'uiWorkspace', 'layout']);
});

test('registers the main panel, sidebar entry, settings section and brand slots', () => {
  const patterns = [
    /ctx\.slots\.inject\('main'/,
    /name:\s*'main'[\s\S]{0,160}?key:\s*PANEL_ID/,
    /ctx\.slots\.inject\('sidebar\.panellist'/,
    /name:\s*'sidebar\.panellist'[\s\S]{0,200}?order:\s*20/,
    /label:\s*\(\)\s*=>\s*boundT\('panel\.title'\)/,
    /ctx\.slots\.inject\('settings\.section'/,
    /name:\s*'settings\.section'[\s\S]{0,200}?order:\s*25/,
    /label:\s*\(\)\s*=>\s*boundT\('settings\.nav'\)/,
    /ctx\.slots\.inject\('sidebar\.brand\.mark'/,
    /name:\s*'sidebar\.brand\.mark'[\s\S]{0,80}?priority:\s*-1/,
    /ctx\.slots\.inject\('sidebar\.brand\.name'/,
    /name:\s*'sidebar\.brand\.name'[\s\S]{0,80}?priority:\s*-1/,
  ];
  for (const pattern of patterns) assert.match(CLIENT, pattern);
});

test('registers the locale namespace with embedded zh/en dictionaries', () => {
  assert.match(CLIENT, /const NS = 'annotation-workbench';/);
  assert.match(CLIENT, /ctx\.locale\.register\(NS,\s*\{ zh: ZH, en: EN \}\)/);
  const zh = dictionaryKeys(CLIENT, 'ZH');
  const en = dictionaryKeys(CLIENT, 'EN');
  assert.ok(zh.length > 150, `expected a meaningful zh dictionary, got ${zh.length} keys`);
  assert.deepEqual([...zh].sort(), [...en].sort(), 'zh and en dictionaries must share the same key set');
  assert.equal(new Set(zh).size, zh.length, 'zh dictionary contains duplicate keys');
  assert.equal(new Set(en).size, en.length, 'en dictionary contains duplicate keys');
});

test('every literal t() key exists in both dictionaries', () => {
  const zh = new Set(dictionaryKeys(CLIENT, 'ZH'));
  const en = new Set(dictionaryKeys(CLIENT, 'EN'));
  const keys = new Set([...CLIENT.matchAll(/\bt\('([^'\\]+)'/g)].map((match) => match[1]));
  assert.ok(keys.size > 150, `expected many translated strings, got ${keys.size}`);
  for (const key of keys) {
    assert.ok(zh.has(key), `missing zh translation for ${key}`);
    assert.ok(en.has(key), `missing en translation for ${key}`);
  }
});

test('locale JSON files keep plugin-manager metadata with matching keys', () => {
  const zh = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'locale', 'zh.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'locale', 'en.json'), 'utf8'));
  assert.equal(typeof zh.meta.title, 'string');
  assert.equal(typeof zh.meta.description, 'string');
  assert.equal(typeof en.meta.title, 'string');
  assert.equal(typeof en.meta.description, 'string');
  assert.ok(zh.meta.title.trim() !== '');
  assert.ok(en.meta.title.trim() !== '');
  assert.deepEqual(keyPaths(zh), keyPaths(en));
});

test('CSS uses theme alias tokens and no literal colors', () => {
  const start = CLIENT.indexOf('const CSS_TEXT = `');
  assert.notEqual(start, -1, 'missing CSS_TEXT');
  const end = CLIENT.indexOf('`;', start);
  assert.notEqual(end, -1, 'unterminated CSS_TEXT');
  const css = CLIENT.slice(start, end);
  assert.ok(css.includes('.aw-root'), 'CSS must be scoped under .aw-root');
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, 'CSS must not contain hex colors');
  assert.equal(/\brgba?\(/.test(css), false, 'CSS must not contain rgb()/rgba() literals');
  assert.equal(/\bhsla?\(/.test(css), false, 'CSS must not contain hsl()/hsla() literals');
  const tokens = css.match(/var\(--dsw-alias-[a-z0-9-]+/g) || [];
  assert.ok(tokens.length > 20, `expected theme aliases in CSS, got ${tokens.length}`);
  assert.ok(css.includes('@media (max-width:1100px)'), 'CSS must include a responsive breakpoint');
});

test('brand artwork is original SVG with literal colors only there', () => {
  const svg = readFileSync(join(PACKAGE_ROOT, 'icon.svg'), 'utf8');
  assert.match(svg, /<svg[^>]*width="64"[^>]*height="64"[^>]*viewBox="0 0 64 64"/);
  assert.match(svg, /#[0-9a-fA-F]{6}/);
  assert.equal(svg.includes('<script'), false);
  assert.equal(svg.includes('onload'), false);

  const brandStart = CLIENT.indexOf('const BRAND_BLUE');
  const brandEnd = CLIENT.indexOf('/* ===================================================================== *\n     * 5. HTTP client');
  assert.notEqual(brandStart, -1);
  assert.notEqual(brandEnd, -1);
  const artwork = CLIENT.slice(brandStart, brandEnd);
  assert.match(artwork, /function BrandMark/);
  assert.match(artwork, /h\('svg'/, 'brand mark must be in the artwork section');
});

test('export dialog, project settings and validation are wired; team controls are gone', () => {
  // Export dialog: all formats, scope controls, current item and real download links.
  assert.match(CLIENT, /function ExportModal\(/);
  assert.match(CLIENT, /api\.exportData\(/);
  for (const format of ['jsonl', 'csv', 'srt', 'vtt', 'coco', 'report']) {
    assert.ok(CLIENT.includes(`'${format}'`), `export dialog must offer ${format}`);
  }
  for (const scope of ['approved', 'submitted', 'all']) {
    assert.ok(CLIENT.includes(`'${scope}'`), `export dialog must offer scope ${scope}`);
  }
  assert.ok(CLIENT.includes('downloadPath'), 'export files must prefer file.downloadPath');
  assert.match(CLIENT, /\/download\?path=\$\{encodeURIComponent\(file\.urlPath\)\}/, 'export fallback must build the download URL from urlPath');
  assert.match(CLIENT, /download:\s*String\(/, 'export files must render an anchor with a download attribute');
  // Single-user: no claim/assignment/member controls.
  assert.equal(CLIENT.includes('function ClaimBadge('), false);
  assert.equal(CLIENT.includes('api.claim('), false);
  assert.equal(CLIENT.includes('api.release('), false);
  assert.equal(CLIENT.includes('api.assign('), false);
  assert.equal(CLIENT.includes("mode: 'round-robin'"), false);
  // Project settings: basics, guideline and schema each with a revision guard.
  assert.match(CLIENT, /function ProjectSettingsModal\(/);
  assert.match(CLIENT, /api\.patchProject\(/);
  assert.match(CLIENT, /api\.guideline\(/);
  assert.match(CLIENT, /api\.setGuideline\(/);
  assert.match(CLIENT, /api\.schema\(/);
  assert.match(CLIENT, /api\.setSchema\(/);
  assert.ok(CLIENT.includes('project.tab.schema'));
  assert.ok(CLIENT.includes('revision'));
  // Validation panel is used by both the settings dialog and the stats page.
  assert.match(CLIENT, /function ValidationPanel\(/);
  assert.match(CLIENT, /api\.validate\(/);
  assert.ok(CLIENT.includes('validate.run'));
  assert.match(CLIENT, /projectId,\s*stats: stats\.stats/);
});

test('delete-project flow is wired in list and settings', () => {
  assert.match(CLIENT, /function DeleteProjectModal\(/);
  assert.match(CLIENT, /api\.deleteProject\(/);
  assert.match(CLIENT, /project\.deleteWarning/);
  assert.match(CLIENT, /project\.deleteTrash/);
  assert.match(CLIENT, /project\.deletePurge/);
  assert.match(CLIENT, /project\.deletePurgeConfirm/);
  assert.match(CLIENT, /confirmName/);
  assert.match(CLIENT, /'deleteProject'/);
  assert.match(CLIENT, /onDelete: \(project\) => props\.onOpenModal\('deleteProject', project\)/);
  assert.match(CLIENT, /onDelete: \(target\) => openModal\('deleteProject'/);
  assert.match(CLIENT, /project\.deleteDanger/);
  assert.match(CLIENT, /project\.deleteButton/);
  assert.match(CLIENT, /const \[mode, setMode\] = React\.useState\('trash'\)/);
});

test('the main panel has a visible error boundary and reports crashes', () => {
  assert.match(CLIENT, /class WorkbenchBoundary extends React\.Component/);
  assert.match(CLIENT, /static getDerivedStateFromError/);
  assert.match(CLIENT, /componentDidCatch/);
  assert.match(CLIENT, /function WorkbenchRoot\(/);
  assert.match(CLIENT, /WorkbenchBoundary, null, h\(WorkbenchApp\)/);
  assert.ok(CLIENT.includes("data-aw-error"), 'fallback must mark itself for diagnostics');
  assert.ok(CLIENT.includes('标注台加载失败'));
  assert.match(CLIENT, /client-error/);
  assert.match(CLIENT, /function reportClientError/);
  assert.match(CLIENT, /ResizeObserver loop/);
  assert.match(CLIENT, /addEventListener\('error'/);
  assert.match(CLIENT, /addEventListener\('unhandledrejection'/);
  // The CSS is a managed head stylesheet, not a React child.
  assert.match(CLIENT, /function StyleSheet\(/);
  assert.equal(CLIENT.includes("h('style', null, CSS_TEXT)"), false);
  assert.match(CLIENT, /ctx\.slots\.register\(\{ name: 'main', key: PANEL_ID \}, WorkbenchRoot\)/);
  assert.equal(CLIENT.includes("name: 'main', key: PANEL_ID, locale: NS"), false);
  assert.match(CLIENT, /function WorkbenchApp\(/);
  // TaskQueue must be mounted as a React element; calling it directly would
  // execute its hooks inside WorkbenchApp and trigger React error #310 after
  // the onboarding screen switches to the workbench.
  assert.match(CLIENT, /h\(TaskQueue, \{/);
  assert.equal(CLIENT.includes('TaskQueue({'), false);
  assert.match(CLIENT, /className: 'aw-queue aw-pane'/);
});

test('client uses same-origin API calls and only sessionStorage for the guard', () => {
  assert.match(CLIENT, /const API_BASE = '\/annotation\/api';/);
  assert.ok(CLIENT.includes("credentials: 'same-origin'"));
  assert.equal(CLIENT.includes('localStorage'), false, 'project data must not use localStorage');
  assert.ok(CLIENT.includes('annotation.autoOpened'));
  assert.equal(/fetch\(\s*['"`]https?:/.test(CLIENT), false, 'API calls must stay same-origin');
  assert.match(CLIENT, /startSession\(undefined, \{ agentPreset: 'annotation' \}\)/);
  assert.match(CLIENT, /selectPanel\(null\)/);
  assert.match(CLIENT, /selectPanel\(PANEL_ID\)/, 'auto-open must select the workbench panel');
});
