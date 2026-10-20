# 标注台 · DSH 数据标注工作台

把 DeepSeek Harness（DSH）改造成数据标注员的单机工作台：侧栏常驻「标注台」，项目放在本机目录，支持五类标注器、自检复核、一致性与导出，并附带一个只在标注预设里出现的 Agent 助手。

[GitHub 源码](https://github.com/ABccgh/dsh-annotation-workbench) · [更新记录](CHANGELOG.md) · [![test](https://github.com/ABccgh/dsh-annotation-workbench/actions/workflows/test.yml/badge.svg)](https://github.com/ABccgh/dsh-annotation-workbench/actions/workflows/test.yml)

> 这个包是 DSH 的 profile bundle，不修改 `app.asar` / DSH 安装目录。安装、升级、卸载都通过 DSH 的插件管理器完成。

## 功能

| 能力 | 说明 |
|---|---|
| 项目 | 本机目录，`project.json` + `items.jsonl` + 追加式事件日志 |
| 模板 | 文本分类、文本片段、图像分类/OCR、图像框选、视频字幕/音频转写、LLM 偏好、自定义 |
| 标注器 | 文本阅读与划词；图像缩放/框选；视频/音频分段与时间码；LLM A/B 对比 |
| 自检复核 | 本地提交后可复核自己的条目（通过/驳回/评论），无成员/领取/分配 |
| 质量 | 必填/范围/时间码/框选/片段校验；一致性（百分比、κ、IoU、F1）；可选金标准 |
| 导出 | JSONL、CSV、SRT、VTT、COCO、统计报告；导出前自动校验 |
| 删除项目 | 项目列表/项目设置入口，输入项目名确认；默认回收站，可彻底删除 |
| Agent | 「数据标注员」预设 + `annotation_project` / `annotation_tasks` / `annotation_data` 三个工具 |
| 品牌 | 侧栏「标注台」、标签+笔图标、页面标题（可在配置里关闭） |

## 安装

在 DSH 里让 Agent 执行（或在插件管理页选择本地目录）：

```text
plugin_manager action=install_bundle target=<本机 bundle 路径>
```

安装后：

1. 客户端刷新页面；若 Host 新模块未热加载，重启 DSH。
2. 侧栏出现「标注台」；首次进入填标注员名称。
3. 新建项目 → 选模板 → 建示例项目或导入数据。
4. 如需 AI 助手：在 Agent Preset 里选择「数据标注员」；工作台头部「问 AI」会直接用它新建会话。

## 项目目录

```text
<dataRoot>/<project-id>/
  project.json            # 元数据、schema、settings、revision
  guideline.md            # 标注规范
  items.jsonl             # 条目（导入后不原地修改）
  media/                  # 媒体（默认复制进来）
  labels/<actorId>/<YYYY-MM>.jsonl
  reviews/<actorId>.jsonl
  claims/<itemId>.json        # legacy：旧项目的领取记录；新项目不再创建
  assignments.json            # legacy：旧项目的分配记录
  members.jsonl               # 当前用户/旧项目成员记录
  activity.jsonl
  gold.jsonl
  exports/<timestamp>/
<dataRoot>/.trash/<project-id>-<timestamp>/   # 删除到回收站的项目
```

默认数据根：`%DSH_HOME%\annotation-projects`，可在设置里改。设备身份保存在 `%DSH_HOME%\annotation-workbench\device.json`。

## 单机与备份

1. 项目只放在本机目录，不提供共享盘、多成员、领取或任务分配。
2. 复核是「自检」：提交后可复核自己的条目，状态、评论和 finalLabels 仍会写入 `reviews/`。
3. 备份：复制整个 `<project-id>` 目录；恢复时放回数据根即可。项目不写入注册表或数据库。
4. 诊断：客户端渲染异常会写入 `%DSH_HOME%\annotation-workbench\client-errors.jsonl`，面板同时显示可读错误卡片。
5. 历史修复：v1.0 曾因 `TaskQueue` 被直接调用导致 React #310 白屏；现改为 React 组件挂载并加了错误边界，若仍出现错误卡片请把日志发给 Agent。

## 删除项目

可以直接在工作台里删除项目：

- **项目列表**：每个项目卡片右侧的垃圾桶按钮。
- **项目设置**：基本信息页底部「危险操作」→「删除项目」。

删除弹窗要求输入完整项目名；可以选择：

- **移到回收站（默认）**：项目目录移到 `<dataRoot>/.trash/<project-id>-<timestamp>/`，可手动移回恢复。
- **彻底删除**：还需额外勾选确认，删除后不可恢复。

删除当前打开的项目后，工作台回到项目列表，`device.json` 的 `activeProject` 会被清空。建议删除前备份整个项目目录。

## 导入格式

- JSONL/JSON 数组：每行/每项一个对象，支持 `id`、`text`、`media`、`messages`、`candidates`、`segments` 等字段。
- CSV/TSV：首行表头，导入向导里映射 id/文本/媒体列。
- 文件夹：按扩展名识别视频/音频/图片/文本；同名 `.srt`/`.vtt`/`.txt` 作为侧车。
- SRT/VTT：解析为分段；媒体同名字幕可直接预填。

示例：

```json
{"id":"t001","text":"这款耳机的音质不错，但夹耳朵。"}
{"id":"v001","video":"media/v001.mp4","meta":{"fps":25}}
{"id":"llm001","messages":[{"role":"user","content":"..."}],"candidates":[{"id":"A","text":"..."},{"id":"B","text":"..."}]}
```

## Agent 工具

只在「数据标注员」预设中可用：

- `annotation_project`：`list/create/open/status/get_guideline/set_guideline/get_schema/set_schema/demo`
- `annotation_tasks`：`next/list/get/save/skip/flag/review`
- `annotation_data`：`import/export/stats/agreement/validate/gold`

预标注默认写 `draft`，不会直接提交；复核建议先列疑点。工具和 UI 走同一个 `lib/store.js`，不会出现两套逻辑。删除项目不在 Agent 工具中开放，只允许用户在工作台操作。

## 数据与隐私

- 插件不主动联网；媒体、规范、标签只在本机读写。
- Agent 只有在用户要求时才会通过工具读取项目内容；使用外部模型时请按组织的数据规范操作。
- 导出/删除前先备份；单项目删除需要输入名字确认，不提供批量清空。

## 已知限制

- 图像只支持矩形框，不支持多边形/掩码/关键点。
- 视频不做逐帧跟踪；字幕分段以时间码为准。
- 单机单人版不做服务端账号、实时协同、数据库、成员/领取/分配。
- 不原生解析 XLSX；导出 CSV 可用 Excel 打开。
- 单机版仍保留 actorId 作为标注历史溯源；同一台机器只有一个身份。

## 开发

需要 Node.js 22+；本机没有全局 Node 时可用 DSH 自带的 Node 执行同样的命令。

```text
# 测试（139 项）
npm test

# 或直接
node --test "test/*.test.js"

# 语法检查
node --check client.js
```

开发脚本需要真实数据根时，用环境变量，不写死个人路径：

```text
ANNOTATION_DATA_ROOT=<数据根> ANNOTATION_DEVICE_FILE=<device.json> node scripts/seed-demo.mjs
ANNOTATION_DATA_ROOT=<数据根> ANNOTATION_DEVICE_FILE=<device.json> node scripts/smoke-api.mjs
```

CI：`.github/workflows/test.yml` 在 push / pull request 时用 Node 22 运行 `node --test test/*.test.js`。

代码约定：Host 只 import `node:*` 和相对文件；Client 只 `require('react')`；不引入第三方依赖。详见 [CONTRACT.md](CONTRACT.md)。

## 回滚

```text
plugin_manager action=set_bundle target=@local/annotation-workbench enabled=false
```

刷新页面即可；项目数据仍在数据根目录。重新启用后继续使用。

## License

MIT，见 [LICENSE](LICENSE)。
