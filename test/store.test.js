import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnnotationStore, AppError } from '../lib/store.js';

async function fixture(actorName = '标注员甲') {
  const dir = await mkdtemp(join(tmpdir(), 'aw-store-'));
  const dataRoot = join(dir, 'projects');
  const store = new AnnotationStore({
    dataRoot,
    deviceFile: join(dir, 'device-a.json'),
    config: { maxImportItems: 1000 },
  });
  await store.init();
  await store.setDevice({ actorName });
  return {
    dir,
    dataRoot,
    store,
    async close() {
      await store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('project creation seeds schema, guideline and active project', async () => {
  const f = await fixture();
  try {
    const created = await f.store.createProject({
      name: '文本测试项目',
      template: 'text_classification',
      actor: { id: 'actor-a', name: '甲' },
    });
    assert.equal(created.project.name, '文本测试项目');
    assert.equal(created.project.template, 'text_classification');
    assert.ok(created.project.schema.fields.length >= 3);
    assert.equal((await f.store.getDevice()).activeProject, created.project.id);
    const guideline = await f.store.getGuideline(created.project.id);
    assert.match(guideline.text, /文本分类规范/);
  } finally {
    await f.close();
  }
});

test('demo seed, submit, review and stats work across two devices', async () => {
  const f = await fixture('甲');
  try {
    const created = await f.store.createProject({
      name: '演示项目',
      template: 'text_classification',
      actor: { id: 'actor-a', name: '甲' },
    });
    const projectId = created.project.id;
    const seeded = await f.store.seedDemo({ id: 'actor-a', name: '甲' });
    assert.ok(seeded.imported > 0);
    const queue = await f.store.queue(projectId, { actor: { id: 'actor-a', name: '甲' } });
    assert.ok(queue.total > 0);
    const first = await f.store.getItem(projectId, queue.items[0].id, { id: 'actor-a', name: '甲' });
    const labels = {
      category: 'news',
      sentiment: 'neutral',
      confidence: 4,
    };
    const saved = await f.store.saveLabel(projectId, {
      itemId: first.item.id,
      actor: { id: 'actor-a', name: '甲' },
      labels,
      status: 'submitted',
      durationMs: 1200,
    });
    assert.equal(saved.status, 'submitted');
    assert.equal(saved.myStatus, 'submitted');

    // A second device shares the same project directory but has its own identity.
    const storeB = new AnnotationStore({
      dataRoot: f.dataRoot,
      deviceFile: join(f.dir, 'device-b.json'),
    });
    await storeB.init();
    await storeB.setDevice({ actorName: '乙', activeProject: projectId });
    const reviewed = await storeB.review(projectId, {
      itemId: first.item.id,
      actor: { id: 'actor-b', name: '乙' },
      decision: 'approve',
      comment: '通过',
    });
    assert.equal(reviewed.status, 'approved');
    const stats = await storeB.stats(projectId);
    assert.equal(stats.counts.approved, 1);
    assert.equal(stats.reviewBacklog, 0);
    const agreement = await storeB.agreement(projectId);
    assert.ok(agreement && Array.isArray(agreement.fields));
    await storeB.close();

    const exported = await f.store.exportData(projectId, { format: 'jsonl', scope: 'approved' });
    assert.ok(exported.files.length >= 1);
    const content = await readFile(exported.files[0].path, 'utf8');
    assert.match(content, /演示项目|demo-text/);
  } finally {
    await f.close();
  }
});

test('single-user projects allow self-review and default to singleUser', async () => {
  const f = await fixture('单机员');
  try {
    const created = await f.store.createProject({ name: '单机自检', template: 'text_classification', actor: { id: 'actor-solo', name: '单机员' } });
    assert.equal(created.project.settings.singleUser, true);
    assert.equal(created.project.settings.selfReview, true);
    await assert.rejects(
      () => stat(join(f.dataRoot, created.project.id, 'claims')),
      (error) => error?.code === 'ENOENT',
    );
    await f.store.seedDemo({ id: 'actor-solo', name: '单机员' });
    const queue = await f.store.queue(created.project.id, { actor: { id: 'actor-solo', name: '单机员' } });
    const itemId = queue.items[0].id;
    await f.store.saveLabel(created.project.id, {
      itemId,
      actor: { id: 'actor-solo', name: '单机员' },
      labels: { category: 'news', sentiment: 'neutral', confidence: 5 },
      status: 'submitted',
    });
    const reviewed = await f.store.review(created.project.id, {
      itemId,
      actor: { id: 'actor-solo', name: '单机员' },
      decision: 'approve',
      comment: '自检通过',
    });
    assert.equal(reviewed.status, 'approved');
    assert.equal(reviewed.reviews[0].actorId, 'actor-solo');
  } finally {
    await f.close();
  }
});

test('deleting a project moves it to trash or purges it', async () => {
  const f = await fixture('删除员');
  try {
    const created = await f.store.createProject({ name: '待删除项目', template: 'custom', actor: { id: 'actor-del', name: '删除员' } });
    const projectId = created.project.id;
    assert.equal((await f.store.getDevice()).activeProject, projectId);

    const trashed = await f.store.deleteProject(projectId, { confirmName: '待删除项目', mode: 'trash' });
    assert.equal(trashed.deleted, true);
    assert.equal(trashed.mode, 'trash');
    assert.ok(trashed.trashName);
    assert.equal((await f.store.getDevice()).activeProject, null);
    assert.equal((await f.store.listProjects()).length, 0);
    const moved = await readFile(join(f.dataRoot, '.trash', trashed.trashName, 'project.json'), 'utf8');
    assert.match(moved, /待删除项目/);

    const created2 = await f.store.createProject({ name: '彻底删除项目', template: 'custom', actor: { id: 'actor-del', name: '删除员' } });
    const purged = await f.store.deleteProject(created2.project.id, { confirmName: '彻底删除项目', mode: 'purge' });
    assert.equal(purged.mode, 'purge');
    assert.equal(purged.trashName, undefined);
    await assert.rejects(() => stat(join(f.dataRoot, created2.project.id)), (error) => error?.code === 'ENOENT');
    assert.equal((await f.store.listProjects()).length, 0);

    const created3 = await f.store.createProject({ name: '确认测试', template: 'custom', actor: { id: 'actor-del', name: '删除员' } });
    await assert.rejects(
      () => f.store.deleteProject(created3.project.id, { confirmName: '错名', mode: 'trash' }),
      (error) => error instanceof AppError && error.status === 422,
    );
    await assert.rejects(
      () => f.store.deleteProject(created3.project.id, { confirmName: '确认测试', mode: 'nuke' }),
      (error) => error instanceof AppError && error.status === 400,
    );
    await assert.rejects(
      () => f.store.deleteProject('missing-project', { confirmName: 'x', mode: 'trash' }),
      (error) => error instanceof AppError && error.status === 404,
    );
  } finally {
    await f.close();
  }
});

test('claim conflicts and release are enforced', async () => {
  const f = await fixture();
  try {
    const created = await f.store.createProject({ name: '领取测试', template: 'custom', actor: { id: 'actor-a', name: '甲' } });
    const projectId = created.project.id;
    await f.store.seedDemo({ id: 'actor-a', name: '甲' });
    const queue = await f.store.queue(projectId, { actor: { id: 'actor-a', name: '甲' } });
    const itemId = queue.items[0].id;
    await f.store.claim(projectId, { itemId, actor: { id: 'actor-a', name: '甲' } });
    await assert.rejects(
      () => f.store.claim(projectId, { itemId, actor: { id: 'actor-b', name: '乙' } }),
      (error) => error instanceof AppError && error.status === 409,
    );
    await f.store.release(projectId, { itemId, actor: { id: 'actor-a', name: '甲' } });
    const claimed = await f.store.claim(projectId, { itemId, actor: { id: 'actor-b', name: '乙' } });
    assert.equal(claimed.claim.actorId, 'actor-b');
  } finally {
    await f.close();
  }
});

test('revision conflicts are reported and schema updates bump revision', async () => {
  const f = await fixture();
  try {
    const created = await f.store.createProject({ name: '版本测试', template: 'custom', actor: { id: 'actor-a', name: '甲' } });
    const projectId = created.project.id;
    const schema = { fields: [{ id: 'x', label: 'X', type: 'text' }] };
    const updated = await f.store.setSchema(projectId, schema, 1);
    assert.equal(updated.project.revision, 2);
    await assert.rejects(
      () => f.store.setSchema(projectId, schema, 1),
      (error) => error instanceof AppError && error.status === 409,
    );
  } finally {
    await f.close();
  }
});
