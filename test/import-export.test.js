/**
 * Tests for the import pipeline and the export writers.
 *
 * Every test uses a temp directory created with `fs.mkdtemp` under the OS temp
 * dir and removes it afterwards. No network, no third-party dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildImportRecords,
  detectFormat,
  importItems,
  parseCsvItems,
  parseJsonlItems,
} from '../lib/import.js';
import { exportCoco, exportCsv, exportJsonl, exportReport, writeExport } from '../lib/export.js';
import { parseSrt, parseVtt } from '../lib/util.js';

const SRT_TEXT = [
  '1',
  '00:00:01,000 --> 00:00:02,500',
  '第一句字幕',
  '',
  '2',
  '00:00:03,000 --> 00:00:04,000',
  '第二句字幕',
  '',
].join('\n');

const VTT_TEXT = [
  'WEBVTT',
  '',
  '1',
  '00:00:00.500 --> 00:00:01.500',
  '你好世界',
  '',
  '2',
  '00:00:02.000 --> 00:00:03.500',
  '再见',
  '',
].join('\n');

async function makeTemp(t, prefix = 'aw-import-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path) {
  return readFile(path, 'utf8');
}

function parseJsonLines(text) {
  return text
    .trim()
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));
}

test('detectFormat: extensions, folder and explicit overrides', async (t) => {
  const root = await makeTemp(t, 'aw-detect-');
  const folder = join(root, 'media');
  await mkdir(folder);
  assert.equal(detectFormat('items.jsonl'), 'jsonl');
  assert.equal(detectFormat('items.ndjson'), 'jsonl');
  assert.equal(detectFormat('items.json'), 'json');
  assert.equal(detectFormat('items.csv'), 'csv');
  assert.equal(detectFormat('items.tsv'), 'tsv');
  assert.equal(detectFormat('subtitles.srt'), 'srt');
  assert.equal(detectFormat('subtitles.vtt'), 'vtt');
  assert.equal(detectFormat('clip.mp4'), 'media');
  assert.equal(detectFormat('notes.txt'), 'media');
  assert.equal(detectFormat(folder), 'folder');
  assert.equal(detectFormat(['a.png', 'b.png']), 'files');
  assert.equal(detectFormat('mystery.bin'), 'jsonl');
  // Explicit format wins over extension detection.
  assert.equal(detectFormat('data.csv', 'jsonl'), 'jsonl');
  assert.equal(detectFormat('data.json', 'tsv'), 'tsv');
});

test('parseJsonlItems: blank lines, arrays, malformed rows and BOM', () => {
  const text = '\uFEFF{"id":"a"}\n\n[{"id":"b"},{"id":"c"}]\nthis is not json\n42\n';
  const { records, warnings } = parseJsonlItems(text);
  assert.deepEqual(records.map((record) => record.id), ['a', 'b', 'c']);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].code, 'bad-json');
  assert.equal(warnings[1].code, 'bad-record');
});

test('parseCsvItems: BOM, quoted commas, embedded newlines and escaped quotes', () => {
  const csv = [
    '\uFEFFid,text,media',
    '1,"hello, world","a.jpg"',
    '2,"line one',
    'line two","b.mp4"',
    '3,"he said ""hi""",c.png',
  ].join('\n');
  const { records, warnings } = parseCsvItems(csv);
  assert.equal(warnings.length, 0);
  assert.equal(records.length, 3);
  assert.equal(records[0].text, 'hello, world');
  assert.equal(records[1].text, 'line one\nline two');
  assert.equal(records[2].text, 'he said "hi"');
  assert.equal(records[2].media, 'c.png');

  const tsv = parseCsvItems('id\ttext\nk1\t甲\nk2\t乙\n', { delimiter: '\t' });
  assert.equal(tsv.records.length, 2);
  assert.equal(tsv.records[1].text, '乙');
});

test('buildImportRecords: mapping, extras, duplicate ids and maxItems', () => {
  const csv = [
    '\uFEFFid,comment,file,extra',
    '1,"你好, 世界",a.jpg,x',
    '2,"多行',
    '文本",b.mp4,y',
    '1,dup,c.png,z',
  ].join('\n');
  const built = buildImportRecords({
    format: 'csv',
    text: csv,
    mapping: { id: 'id', text: 'comment', media: 'file' },
    template: 'image_bbox',
    limits: { maxItems: 10 },
  });
  assert.equal(built.records.length, 2);
  assert.equal(built.skipped, 1);
  assert.ok(built.warnings.some((warning) => warning.code === 'duplicate-id'));
  const [first, second] = built.records;
  assert.equal(first.id, '1');
  assert.equal(first.kind, 'image');
  assert.equal(first.payload.text, '你好, 世界');
  assert.equal(first.payload.extra, 'x');
  assert.deepEqual(first.media.map((entry) => entry.path), ['a.jpg']);
  assert.equal(second.payload.text, '多行\n文本');

  const jsonBuilt = buildImportRecords({
    format: 'json',
    text: JSON.stringify({ items: [{ id: 'j1', payload: { text: '正文' } }, { id: 'j2', text: '第二条' }] }),
  });
  assert.deepEqual(jsonBuilt.records.map((record) => record.id), ['j1', 'j2']);
  assert.equal(jsonBuilt.records[0].payload.text, '正文');
  assert.equal(jsonBuilt.records[1].payload.text, '第二条');

  const itemBuilt = buildImportRecords({
    format: 'jsonl',
    text: `${JSON.stringify({
      id: 'k1',
      kind: 'llm',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
      meta: { width: 12 },
      batch: 'B',
      tags: ['x'],
      priority: 2,
    })}\n`,
  });
  assert.equal(itemBuilt.records.length, 1);
  assert.equal(itemBuilt.records[0].kind, 'llm');
  assert.equal(itemBuilt.records[0].meta.width, 12);
  assert.equal(itemBuilt.records[0].batch, 'B');
  assert.deepEqual(itemBuilt.records[0].tags, ['x']);
  assert.equal(itemBuilt.records[0].priority, 2);

  const limited = buildImportRecords({
    format: 'jsonl',
    text: '{"id":"a"}\n{"id":"b"}\n{"id":"c"}\n',
    limits: { maxItems: 2 },
  });
  assert.equal(limited.records.length, 2);
  assert.equal(limited.skipped, 1);
  assert.ok(limited.warnings.some((warning) => warning.code === 'limit-reached'));
});

test('importItems: JSONL, media copy, duplicate ids, missing media and preview mode', async (t) => {
  const root = await makeTemp(t, 'aw-jsonl-');
  const projectDir = join(root, 'project');
  await mkdir(projectDir, { recursive: true });
  const sourceDir = join(root, 'source');
  await mkdir(sourceDir, { recursive: true });
  const videoPath = join(sourceDir, 'clip.mp4');
  await writeFile(videoPath, Buffer.from('fake video bytes'));
  const jsonlPath = join(sourceDir, 'items.jsonl');
  await writeFile(
    jsonlPath,
    [
      JSON.stringify({ id: 'v1', kind: 'video', media: [{ path: videoPath, mime: 'video/mp4' }], payload: { text: 'hello' } }),
      JSON.stringify({ id: 'v1', kind: 'video', payload: { text: 'duplicate' } }),
      JSON.stringify({ id: 'v2', kind: 'image', media: [{ path: 'missing.jpg' }] }),
    ].join('\n') + '\n',
    'utf8',
  );

  const project = { template: 'video_caption' };
  const result = await importItems({ projectDir, project, source: jsonlPath });
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.missingMedia.length, 1);
  assert.equal(result.missingMedia[0].path, 'missing.jpg');
  assert.ok(result.warnings.some((warning) => warning.code === 'duplicate-id'));
  assert.ok(result.warnings.some((warning) => warning.code === 'missing-media'));

  const v1 = result.items.find((item) => item.id === 'v1');
  assert.equal(v1.kind, 'video');
  assert.equal(v1.payload.text, 'hello');
  assert.deepEqual(v1.media, [{ path: 'media/clip.mp4', mime: 'video/mp4' }]);
  assert.equal(await exists(join(projectDir, 'media', 'clip.mp4')), true);
  // importItems must not write items.jsonl itself.
  assert.equal(await exists(join(projectDir, 'items.jsonl')), false);

  const v2 = result.items.find((item) => item.id === 'v2');
  assert.equal(v2.kind, 'image');
  assert.deepEqual(v2.media, [{ path: 'missing.jpg', mime: 'image/jpeg' }]);

  // Re-importing the same media for another item reuses the copied filename.
  await writeFile(jsonlPath, `${JSON.stringify({ id: 'v3', kind: 'video', media: [{ path: videoPath }] })}\n`);
  const reused = await importItems({ projectDir, project, source: jsonlPath });
  assert.equal(reused.imported, 1);
  assert.equal(reused.mediaFiles.length, 1);
  assert.equal(reused.mediaFiles[0].copied, false);
  assert.equal(reused.mediaFiles[0].path, 'media/clip.mp4');

  // Preview mode: no copy, absolute source path retained and warned about.
  const preview = await importItems({ projectDir, project, source: jsonlPath, copyMedia: false });
  assert.equal(preview.imported, 1);
  assert.equal(preview.mediaFiles.length, 0);
  assert.equal(preview.items[0].media[0].path, videoPath);
  assert.ok(preview.warnings.some((warning) => warning.code === 'external-media'));

  // Existing items.jsonl is honored for duplicate detection.
  await writeFile(join(projectDir, 'items.jsonl'), `${JSON.stringify({ id: 'v3' })}\n`, 'utf8');
  const duplicate = await importItems({ projectDir, project, source: jsonlPath });
  assert.equal(duplicate.imported, 0);
  assert.equal(duplicate.skipped, 1);
});

test('importItems: JSON arrays, CSV/TSV with BOM and quoted newlines', async (t) => {
  const root = await makeTemp(t, 'aw-tabular-');
  const projectDir = join(root, 'project');
  await mkdir(projectDir, { recursive: true });
  const sourceDir = join(root, 'source');
  await mkdir(sourceDir, { recursive: true });
  const videoPath = join(sourceDir, 'clip.mp4');
  const imagePath = join(sourceDir, 'pic.png');
  await writeFile(videoPath, Buffer.from('video'));
  await writeFile(imagePath, Buffer.from('png'));

  const jsonPath = join(sourceDir, 'items.json');
  await writeFile(jsonPath, JSON.stringify([
    { id: 't1', text: '第一段文本' },
    { id: 't2', text: '第二段文本', media: [imagePath] },
  ]), 'utf8');
  const project = { template: 'text_classification' };
  const jsonResult = await importItems({ projectDir, project, source: jsonPath });
  assert.equal(jsonResult.imported, 2);
  const t1 = jsonResult.items.find((item) => item.id === 't1');
  assert.equal(t1.kind, 'text');
  assert.equal(t1.payload.text, '第一段文本');
  const t2 = jsonResult.items.find((item) => item.id === 't2');
  assert.equal(t2.kind, 'image');
  assert.deepEqual(t2.media.map((entry) => entry.path), ['media/pic.png']);

  const csvPath = join(sourceDir, 'items.csv');
  const csvText = [
    '\uFEFFid,text,media',
    `c1,"你好, 世界","${videoPath}"`,
    `c2,"第一行`,
    `第二行","${imagePath}"`,
  ].join('\n');
  await writeFile(csvPath, `${csvText}\n`, 'utf8');
  const csvResult = await importItems({ projectDir, project, source: csvPath, format: 'auto' });
  assert.equal(csvResult.imported, 2);
  const c1 = csvResult.items.find((item) => item.id === 'c1');
  assert.equal(c1.payload.text, '你好, 世界');
  assert.deepEqual(c1.media.map((entry) => entry.path), ['media/clip.mp4']);
  const c2 = csvResult.items.find((item) => item.id === 'c2');
  assert.equal(c2.payload.text, '第一行\n第二行');

  const tsvPath = join(sourceDir, 'items.tsv');
  await writeFile(tsvPath, 'id\ttext\nk1\t甲\nk2\t乙\n', 'utf8');
  const tsvResult = await importItems({ projectDir, project, source: tsvPath, format: 'tsv' });
  assert.equal(tsvResult.imported, 2);
  assert.deepEqual(tsvResult.items.map((item) => item.id), ['k1', 'k2']);

  const limited = await importItems({
    projectDir,
    project,
    source: tsvPath,
    format: 'tsv',
    limits: { maxItems: 1 },
  });
  assert.equal(limited.imported, 1);
  assert.equal(limited.skipped, 1);
  assert.ok(limited.warnings.some((warning) => warning.code === 'limit-reached'));
});

test('importItems: folder walk with sidecars, orphan subtitles and text files', async (t) => {
  const root = await makeTemp(t, 'aw-folder-');
  const projectDir = join(root, 'project');
  await mkdir(projectDir, { recursive: true });
  const folder = join(root, 'batch');
  await mkdir(join(folder, 'sub'), { recursive: true });
  await writeFile(join(folder, 'clip.mp4'), Buffer.from('video'));
  await writeFile(join(folder, 'clip.srt'), SRT_TEXT, 'utf8');
  await writeFile(join(folder, 'note.txt'), '独立文本条目', 'utf8');
  await writeFile(join(folder, 'orphan.srt'), SRT_TEXT, 'utf8');
  await writeFile(join(folder, 'sub', 'pic.png'), Buffer.from('png'));
  await writeFile(join(folder, 'sub', 'pic.vtt'), VTT_TEXT, 'utf8');

  const project = { template: 'video_caption' };
  const result = await importItems({ projectDir, project, source: folder, format: 'auto' });
  assert.equal(result.imported, 4);
  assert.deepEqual(result.items.map((item) => item.id).sort(), ['clip', 'note', 'orphan', 'pic']);

  const clip = result.items.find((item) => item.id === 'clip');
  assert.equal(clip.kind, 'video');
  assert.equal(clip.payload.segments.length, 2);
  assert.equal(clip.payload.segments[0].text, '第一句字幕');
  assert.equal(clip.meta.durationMs, 4000);
  assert.deepEqual(clip.media.map((entry) => entry.path), ['media/clip.mp4']);

  const pic = result.items.find((item) => item.id === 'pic');
  assert.equal(pic.kind, 'image');
  assert.equal(pic.payload.segments.length, 2);
  assert.deepEqual(pic.media.map((entry) => entry.path), ['media/pic.png']);

  const note = result.items.find((item) => item.id === 'note');
  assert.equal(note.kind, 'text');
  assert.equal(note.payload.text, '独立文本条目');

  const orphan = result.items.find((item) => item.id === 'orphan');
  assert.equal(orphan.payload.segments.length, 2);
  assert.equal(orphan.media.length, 0);

  assert.equal(result.mediaFiles.length, 2);
  assert.equal(await exists(join(projectDir, 'media', 'clip.mp4')), true);
  assert.equal(await exists(join(projectDir, 'media', 'pic.png')), true);
});

test('importItems: SRT/VTT import and SRT/VTT export roundtrip', async (t) => {
  const root = await makeTemp(t, 'aw-subtitles-');
  const projectDir = join(root, 'project');
  await mkdir(projectDir, { recursive: true });
  const sourceDir = join(root, 'source');
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, 'sub.srt'), SRT_TEXT, 'utf8');
  await writeFile(join(sourceDir, 'sub.mp4'), Buffer.from('video'));
  await writeFile(join(sourceDir, 'cap.vtt'), VTT_TEXT, 'utf8');

  const project = {
    id: 'sub-project',
    name: '字幕项目',
    template: 'video_caption',
    revision: 1,
    schema: { fields: [{ id: 'segments', label: '字幕', type: 'segments', required: true }] },
  };

  const srtImport = await importItems({
    projectDir,
    project,
    source: join(sourceDir, 'sub.srt'),
    format: 'auto',
  });
  assert.equal(srtImport.imported, 1);
  const srtItem = srtImport.items[0];
  assert.equal(srtItem.id, 'sub');
  assert.equal(srtItem.payload.segments.length, 2);
  // Sibling media with the same basename is attached.
  assert.deepEqual(srtItem.media.map((entry) => entry.path), ['media/sub.mp4']);

  const annotations = {
    sub: [{
      actorId: 'a1',
      actorName: '张三',
      labels: { segments: srtItem.payload.segments },
      status: 'submitted',
      ts: '2026-10-20T10:00:00.000Z',
    }],
  };
  const srtExport = await writeExport({
    projectDir,
    project,
    items: srtImport.items,
    annotations,
    reviews: [],
    format: 'srt',
    itemId: 'sub',
    scope: 'all',
  });
  assert.equal(srtExport.files.length, 1);
  assert.equal(srtExport.files[0].name, 'sub.srt');
  assert.ok(srtExport.files[0].mime.includes('text/plain'));
  const exportedSrt = parseSrt(await readText(srtExport.files[0].path));
  assert.deepEqual(exportedSrt, srtItem.payload.segments);

  const vttImport = await importItems({
    projectDir,
    project,
    source: join(sourceDir, 'cap.vtt'),
    format: 'auto',
  });
  assert.equal(vttImport.imported, 1);
  const vttItem = vttImport.items[0];
  assert.equal(vttItem.id, 'cap');
  assert.equal(vttItem.payload.segments.length, 2);
  assert.equal(vttItem.media.length, 0);

  const vttAnnotations = {
    cap: [{
      actorId: 'a1',
      labels: { segments: vttItem.payload.segments },
      status: 'submitted',
      ts: '2026-10-20T10:00:00.000Z',
    }],
  };
  const vttExport = await writeExport({
    projectDir,
    project,
    items: vttImport.items,
    annotations: vttAnnotations,
    reviews: [],
    format: 'vtt',
    itemId: 'cap',
    scope: 'all',
  });
  assert.equal(vttExport.files.length, 1);
  assert.equal(vttExport.files[0].name, 'cap.vtt');
  const exportedVtt = parseVtt(await readText(vttExport.files[0].path));
  assert.deepEqual(exportedVtt, vttItem.payload.segments);
});

/** Shared fixture for the export-format tests. */
function makeExportFixture(root) {
  const projectDir = join(root, 'project');
  const project = {
    id: 'video-caption-a',
    name: '视频字幕批次 A',
    template: 'video_caption',
    revision: 3,
    schema: {
      fields: [
        { id: 'segments', label: '字幕分段', type: 'segments', required: true },
        { id: 'language', label: '语言', type: 'select', options: [{ value: 'zh', label: '中文' }, { value: 'en', label: '英文' }] },
        { id: 'score', label: '质量', type: 'rating', min: 1, max: 5 },
        { id: 'boxes', label: '标注框', type: 'bbox', options: [{ value: 'text', label: '文字' }] },
      ],
    },
  };
  const segmentsA = [{ start: 0, end: 2, text: '第一句' }, { start: 2.2, end: 4, text: '第二句' }];
  const segmentsB = [{ start: 0, end: 1.5, text: '另一句' }];
  const items = [
    {
      id: 'v1',
      kind: 'video',
      media: [{ path: 'media/v1.mp4', mime: 'video/mp4' }],
      payload: {},
      meta: { durationMs: 10000, width: null, height: null, fps: 25 },
      batch: 'A',
      tags: [],
      priority: 0,
      createdAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'v2',
      kind: 'video',
      media: [{ path: 'media/v2.mp4', mime: 'video/mp4' }],
      payload: {},
      meta: { durationMs: 8000, width: null, height: null, fps: null },
      batch: 'A',
      tags: ['demo'],
      priority: 1,
      createdAt: '2026-10-20T10:01:00.000Z',
    },
    {
      id: 'v3',
      kind: 'video',
      media: [{ path: 'media/v3.mp4', mime: 'video/mp4' }],
      payload: {},
      meta: { durationMs: 5000, width: null, height: null, fps: null },
      batch: 'B',
      tags: [],
      priority: 0,
      createdAt: '2026-10-20T10:02:00.000Z',
    },
    {
      id: 'img1',
      kind: 'image',
      media: [{ path: 'media/img1.png', mime: 'image/png' }],
      payload: {},
      meta: { durationMs: null, width: 100, height: 50, fps: null },
      batch: 'IMG',
      tags: [],
      priority: 0,
      createdAt: '2026-10-20T10:03:00.000Z',
    },
  ];
  const annotations = {
    v1: [{
      actorId: 'a1',
      actorName: '张三',
      labels: { segments: segmentsA, language: 'zh', score: 4 },
      status: 'submitted',
      ts: '2026-10-20T10:00:00.000Z',
    }],
    v2: [{
      actorId: 'a1',
      actorName: '张三',
      labels: { segments: segmentsB, language: 'en', score: 3 },
      status: 'submitted',
      ts: '2026-10-20T10:05:00.000Z',
    }],
    img1: [{
      actorId: 'a2',
      actorName: '李四',
      labels: { boxes: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4, label: 'text', text: 'OCR' }], score: 5 },
      status: 'submitted',
      ts: '2026-10-20T10:10:00.000Z',
    }],
  };
  const reviews = [
    {
      itemId: 'v1',
      actorId: 'r1',
      actorName: '王五',
      decision: 'approve',
      finalLabels: { segments: segmentsA, language: 'zh', score: 5 },
      comment: 'ok',
      ts: '2026-10-20T11:00:00.000Z',
    },
    {
      itemId: 'v3',
      actorId: 'r1',
      actorName: '王五',
      decision: 'reject',
      finalLabels: {},
      comment: 'no subtitles',
      ts: '2026-10-20T11:05:00.000Z',
    },
  ];
  return { projectDir, project, items, annotations, reviews, segmentsA, segmentsB };
}

test('writeExport: every format, scopes, subtitle batch and errors', async (t) => {
  const root = await makeTemp(t, 'aw-export-');
  const { projectDir, project, items, annotations, reviews } = makeExportFixture(root);
  const exportDirs = [];

  const assertArtifact = (result, name) => {
    assert.equal(result.files.length, 1);
    const artifact = result.files[0];
    assert.equal(artifact.name, name);
    assert.match(artifact.urlPath, new RegExp(`^exports/\\d{8}-\\d{6}(-\\d+)?/${name.replace('.', '\\.')}$`));
    assert.equal(artifact.urlPath.includes('\\'), false);
    assert.ok(artifact.path.startsWith(projectDir));
    assert.ok(artifact.size > 0);
    return artifact;
  };

  // JSONL: scope all keeps unlabeled/rejected items.
  const jsonlAll = await writeExport({ projectDir, project, items, annotations, reviews, format: 'jsonl', scope: 'all' });
  exportDirs.push(jsonlAll.dir);
  const jsonlArtifact = assertArtifact(jsonlAll, 'annotations.jsonl');
  assert.equal((await stat(jsonlArtifact.path)).size, jsonlArtifact.size);
  assert.equal(jsonlAll.summary.itemCount, 4);
  assert.equal(jsonlAll.summary.format, 'jsonl');
  const allLines = parseJsonLines(await readText(jsonlArtifact.path));
  assert.equal(allLines.length, 4);
  const allById = new Map(allLines.map((line) => [line.itemId, line]));
  assert.equal(allById.get('v1').status, 'approved');
  assert.equal(allById.get('v1').labels.score, 5);
  assert.equal(allById.get('v2').status, 'submitted');
  assert.equal(allById.get('v2').labels.score, 3);
  assert.equal(allById.get('v3').status, 'rejected');
  assert.deepEqual(allById.get('v3').labels, {});
  assert.equal(allById.get('img1').status, 'submitted');

  // Approved scope falls back to the latest submitted annotation.
  const jsonlApproved = await writeExport({ projectDir, project, items, annotations, reviews, format: 'jsonl', scope: 'approved' });
  exportDirs.push(jsonlApproved.dir);
  const approvedLines = parseJsonLines(await readText(jsonlApproved.files[0].path));
  assert.equal(approvedLines.length, 3);
  const approvedById = new Map(approvedLines.map((line) => [line.itemId, line]));
  assert.equal(approvedById.get('v1').labels.score, 5);
  assert.equal(approvedById.get('v2').labels.score, 3);
  assert.equal(approvedById.has('v3'), false);

  // Submitted scope uses the raw submitted labels.
  const jsonlSubmitted = await writeExport({ projectDir, project, items, annotations, reviews, format: 'jsonl', scope: 'submitted' });
  exportDirs.push(jsonlSubmitted.dir);
  const submittedById = new Map(parseJsonLines(await readText(jsonlSubmitted.files[0].path)).map((line) => [line.itemId, line]));
  assert.equal(submittedById.get('v1').labels.score, 4);
  assert.equal(submittedById.has('v3'), false);

  // CSV: header, one row per item and JSON-encoded complex labels.
  const csvResult = await writeExport({ projectDir, project, items, annotations, reviews, format: 'csv', scope: 'all' });
  exportDirs.push(csvResult.dir);
  const csvArtifact = assertArtifact(csvResult, 'annotations.csv');
  const csvText = await readText(csvArtifact.path);
  const csvLines = csvText.trim().split('\n');
  assert.equal(csvLines.length, 5);
  assert.ok(csvLines[0].startsWith('itemId,kind,status,actorId,actorName,ts,batch,tags,media,payload,'));
  assert.ok(csvLines[0].includes('segments'));
  assert.ok(csvLines[0].includes('language'));
  assert.ok(csvText.includes('第一句'));

  // COCO: only bbox-bearing items, normalized boxes scaled by image size.
  const cocoResult = await writeExport({ projectDir, project, items, annotations, reviews, format: 'coco', scope: 'all' });
  exportDirs.push(cocoResult.dir);
  const cocoArtifact = assertArtifact(cocoResult, 'coco.json');
  const coco = JSON.parse(await readText(cocoArtifact.path));
  assert.equal(coco.images.length, 1);
  assert.equal(coco.annotations.length, 1);
  assert.deepEqual(coco.annotations[0].bbox, [10, 10, 30, 20]);
  assert.equal(coco.annotations[0].item_id, 'img1');
  assert.equal(coco.images[0].width, 100);
  assert.equal(coco.images[0].height, 50);
  assert.equal(coco.categories[0].name, 'text');

  // Report: Markdown with stats and agreement sections.
  const stats = {
    counts: { total: 4, unlabeled: 0, in_progress: 0, submitted: 2, approved: 1, rejected: 1, flagged: 0 },
    actors: [{ actorId: 'a1', actorName: '张三', submitted: 2, approved: 1, avgDurationMs: 1200 }],
    today: { submitted: 0, approved: 0 },
    reviewBacklog: 1,
  };
  const agreement = {
    itemsCompared: 2,
    overall: 0.5,
    fields: [{ field: 'score', type: 'rating', pairs: 2, score: 0.5, detail: {} }],
    gold: null,
  };
  const reportResult = await writeExport({
    projectDir,
    project,
    items,
    annotations,
    reviews,
    format: 'report',
    scope: 'all',
    stats,
    agreement,
  });
  exportDirs.push(reportResult.dir);
  const reportArtifact = assertArtifact(reportResult, 'report.md');
  const markdown = await readText(reportArtifact.path);
  assert.ok(markdown.includes('# 标注项目导出报告'));
  assert.ok(markdown.includes(project.name));
  assert.ok(markdown.includes('字段覆盖率'));
  assert.ok(markdown.includes('审核'));
  assert.ok(markdown.includes('标注一致性'));
  assert.ok(markdown.includes('张三'));

  // SRT batch: one subtitle file per item with segments plus a manifest.
  const srtBatch = await writeExport({ projectDir, project, items, annotations, reviews, format: 'srt', scope: 'all' });
  exportDirs.push(srtBatch.dir);
  const srtNames = srtBatch.files.map((file) => file.name).sort();
  assert.deepEqual(srtNames, ['manifest.json', 'subtitles/v1.srt', 'subtitles/v2.srt']);
  assert.equal(srtBatch.summary.subtitleCount, 2);
  const manifest = JSON.parse(await readText(srtBatch.files.find((file) => file.name === 'manifest.json').path));
  assert.equal(manifest.files.length, 2);
  const v1Srt = await readText(srtBatch.files.find((file) => file.name === 'subtitles/v1.srt').path);
  assert.equal(parseSrt(v1Srt).length, 2);
  for (const file of srtBatch.files) {
    assert.ok(file.path.startsWith(srtBatch.dir));
    assert.match(file.urlPath, /^exports\/\d{8}-\d{6}(-\d+)?\//);
  }

  // VTT for a single item.
  const vttSingle = await writeExport({ projectDir, project, items, annotations, reviews, format: 'vtt', itemId: 'v2', scope: 'approved' });
  exportDirs.push(vttSingle.dir);
  const vttArtifact = assertArtifact(vttSingle, 'v2.vtt');
  const vttSegments = parseVtt(await readText(vttArtifact.path));
  assert.equal(vttSegments.length, 1);
  assert.equal(vttSegments[0].text, '另一句');

  // Every export lands in a distinct stamp directory.
  assert.equal(new Set(exportDirs).size, exportDirs.length);

  // A caller-provided stamp is honored and still uniquified on collision.
  const stamped = await writeExport({
    projectDir, project, items, annotations, reviews, format: 'jsonl', scope: 'all', stamp: 'custom-stamp',
  });
  assert.match(stamped.files[0].urlPath, /^exports\/custom-stamp\/annotations\.jsonl$/);
  const stampedAgain = await writeExport({
    projectDir, project, items, annotations, reviews, format: 'jsonl', scope: 'all', stamp: 'custom-stamp',
  });
  assert.match(stampedAgain.files[0].urlPath, /^exports\/custom-stamp-2\/annotations\.jsonl$/);

  // Direct helpers are consistent with writeExport.
  assert.equal(exportJsonl({ project, items, annotations, reviews, scope: 'approved' }).trim().split('\n').length, 3);
  assert.equal(exportCsv({ project, items, annotations, reviews, scope: 'all' }).trim().split('\n').length, 5);
  assert.equal(JSON.parse(exportCoco({ project, items, annotations, reviews, scope: 'all' })).annotations.length, 1);
  assert.ok(exportReport({ project, items, annotations, reviews, stats, agreement }).includes('标注一致性'));

  // Domain errors are thrown for the caller to translate.
  await assert.rejects(
    () => writeExport({ projectDir, project, items, annotations, reviews, format: 'pdf', scope: 'all' }),
    /不支持的导出格式/,
  );
  await assert.rejects(
    () => writeExport({ projectDir, project, items, annotations, reviews, format: 'srt', itemId: 'missing', scope: 'all' }),
    /未找到条目/,
  );
});
