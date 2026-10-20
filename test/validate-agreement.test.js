/**
 * Tests for label/schema validation and inter-annotator agreement.
 *
 * Uses only `node:test`, `node:assert` and the local modules; no temp files are
 * needed here because both modules are pure functions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateLabels, validateSchema } from '../lib/validate.js';
import { computeAgreement } from '../lib/agreement.js';

const SCHEMA = {
  fields: [
    { id: 'text', label: '文本', type: 'text', required: true },
    { id: 'note', label: '备注', type: 'textarea' },
    { id: 'count', label: '数量', type: 'number', min: 0, max: 10 },
    { id: 'choice', label: '选择', type: 'select', required: true, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    { id: 'multi', label: '多选', type: 'multiselect', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
    { id: 'flag', label: '布尔', type: 'boolean' },
    { id: 'rating', label: '评分', type: 'rating', min: 1, max: 5 },
    { id: 'tags', label: '标签', type: 'tags' },
    { id: 'segments', label: '分段', type: 'segments', required: true },
    { id: 'boxes', label: '框', type: 'bbox' },
    { id: 'spans', label: '片段', type: 'spans', options: [{ value: 'person', label: '人物' }] },
    { id: 'json', label: 'JSON', type: 'json' },
  ],
};

const ITEM = { id: 'i1', kind: 'text', media: [], payload: { text: 'abcdef' }, meta: { durationMs: 6000 } };

test('validateLabels: accepts valid values for every field type', () => {
  const labels = {
    text: '一段正文',
    note: '备注',
    count: 5,
    choice: 'a',
    multi: ['x', 'y'],
    flag: true,
    rating: 4,
    tags: ['tag1', 'tag2'],
    segments: [{ start: 0, end: 1, text: '第一段' }, { start: 1.2, end: 2.5, text: '第二段' }],
    boxes: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.3, label: 'text', text: 'OCR' }],
    spans: [{ start: 0, end: 3, label: 'person', text: 'abc' }],
    json: { nested: [1, 2, { ok: true }] },
  };
  const result = validateLabels({ schema: SCHEMA, item: ITEM, labels, project: { settings: { allowGaps: true } } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateLabels: reports type, option, range and coordinate errors per field', () => {
  const labels = {
    text: 42,
    note: { not: 'a string' },
    count: 99,
    choice: 'z',
    multi: ['x', 'bad'],
    flag: 'yes',
    rating: 9,
    tags: ['ok', 5, ''],
    segments: [{ start: -1, end: 0, text: '' }, { start: 0, end: 10, text: '过长' }],
    boxes: [{ x: 0.9, y: 0, w: 0.5, h: -1 }],
    spans: [{ start: 0, end: 99, label: '' }],
    json: () => 1,
  };
  const result = validateLabels({ schema: SCHEMA, item: ITEM, labels });
  assert.equal(result.ok, false);
  const fieldsWithErrors = new Set(result.errors.map((error) => error.field));
  for (const id of ['text', 'note', 'count', 'choice', 'multi', 'flag', 'rating', 'tags', 'segments', 'boxes', 'spans', 'json']) {
    assert.ok(fieldsWithErrors.has(id), `expected an error for field ${id}`);
  }
  for (const error of result.errors) {
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);
  }
});

test('validateLabels: required checks, allowIncomplete drafts and structural checks', () => {
  const missing = validateLabels({ schema: SCHEMA, item: ITEM, labels: {} });
  assert.equal(missing.ok, false);
  const missingFields = new Set(missing.errors.map((error) => error.field));
  for (const id of ['text', 'choice', 'segments']) assert.ok(missingFields.has(id));

  const draft = validateLabels({ schema: SCHEMA, item: ITEM, labels: {}, allowIncomplete: true });
  assert.equal(draft.ok, true);
  assert.equal(draft.errors.length, 0);

  const draftStructural = validateLabels({
    schema: SCHEMA,
    item: ITEM,
    labels: { segments: [{ start: 0, end: 0, text: '空段' }] },
    allowIncomplete: true,
  });
  assert.equal(draftStructural.ok, false);
  assert.ok(draftStructural.errors.some((error) => error.field === 'segments'));

  const badLabelsShape = validateLabels({ schema: SCHEMA, item: ITEM, labels: 'nope' });
  assert.ok(badLabelsShape.errors.some((error) => error.field === 'labels'));

  const badSchema = validateLabels({ schema: null, item: ITEM, labels: {} });
  assert.equal(badSchema.ok, false);
  assert.ok(badSchema.errors.some((error) => error.field === 'schema'));
});

test('validateLabels: segments overlap, duration bounds and gap warnings', () => {
  const schema = { fields: [{ id: 'segments', type: 'segments', required: true }] };
  const item = { id: 'v1', kind: 'video', meta: { durationMs: 6000 }, payload: {} };

  const overlap = validateLabels({
    schema,
    item,
    labels: { segments: [{ start: 0, end: 2, text: 'a' }, { start: 1, end: 3, text: 'b' }] },
  });
  assert.equal(overlap.ok, false);
  assert.ok(overlap.errors.some((error) => error.message.includes('重叠')));

  const tooLong = validateLabels({
    schema,
    item,
    labels: { segments: [{ start: 0, end: 100, text: 'a' }] },
  });
  assert.equal(tooLong.ok, false);
  assert.ok(tooLong.errors.some((error) => error.message.includes('媒体时长')));

  const gap = validateLabels({
    schema,
    item,
    labels: { segments: [{ start: 0, end: 1, text: 'a' }, { start: 3, end: 4, text: 'b' }] },
    project: { settings: { allowGaps: false } },
  });
  assert.equal(gap.ok, true);
  assert.ok(gap.warnings.some((warning) => warning.field === 'segments'));

  const noGapWarning = validateLabels({
    schema,
    item,
    labels: { segments: [{ start: 0, end: 1, text: 'a' }, { start: 3, end: 4, text: 'b' }] },
    project: { settings: { allowGaps: true } },
  });
  assert.equal(noGapWarning.warnings.length, 0);
});

test('validateLabels: bbox and spans bounds', () => {
  const bboxSchema = { fields: [{ id: 'boxes', type: 'bbox' }] };
  const bboxItem = { id: 'img1', kind: 'image', meta: { width: 100, height: 100 } };
  assert.equal(validateLabels({
    schema: bboxSchema,
    item: bboxItem,
    labels: { boxes: [{ x: 0, y: 0, w: 1, h: 1, label: 'text' }] },
  }).ok, true);

  const badBbox = validateLabels({
    schema: bboxSchema,
    item: bboxItem,
    labels: { boxes: [
      { x: 1.2, y: 0, w: 0.1, h: 0.1 },
      { x: 0, y: 0, w: 0, h: 0.1 },
      { x: 0.9, y: 0, w: 0.5, h: 0.1 },
      { x: 0, y: 0.9, w: 0.1, h: 0.5 },
    ] },
  });
  assert.equal(badBbox.ok, false);
  assert.ok(badBbox.errors.length >= 4);

  const spanSchema = { fields: [{ id: 'spans', type: 'spans' }] };
  const spanItem = { id: 't1', kind: 'text', payload: { text: 'abcdef' } };
  assert.equal(validateLabels({
    schema: spanSchema,
    item: spanItem,
    labels: { spans: [{ start: 0, end: 3, label: 'person' }] },
  }).ok, true);

  const badSpans = validateLabels({
    schema: spanSchema,
    item: spanItem,
    labels: { spans: [
      { start: 0, end: 7, label: 'person' },
      { start: -1, end: 2, label: 'person' },
      { start: 2, end: 2, label: 'person' },
      { start: 1.5, end: 2.5, label: 'person' },
      { start: 0, end: 2 },
    ] },
  });
  assert.equal(badSpans.ok, false);
  assert.ok(badSpans.errors.length >= 5);

  const noTextItem = validateLabels({
    schema: spanSchema,
    item: { id: 't2', kind: 'text', payload: {} },
    labels: { spans: [{ start: 0, end: 1, label: 'person' }] },
  });
  assert.equal(noTextItem.ok, false);
});

test('validateLabels: rating defaults, option whitelists, when-kind filtering and unknown keys', () => {
  const ratingSchema = { fields: [{ id: 'rating', type: 'rating' }] };
  assert.equal(validateLabels({ schema: ratingSchema, item: {}, labels: { rating: 5 } }).ok, true);
  assert.equal(validateLabels({ schema: ratingSchema, item: {}, labels: { rating: 0 } }).ok, false);
  assert.equal(validateLabels({ schema: ratingSchema, item: {}, labels: { rating: 5.5 } }).ok, false);

  const selectSchema = { fields: [{ id: 'choice', type: 'select', options: [{ value: 'a' }, { value: 'b' }] }] };
  assert.equal(validateLabels({ schema: selectSchema, item: {}, labels: { choice: 'a' } }).ok, true);
  assert.equal(validateLabels({ schema: selectSchema, item: {}, labels: { choice: 'c' } }).ok, false);

  const whenSchema = {
    fields: [{ id: 'segments', type: 'segments', required: true, when: { kind: ['video', 'audio'] } }],
  };
  assert.equal(validateLabels({ schema: whenSchema, item: { id: 't', kind: 'text' }, labels: {} }).ok, true);
  assert.equal(validateLabels({ schema: whenSchema, item: { id: 'v', kind: 'video' }, labels: {} }).ok, false);
  assert.equal(validateLabels({
    schema: whenSchema,
    item: { id: 'v', kind: 'video', meta: { durationMs: 1000 } },
    labels: { segments: [{ start: 0, end: 0.5, text: 'ok' }] },
  }).ok, true);

  const extra = validateLabels({
    schema: { fields: [{ id: 'a', type: 'text' }] },
    item: {},
    labels: { a: 'x', unknown_field: 'y' },
  });
  assert.equal(extra.ok, true);
  assert.ok(extra.warnings.some((warning) => warning.field === 'unknown_field'));
});

test('validateSchema: accepts valid schemas and reports structural problems', () => {
  assert.equal(validateSchema(SCHEMA).ok, true);
  assert.equal(validateSchema(SCHEMA.fields).ok, true);

  const invalid = validateSchema({
    fields: [
      { id: 'dup', type: 'text' },
      { id: 'dup', type: 'number' },
      { id: 'bad_type', type: 'nope' },
      { id: 'sel', type: 'select' },
      { id: 'sel2', type: 'select', options: [{ value: 'a' }, { value: 'a' }] },
      { id: 'range', type: 'number', min: 10, max: 1 },
      { id: 'when_field', type: 'text', when: { kind: ['alien'] } },
      { id: 'required_field', type: 'boolean', required: 'yes' },
      { type: 'text' },
    ],
  });
  assert.equal(invalid.ok, false);
  const fieldsWithErrors = new Set(invalid.errors.map((error) => error.field));
  for (const id of ['dup', 'bad_type', 'sel', 'sel2', 'range', 'when_field', 'required_field', 'fields[8]']) {
    assert.ok(fieldsWithErrors.has(id), `expected a schema error for ${id}`);
  }

  assert.equal(validateSchema(null).ok, false);
  assert.equal(validateSchema({ fields: 'nope' }).ok, false);
});

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

const AGREEMENT_SCHEMA = {
  fields: [
    { id: 'category', type: 'select', options: [{ value: 'news' }, { value: 'social' }] },
    { id: 'score', type: 'rating', min: 1, max: 5 },
    { id: 'amount', type: 'number', min: 0, max: 100 },
    { id: 'tags', type: 'tags' },
    { id: 'segments', type: 'segments' },
    { id: 'boxes', type: 'bbox' },
    { id: 'spans', type: 'spans' },
    { id: 'missing_field', type: 'text' },
  ],
};

function makeAgreementFixture() {
  const ts = (minute) => `2026-10-20T10:0${minute}:00.000Z`;
  const items = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4' }, { id: 'i5' }];
  const annotations = {
    i1: [
      { actorId: 'a1', labels: { category: 'news', score: 4, amount: 10, tags: ['x'] }, status: 'submitted', ts: ts(1) },
      { actorId: 'a2', labels: { category: 'news', score: 4, amount: 10, tags: ['x'] }, status: 'submitted', ts: ts(2) },
      { actorId: 'a3', labels: { tags: ['y'] }, status: 'submitted', ts: ts(3) },
    ],
    i2: [
      { actorId: 'a1', labels: { category: 'news', score: 3, amount: 20, tags: ['x', 'y'] }, status: 'submitted', ts: ts(1) },
      { actorId: 'a2', labels: { category: 'social', score: 5, amount: 30, tags: ['y', 'x'] }, status: 'submitted', ts: ts(2) },
    ],
    i3: [
      { actorId: 'a1', labels: { category: 'social', score: 5, amount: 40 }, status: 'submitted', ts: ts(1) },
      { actorId: 'a2', labels: { category: 'social', score: 5, amount: 44 }, status: 'submitted', ts: ts(2) },
    ],
    i4: [
      {
        actorId: 'a1',
        labels: {
          segments: [{ start: 0, end: 2, text: '你好' }],
          boxes: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'text' }],
          spans: [{ start: 0, end: 2, label: 'person' }],
        },
        status: 'submitted',
        ts: ts(1),
      },
      {
        actorId: 'a2',
        labels: {
          segments: [{ start: 0, end: 2, text: '你好' }],
          boxes: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'text' }],
          spans: [{ start: 0, end: 2, label: 'person' }],
        },
        status: 'submitted',
        ts: ts(2),
      },
    ],
    i5: [
      {
        actorId: 'a1',
        labels: {
          segments: [{ start: 0, end: 2, text: '你好' }],
          boxes: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'a' }],
          spans: [{ start: 0, end: 2, label: 'person' }],
        },
        status: 'submitted',
        ts: ts(1),
      },
      {
        actorId: 'a2',
        labels: {
          segments: [{ start: 0, end: 2, text: '再见' }],
          boxes: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'b' }],
          spans: [{ start: 1, end: 3, label: 'person' }],
        },
        status: 'submitted',
        ts: ts(2),
      },
    ],
  };
  return { items, annotations };
}

test('computeAgreement: categorical, numeric, segments, bbox and spans metrics', () => {
  const { items, annotations } = makeAgreementFixture();
  const result = computeAgreement({ items, annotations, schema: AGREEMENT_SCHEMA });
  assert.equal(result.itemsCompared, 5);
  assert.equal(typeof result.overall, 'number');
  const fields = new Map(result.fields.map((field) => [field.field, field]));

  const category = fields.get('category');
  assert.equal(category.type, 'select');
  assert.equal(category.pairs, 3);
  assert.ok(Math.abs(category.score - 2 / 3) < 1e-9);
  assert.ok(Math.abs(category.detail.percent - 2 / 3) < 1e-9);
  assert.ok(Math.abs(category.detail.modeShare - 5 / 6) < 1e-9);
  // po = 2/3; marginals news 2/1 and news 1/2 => pe = 4/9 => kappa = 0.4.
  assert.ok(Math.abs(category.detail.kappa - 0.4) < 1e-9);
  assert.equal(category.detail.actors, 2);

  const score = fields.get('score');
  assert.equal(score.type, 'rating');
  assert.equal(score.pairs, 3);
  assert.ok(Math.abs(score.score - 5 / 6) < 1e-9);
  assert.equal(score.detail.range, 4);
  assert.ok(Math.abs(score.detail.meanAbsDiff - 2 / 3) < 1e-9);

  const amount = fields.get('amount');
  assert.equal(amount.type, 'number');
  assert.equal(amount.pairs, 3);
  assert.ok(Math.abs(amount.score - 143 / 150) < 1e-9);
  assert.equal(amount.detail.range, 100);

  const tags = fields.get('tags');
  assert.equal(tags.type, 'tags');
  assert.equal(tags.pairs, 4);
  assert.ok(Math.abs(tags.score - 0.5) < 1e-9);
  assert.equal(tags.detail.kappa, null);
  assert.equal(tags.detail.actors, 3);
  // ['x','y'] and ['y','x'] count as the same set.
  assert.ok(Math.abs(tags.detail.modeShare - 5 / 6) < 1e-9);

  const segments = fields.get('segments');
  assert.equal(segments.pairs, 2);
  assert.ok(Math.abs(segments.score - 0.5) < 1e-9);
  assert.equal(segments.detail.matched, 1);
  assert.equal(segments.detail.countA, 2);
  assert.equal(segments.detail.countB, 2);

  const boxes = fields.get('boxes');
  assert.equal(boxes.pairs, 2);
  assert.ok(Math.abs(boxes.score - 0.5) < 1e-9);

  const spans = fields.get('spans');
  assert.equal(spans.pairs, 2);
  assert.ok(Math.abs(spans.score - 0.5) < 1e-9);
  assert.ok(Math.abs(spans.detail.precision - 0.5) < 1e-9);
  assert.ok(Math.abs(spans.detail.recall - 0.5) < 1e-9);

  const noData = fields.get('missing_field');
  assert.equal(noData.pairs, 0);
  assert.equal(noData.score, null);

  const expectedOverall = (3 * (2 / 3) + 3 * (5 / 6) + 3 * (143 / 150) + 4 * 0.5 + 2 * 0.5 + 2 * 0.5 + 2 * 0.5) / 19;
  assert.ok(Math.abs(result.overall - expectedOverall) < 1e-9);
});

test('computeAgreement: gold accuracy per field type', () => {
  const { items, annotations } = makeAgreementFixture();
  const gold = [
    { itemId: 'i1', labels: { category: 'news', score: 4, amount: 11 } },
    {
      itemId: 'i4',
      labels: {
        segments: [{ start: 0, end: 2, text: '你好' }],
        boxes: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'text' }],
        spans: [{ start: 0, end: 2, label: 'person' }],
      },
    },
    { itemId: 'unknown-item', labels: { category: 'news' } },
  ];
  const result = computeAgreement({ items, annotations, schema: AGREEMENT_SCHEMA, gold });
  assert.equal(result.gold.items, 3);
  const goldFields = new Map(result.gold.fields.map((field) => [field.field, field]));

  const category = goldFields.get('category');
  assert.deepEqual({ correct: category.correct, total: category.total }, { correct: 1, total: 2 });
  assert.equal(category.score, 0.5);

  const score = goldFields.get('score');
  assert.deepEqual({ correct: score.correct, total: score.total }, { correct: 1, total: 1 });
  assert.equal(score.score, 1);

  const amount = goldFields.get('amount');
  assert.deepEqual({ correct: amount.correct, total: amount.total }, { correct: 0, total: 1 });
  assert.equal(amount.score, 0);

  for (const fieldId of ['segments', 'boxes', 'spans']) {
    const field = goldFields.get(fieldId);
    assert.deepEqual({ correct: field.correct, total: field.total }, { correct: 1, total: 1 }, fieldId);
  }

  const withoutGold = computeAgreement({ items, annotations, schema: AGREEMENT_SCHEMA });
  assert.equal(withoutGold.gold, null);
});

test('computeAgreement: graceful handling of empty and malformed data', () => {
  assert.deepEqual(computeAgreement(), { itemsCompared: 0, fields: [], overall: null, gold: null });

  const messy = computeAgreement({
    items: [{ id: 'x' }, null, 'ignored'],
    annotations: {
      x: [
        { actorId: 'a1', labels: null, status: 'submitted' },
        { actorId: 'a2', labels: { category: 'news' }, status: 'submitted', ts: '2026-10-20T10:00:00.000Z' },
        { actorId: 'a3', labels: { category: 'news' }, status: 'draft', ts: '2026-10-20T10:01:00.000Z' },
      ],
    },
    schema: { fields: [{ id: 'category', type: 'select', options: [{ value: 'news' }] }] },
  });
  assert.equal(messy.itemsCompared, 1);
  const category = messy.fields.find((field) => field.field === 'category');
  assert.equal(category.pairs, 1);
  assert.equal(category.score, 1);

  const skippedOnly = computeAgreement({
    items: [{ id: 's' }],
    annotations: {
      s: [
        { actorId: 'a1', labels: { category: 'news' }, status: 'skipped' },
        { actorId: 'a2', labels: { category: 'news' }, status: 'submitted' },
      ],
    },
    schema: { fields: [{ id: 'category', type: 'select' }] },
  });
  assert.equal(skippedOnly.itemsCompared, 0);

  const inferred = computeAgreement({
    items: [{ id: 'i' }],
    annotations: {
      i: [
        { actorId: 'a1', labels: { label: 'x' }, status: 'submitted' },
        { actorId: 'a2', labels: { label: 'x' }, status: 'submitted' },
      ],
    },
  });
  assert.equal(inferred.fields[0].field, 'label');
  assert.equal(inferred.fields[0].type, 'text');
  assert.equal(inferred.fields[0].score, 1);
  assert.equal(inferred.overall, 1);

  // Map-shaped annotations and gold are accepted too.
  const mapResult = computeAgreement({
    items: [{ id: 'i' }],
    annotations: new Map([['i', [
      { actorId: 'a1', labels: { flag: true }, status: 'submitted' },
      { actorId: 'a2', labels: { flag: false }, status: 'submitted' },
    ]]]),
    schema: { fields: [{ id: 'flag', type: 'boolean' }] },
    gold: new Map([['i', { labels: { flag: true } }]]),
  });
  assert.equal(mapResult.itemsCompared, 1);
  assert.equal(mapResult.fields[0].score, 0);
  assert.equal(mapResult.gold.items, 1);
  assert.equal(mapResult.gold.fields[0].correct, 1);
});
