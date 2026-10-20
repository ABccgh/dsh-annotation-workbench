/**
 * Seed the demo project used for first-run acceptance.
 *
 * This is a developer utility, not part of the plugin runtime. It writes into
 * the real data root and device file so the Web workbench has something to show
 * on first open.
 *
 * Usage:
 *   node scripts/seed-demo.mjs
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { AnnotationStore } from '../lib/store.js';

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
const dataRoot = process.env.ANNOTATION_DATA_ROOT || join(dshHome, 'annotation-projects');
const deviceFile = process.env.ANNOTATION_DEVICE_FILE
  || join(dshHome, 'annotation-workbench', 'device.json');

const store = new AnnotationStore({ dataRoot, deviceFile });
await store.init();
const device = await store.getDevice();
const actor = { id: device.actorId, name: device.actorName };
let project = (await store.listProjects()).find((entry) => entry.name === '演示项目');
if (!project) {
  const created = await store.createProject({
    name: '演示项目',
    template: 'text_classification',
    description: '首次打开标注台时用来体验队列、标注、复核与导出的示例项目，可直接删除。',
    actor,
  });
  project = created.project;
  console.log(`created project ${project.id}`);
}
await store.setDevice({ activeProject: project.id });
const seeded = await store.seedDemo(actor);
console.log(`active=${project.id} imported=${seeded.imported} skipped=${seeded.skipped ?? 0}`);

// One submission by the current actor makes the self-review tab demonstrable.
if (project.template === 'text_classification') {
  try {
    const detail = await store.getItem(project.id, 'demo-text-2', actor);
    const exists = detail.annotations.some((event) => event.actorId === actor.id && event.status === 'submitted');
    if (!exists) {
      await store.saveLabel(project.id, {
        itemId: 'demo-text-2',
        actor,
        labels: { category: 'news', sentiment: 'neutral', confidence: 4 },
        status: 'submitted',
        durationMs: 4200,
      });
      console.log('seeded self-review submission on demo-text-2');
    }
  } catch (error) {
    console.warn(`review seed skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}
await store.close();
