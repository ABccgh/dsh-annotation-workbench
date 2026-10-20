# annotation-workbench implementation contract

This file is the shared interface contract for the single-machine annotation bundle. Keep it in sync with the code and tests.

> **v1.0 final (2026-10-21)**: single-machine single-user. `claim`/`release`/`assign`/`members` API routes and tool actions are removed from the exposed surface; the store keeps legacy helpers and files for historical projects. Review is self-review on the same actor. New projects default `singleUser: true, selfReview: true`. Project deletion is user-only (`DELETE /projects/:id`), never exposed as an Agent tool.

## Ownership

| Scope | Owner |
|---|---|
| `package.json`, `cordis.patch.yml`, `index.js`, `lib/util.js`, `lib/store.js`, `lib/templates.js`, `lib/tool-kit.js`, `README.md` | Lead |
| `lib/import.js`, `lib/export.js`, `lib/validate.js`, `lib/agreement.js`, `test/import-export.test.js`, `test/validate-agreement.test.js` | host-data |
| `lib/api.js`, `tools.js`, `test/api.test.js`, `test/tools.test.js` | api-tools |
| `client.js`, `locale/**`, `icon.svg`, `test/client-static.test.js` | client-ui |

Only the owner writes a file. Tests for a module may import it. If you need a small helper in `util.js`, message the Lead instead of editing it.

## Runtime constraints

- Host modules (`index.js`, `lib/**/*.js`, `tools.js`) must import only `node:*` and relative files. Never import `@deepseek-ai/*`; a local `link:` bundle cannot resolve those imports.
- `client.js` is plain browser JS loaded through `window.__ModuleLoader__.load`; it may only `require('react')`. No build step, no JSX, no bare imports.
- No third-party dependencies.
- All user-visible client strings go through the locale dictionary; Chinese is primary, English fallback.
- All colors in CSS use `var(--dsw-alias-*)`; only the brand SVG artwork may use literal colors.

## Data model

Project root: `<dataRoot>/<project.id>/`.

```text
project.json
guideline.md
items.jsonl
media/...
labels/<actorId>/<YYYY-MM>.jsonl
reviews/<actorId>.jsonl
claims/<itemId>.json        # legacy: old projects only; new projects do not create it
assignments.json            # legacy
members.jsonl               # current actor / legacy project members
activity.jsonl
gold.jsonl
exports/<timestamp>/
```

`project.json`:

```json
{
  "formatVersion": 1,
  "id": "video-caption-a-7f3k",
  "name": "视频字幕批次 A",
  "description": "",
  "template": "video_caption",
  "createdAt": "2026-10-20T15:00:00.000Z",
  "createdBy": {"id": "actor-1a2b3c4d", "name": "张三"},
  "revision": 3,
  "schema": {"fields": []},
  "settings": {
    "allowGaps": true,
    "selfReview": true,
    "singleUser": true,
    "exportScope": "approved",
    "allowExternalMedia": false
  }
}
```

Item (one JSON object per line in `items.jsonl`):

```json
{
  "id": "v001",
  "kind": "video",
  "media": [{"path": "media/v001.mp4", "mime": "video/mp4"}],
  "payload": {},
  "meta": {"durationMs": null, "width": null, "height": null, "fps": null},
  "batch": "A",
  "tags": [],
  "priority": 0,
  "createdAt": "..."
}
```

Kinds: `text | image | video | audio | llm | document`.

Label event (append to `labels/<actorId>/<YYYY-MM>.jsonl`):

```json
{"type":"label","itemId":"v001","actorId":"actor-1a2b3c4d","actorName":"张三",
 "ts":"2026-10-20T15:01:00.000Z","status":"submitted","labels":{},
 "note":"","durationMs":12345,"schemaRevision":3}
```

Status: `draft | submitted | skipped | flagged`.

Review event (append to `reviews/<actorId>.jsonl`):

```json
{"type":"review","itemId":"v001","actorId":"actor-...","actorName":"李四",
 "ts":"...","decision":"approve","finalLabels":{},"comment":"","schemaRevision":3}
```

Decision: `approve | reject`.

Claim file `claims/<itemId>.json` (legacy — no new writes from the single-user UI):

```json
{"itemId":"v001","actorId":"actor-...","actorName":"张三","ts":"...","expiresAt":"..."}
```

Members line: `{"type":"member","actorId":"...","actorName":"...","role":"annotator|reviewer|admin","ts":"..."}` — new single-user projects record the current actor only.
Activity line: `{"type":"activity","action":"...","detail":{},"actorId":"...","ts":"..."}`.
Gold line: `{"itemId":"...","labels":{},"updatedAt":"...","actorId":"..."}`.

Schema field:

```json
{
  "id": "segments",
  "label": "字幕分段",
  "type": "segments",
  "required": true,
  "help": "...",
  "options": [{"value":"zh","label":"中文"}],
  "min": 0,
  "max": 100,
  "when": {"kind": ["video","audio"]}
}
```

Field types: `text | textarea | number | select | multiselect | boolean | rating | tags | segments | bbox | spans | json`.

- segments: `[{start:number,end:number,text:string,label?:string}]` (seconds)
- bbox: `[{x,y,w,h,label,text?}]` normalized 0..1
- spans: `[{start,end,label,text}]` (UTF-16 offsets)
- multiselect/tags: `string[]`

Materialized annotation per actor: latest label event by that actor for the item.
Materialized review: latest review event across reviewers for the item (ties by ts, then actorId).
Item status:
- latest review approve -> `approved`
- latest review reject -> `rejected`
- else any submitted -> `submitted`
- else any flagged -> `flagged`
- else any draft -> `in_progress`
- else `unlabeled`

## `lib/util.js` (Lead-owned, already written)

Exports (ESM):

```js
export function nowIso()
export function randomId(prefix, length = 8)
export function slugify(text, fallback = 'project')
export function assertSafeId(id)
export function resolveInside(root, target) // returns absolute path or throws
export async function ensureDir(path)
export async function readJson(path, fallback)
export async function writeJsonAtomic(path, value)
export async function readJsonl(path, { toleratePartial = true } = {})
export async function appendJsonl(path, value)
export async function withFileLock(lockPath, fn, { timeoutMs = 5000, staleMs = 30000 } = {})
export async function walkFiles(root, options = {}) // [{path, rel, size, name, ext}]
export function parseCsv(text) // { header: string[], rows: string[][] }
export function parseSrt(text) // [{start,end,text}]
export function parseVtt(text) // [{start,end,text}]
export function formatSrt(segments)
export function formatVtt(segments)
export function parseTimecode(text) // seconds
export function formatTimecode(seconds, { comma = false } = {})
export function guessMime(path)
export function safeFilename(name, fallback = 'item')
export function formatBytes(bytes)
export function clamp(value, min, max)
export function deepEqual(a, b)
export function uniqBy(list, keyFn)
```

If a helper is missing, implement it locally in your module rather than editing `util.js`, and tell the Lead.

## `lib/import.js` (host-data)

```js
export function detectFormat(source, explicit)
export function parseJsonlItems(text, options) // { records, warnings }
export function parseCsvItems(text, options) // { records, warnings }
export function buildImportRecords(input) // input: {format, source, text?, files?, mapping, template, itemsExisting}
export async function importItems({
  projectDir, project, source, format = 'auto', mapping = {},
  copyMedia = true, limits = { maxItems: 50000 }, log = () => {},
})
// returns { imported, skipped, warnings, items, mediaFiles, missingMedia }
```

Rules:
- `format=auto`: `.jsonl`, `.json`, `.csv`, `.tsv`, `.srt`, `.vtt`, directory, or media file.
- JSONL/JSON records pass through `normalizeRecord`; id from `mapping.id` or `record.id`; if missing, `item-<n>`; duplicate ids skipped.
- CSV/TSV use `util.parseCsv`; mapping maps columns to id/text/media/messages.
- folder: walk files; media extensions `mp4,mov,mkv,webm,avi,mp3,wav,m4a,flac,ogg,png,jpg,jpeg,webp,gif,bmp,txt,md`; sidecar same basename `.srt/.vtt/.txt`; one item per media/text file.
- Media: if `copyMedia` and source is outside project `media/`, copy into `media/` with a safe unique name; store relative `media/<name>`. Otherwise store a path relative to project root if inside, otherwise absolute and set `warnings`.
- Ignore files > 2 GiB for copy? No hard failure; warn if copy fails and keep source path.
- `record.kind` from mapping/template/extension.
- Return items but do not write `items.jsonl`; the store appends them atomically after the helper returns. Media copies are side effects and must be idempotent by filename.

## `lib/export.js` (host-data)

```js
export function exportJsonl({project, items, annotations, reviews, scope})
export function exportCsv({project, items, annotations, reviews, scope})
export function exportCoco({project, items, annotations, reviews, scope})
export function exportReport({project, items, annotations, reviews, stats, agreement})
export async function writeExport({projectDir, project, items, annotations, reviews, format, scope, itemId, stats, agreement})
// returns { files: [{name, path, urlPath, size, mime}], dir, summary }
```

- `scope`: `approved | submitted | all`; approved falls back to latest submitted per item.
- JSONL/CSV/COCO/report produce one file in `exports/<ts>/`.
- SRT/VTT with `itemId` produce one file; without itemId produce `subtitles/<itemId>.srt` for all items with segments plus a `manifest.json`.
- Sanitize filenames; all writes under `projectDir/exports`.

## `lib/validate.js` (host-data)

```js
export function validateLabels({ schema, item, labels, project, allowIncomplete = false })
// returns { ok, errors: [{field, message}], warnings: [{field, message}] }
export function validateSchema(schema) // { ok, errors }
```

- Validate field type, required, select options, number ranges, rating bounds, tags arrays.
- segments: start >= 0, end > start, no overlap unless `settings.allowGaps`? (allowGaps controls gaps, not overlaps), end <= duration + 0.5 when duration known, text non-empty when required.
- bbox: 0 <= x,y <= 1, w,h > 0, x+w <= 1.0001, y+h <= 1.0001.
- spans: 0 <= start < end <= (item.payload.text?.length ?? 0).
- `allowIncomplete=true` (draft) only enforces structural validity, not required.
- schema validation: unique ids, known types, select options array.

## `lib/agreement.js` (host-data)

```js
export function computeAgreement({ items, annotations, schema, gold })
// returns {
//   itemsCompared, fields: [{field, type, pairs, score, detail}],
//   overall: number|null,
//   gold: {items, fields: [{field, correct, total, score}]} | null
// }
```

- annotations: map itemId -> [{actorId, labels, status, ts}].
- categorical: percent agreement (mode share) and Cohen's kappa for exactly 2 actors.
- numeric/rating: 1 - normalized mean absolute difference.
- segments/bbox: pairwise mean IoU matched greedily by text or label; 1 - IoU as distance.
- spans: boundary F1.
- Gold: compare each item's approved/first submitted labels to gold; categorical accuracy, numeric tolerance, segments IoU >= 0.5, bbox IoU >= 0.5.

## `lib/api.js` (api-tools)

```js
export function createApi({ store, ctx, config })
// returns { handle(req, res) }
```

- `path` is `/annotation/api` prefix; parse with `new URL(req.url, 'http://local')`.
- Auth: `ctx.get('connection')?.requestRejection({ headers: req.headers })`; if 401/403 respond and stop.
- JSON body limit 4 MB; `content-type` check for writes.
- Respond `application/json; charset=utf-8`; error envelope.
- Routes exactly as in the plan section 7. Store methods are the only business calls.
- Media route: `store.mediaPath(project, itemId, index)` returns `{absPath, mime, size, name}`; stream with Range, HEAD, 206, 416, 404.
- `download` route: only files under `<project>/exports`, resolved with `util.resolveInside`.
- `POST /projects/:id/import/preview` uses `store.previewImport`.
- `POST /projects/:id/import` uses `store.importItems`.
- `POST /projects/:id/export` uses `store.exportData`.
- `DELETE /projects/:id` body `{ confirmName, mode }` calls `store.deleteProject`; `mode` is `trash` (default) or `purge`; the exact project name is required. It is user-only and not exposed as an Agent tool.
- All routes catch errors and return `{error:{code,message}}`; never leak absolute paths except project root in `/health`.

## Store interface (Lead implements; api-tools and client call it)

```js
class AnnotationStore {
  constructor({ dataRoot, deviceFile, logger, config })
  async init()
  async health()
  async getDevice()
  async setDevice(patch) // accepts actorName, dataRoot, activeProject, openOnStart, ui
  async listProjects()
  async createProject({ name, template, schema, guideline, actor })
  async getProject(projectRef) // project id or name; throws NOT_FOUND
  async updateProject(projectRef, patch, expectedRevision)
  async deleteProject(projectRef, { mode = 'trash', confirmName }) // trash moves to <dataRoot>/.trash; purge removes
  async getGuideline(projectRef)
  async setGuideline(projectRef, text, expectedRevision)
  async setSchema(projectRef, schema, expectedRevision)
  async previewImport(projectRef, { source, format, mapping })
  async importItems(projectRef, opts) // returns import summary
  async queue(projectRef, { mode = 'annotate', filter = {}, q = '', cursor = 0, limit = 50, actorId })
  async next(projectRef, { mode = 'annotate', filter = {}, actorId })
  async getItem(projectRef, itemId, actorId)
  async saveLabel(projectRef, { itemId, actor, labels, status, note, durationMs })
  async review(projectRef, { itemId, actor, decision, finalLabels, comment })
  // Legacy helpers: kept for old projects, no API/tool/UI entry points.
  async claim(projectRef, { itemId, actor })
  async release(projectRef, { itemId, actor })
  async updateMeta(projectRef, { itemId, meta, actor })
  async stats(projectRef)
  async agreement(projectRef)
  async activity(projectRef, limit = 50)
  async members(projectRef) // legacy/current actor
  async exportData(projectRef, { format, scope, itemId })
  async assign(projectRef, { mode, actorIds, actor }) // legacy
  async setGold(projectRef, { itemId, labels, actor })
  async validate(projectRef, { itemId } = {})
  async mediaPath(projectRef, itemId, index)
  async seedDemo(actor)
  async close()
}
```

`actor` shape: `{id, name}`. All mutating methods append actor info to events. `projectRef` may be the id or the name; store resolves.

Queue row returned to API/client:

```json
{"id":"v001","kind":"video","preview":"...","status":"submitted","myStatus":"draft",
 "review":"pending","actors":["张三"],"mediaCount":1,"batch":"A","tags":[],
 "updatedAt":"...","priority":0}
```

Item detail:

```json
{"item":{}, "annotations":[], "reviews":[], "claims":[], "media":[{index,url,mime,size}],
 "status":"...", "myStatus":"...", "review":"pending|approved|rejected|none",
 "finalLabels":{}, "schemaRevision":3}
```

`claims` is legacy output for old projects; the single-user client does not render claim controls.

Stats shape (client expects):

```json
{"counts":{"total":0,"unlabeled":0,"in_progress":0,"submitted":0,"approved":0,"rejected":0,"flagged":0},
 "actors":[{"actorId":"","actorName":"","submitted":0,"approved":0,"avgDurationMs":0}],
 "today":{"submitted":0,"approved":0},"reviewBacklog":0,"labelDistribution":{},
 "recent":[{"ts":"","actorName":"","action":"","itemId":""}]}
```

## `tools.js` (api-tools)

Three tools, preset-scoped; `export const inject = ['tools','annotation']`.
Use `lib/tool-kit.js` `defineTool`. Actions as in the plan:
- `annotation_project`: `list|create|open|status|get_guideline|set_guideline|get_schema|set_schema|demo`
- `annotation_tasks`: `next|list|get|save|skip|flag|review`
- `annotation_data`: `import|export|stats|agreement|validate|gold`
All call `ctx.annotation` methods. Output text. No throw for domain errors; return `失败: <code> — <message>` plus a fix hint.

## `lib/api.js` route list

Exactly the plan's table. Add:
- `GET /browse?path=` optional directory listing for import wizard (directories and files, max 500 entries, rejects files outside absolute roots? allow any absolute path but only names/sizes, no content).
- `GET /projects/:id/download?path=<relative under exports>`.

## Client contract (client-ui)

- `client.js` calls `window.__ModuleLoader__.load({ id:'@local/annotation-workbench', factory(require){ ... } })`.
- Factory returns `{ inject: ['slots','locale','uiWorkspace','layout'], apply(ctx) { ... } }`.
- Register:
  - `main` key `annotation` -> `WorkbenchApp`
  - `sidebar.panellist` id `annotation`, order 20, label `() => t('panel.title')`
  - `settings.section` id `annotation`, order 25, label `() => t('settings.title')`
  - `sidebar.brand.mark` priority -1 -> custom SVG
  - `sidebar.brand.name` priority -1 -> "标注台"
- Fetch base `/annotation/api`; same-origin cookies.
- After registration, fetch `/device`; if `openOnStart` and `sessionStorage['annotation.autoOpened']` unset, `ctx.layout.selectPanel('annotation')`.
- "问 AI" button: `ctx.uiWorkspace.startSession(undefined, { agentPreset: 'annotation' })` then `ctx.layout.selectPanel(null)`.
- Keep `client.js` self-contained; embed zh/en dictionaries; use `React.createElement` via a `h` helper.
- Style with a `<style>` React element inside the app root; class prefix `aw-`.
- No `dangerouslySetInnerHTML` except static CSS; render guideline as plain text.

## Tests

- `node --test "test/*.test.js"` from the package root.
- Every module test uses temp dirs (`fs.mkdtemp`) and cleans up.
- API tests build a fake `ctx` with `get('connection')` returning `{ requestRejection(){ return undefined } }`, a fake store or a real store on a temp dir, and call `createApi(...).handle(req,res)` with mock req/res.
- Do not install the bundle or call `plugin_manager` from tests.
