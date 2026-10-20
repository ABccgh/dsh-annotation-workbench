/**
 * Annotation workbench — browser half.
 *
 * Plain browser JavaScript loaded through `window.__ModuleLoader__.load`. The
 * factory may only `require('react')`; everything else (controls, styles,
 * dictionaries, editors) is implemented here with React.createElement. The
 * host half (`index.js` + `lib/api.js`) mounts the JSON API under
 * `/annotation/api`; this file only talks to that API with same-origin
 * credentials.
 *
 * @module @local/annotation-workbench/client
 */
window.__ModuleLoader__.load({
  id: '@local/annotation-workbench',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'annotation-workbench';
    /** Id shared by the sidebar entry, the main panel and the settings section. */
    const PANEL_ID = 'annotation';
    /** Same-origin API prefix mounted by the host half. */
    const API_BASE = '/annotation/api';

    /* ===================================================================== *
     * 1. Locale dictionaries (zh is primary, en is the complete fallback)
     * ===================================================================== */

    const ZH = {
      'panel.title': '标注台',
      'brand.name': '标注台',
      'mode.annotate': '标注',
      'mode.review': '复核',
      'mode.stats': '统计',
      'status.unlabeled': '未标注',
      'status.none': '未标注',
      'status.in_progress': '进行中',
      'status.submitted': '已提交',
      'status.approved': '已通过',
      'status.rejected': '已驳回',
      'status.flagged': '已标记',
      'status.skipped': '已跳过',
      'status.draft': '草稿',
      'kind.text': '文本',
      'kind.image': '图像',
      'kind.video': '视频',
      'kind.audio': '音频',
      'kind.llm': 'LLM',
      'kind.document': '文档',
      'actions.save': '保存草稿',
      'actions.submit': '提交',
      'actions.skip': '跳过',
      'actions.flag': '标记',
      'actions.next': '下一项',
      'actions.prev': '上一项',
      'actions.refresh': '刷新',
      'actions.close': '关闭',
      'actions.cancel': '取消',
      'actions.confirm': '确认',
      'actions.create': '创建',
      'actions.import': '导入',
      'actions.export': '导出',
      'actions.delete': '删除',
      'actions.add': '添加',
      'actions.back': '返回',
      'actions.view': '打开',
      'actions.demo': '示例数据',
      'actions.copy': '复制',
      'actions.retry': '重试',
      'actions.settings': '设置',
      'actions.help': '快捷键',
      'actions.browse': '浏览',
      'actions.preview': '预览',
      'actions.apply': '采用',
      'actions.approve': '通过',
      'actions.reject': '驳回',
      'actions.parse': '解析',
      'actions.replace': '替换',
      'actions.append': '追加',
      'actions.split': '拆分',
      'actions.merge': '合并',
      'actions.setStart': '设为起点',
      'actions.setEnd': '设为终点',
      'actions.jump': '定位',
      'search.placeholder': '搜索条目内容或 ID',
      'filter.all': '全部',
      'filter.todo': '待标注',
      'filter.mine': '我的',
      'filter.review': '待复核',
      'filter.approved': '已通过',
      'filter.rejected': '已驳回',
      'filter.flagged': '已标记',
      'progress.label': '进度',
      'progress.value': '已提交 {done}/{total}',
      'actor.label': '标注员',
      'actor.anonymous': '未命名',
      'onboarding.title': '欢迎使用标注台',
      'onboarding.actorTitle': '先给自己起个名字',
      'onboarding.actorHint': '名称会写进每一条标注记录，方便复核时区分是谁做的。',
      'onboarding.actorPlaceholder': '例如：张三',
      'onboarding.actorRequired': '请先填写名称',
      'onboarding.saved': '已保存',
      'onboarding.projectsTitle': '项目',
      'onboarding.projectsEmpty': '还没有项目，先新建一个或导入数据。',
      'onboarding.newProject': '新建项目',
      'onboarding.importProject': '导入数据',
      'onboarding.openProject': '打开项目',
      'onboarding.backToList': '返回项目列表',
      'onboarding.createFirst': '新建第一个项目',
      'onboarding.loading': '正在加载项目…',
      'project.newTitle': '新建项目',
      'project.template': '选择模板',
      'project.templateHint': '模板决定默认字段和标注界面，创建后仍可修改字段。',
      'project.name': '项目名称',
      'project.namePlaceholder': '例如：视频字幕批次 A',
      'project.description': '项目说明',
      'project.demo': '同时写入示例条目',
      'project.creating': '正在创建…',
      'project.importTitle': '导入数据',
      'project.importHint': '支持 JSONL / JSON / CSV / TSV / SRT / VTT 文件和文件夹。',
      'project.source': '数据来源路径',
      'project.sourcePlaceholder': '绝对路径，例如 D:/data/batch1',
      'project.format': '格式',
      'project.format.auto': '自动识别',
      'project.copyMedia': '把媒体复制到项目目录',
      'project.mapping': '字段映射',
      'project.mappingHint': '把来源列映射到条目字段；自动识别不准时手动改。',
      'project.mapping.id': 'id 列',
      'project.mapping.text': '文本列',
      'project.mapping.media': '媒体列',
      'project.mapping.messages': '消息列',
      'project.preview': '预览',
      'project.importRun': '开始导入',
      'project.importing': '正在导入…',
      'project.imported': '导入完成：{imported} 条，跳过 {skipped} 条，警告 {warnings} 条',
      'project.columns': '识别到的列',
      'project.sample': '样例',
      'project.warnings': '警告',
      'project.noColumns': '没有识别到可映射的列',
      'project.previewFirst': '先点“预览”确认映射',
      'project.sourceRequired': '请填写数据来源路径',
      'project.browseTitle': '选择数据文件或文件夹',
      'project.browseUp': '上一级',
      'project.browseEmpty': '这个目录是空的',
      'project.browseTruncated': '目录内容过多，只显示前 500 项',
      'queue.title': '任务队列',
      'queue.empty': '队列为空',
      'queue.count': '共 {n} 项',
      'queue.loading': '正在加载…',
      'queue.end': '没有更多了',
      'queue.pick': '从左侧选择一条数据开始标注',
      'queue.loadMore': '加载更多',
      'form.title': '标注',
      'form.empty': '请选择一条数据',
      'form.required': '必填',
      'form.help': '说明',
      'form.jsonInvalid': 'JSON 格式错误',
      'form.saved': '草稿已保存',
      'form.submitted': '已提交',
      'form.skipped': '已跳过',
      'form.flagged': '已标记',
      'form.saving': '正在保存…',
      'form.submitFirst': '请先修正表单中的错误',
      'form.autosaved': '已自动保存',
      'form.autosaveOff': '自动保存已关闭',
      'form.fieldRequired': '请填写{label}',
      'form.fieldRange': '{label} 需在 {min} 到 {max} 之间',
      'form.placeholder': '请输入…',
      'form.tagsPlaceholder': '输入后按回车添加',
      'form.addTag': '添加',
      'form.ratingValue': '{n} 分',
      'form.segmentsHint': '在播放器下方的分段表中编辑时间轴。',
      'form.segmentsCount': '共 {n} 段',
      'form.bboxHint': '在图片上拖拽画框；选中框后可编辑类别与文字。',
      'form.spansHint': '在原文中选中文字后点“添加片段”，再在这里调整类别。',
      'form.noFields': '这个项目还没有字段定义。',
      'viewer.textEmpty': '这条数据没有文本内容',
      'viewer.imageEmpty': '这条数据没有可用图片',
      'viewer.mediaMissing': '媒体文件不可用',
      'viewer.llmEmpty': '这条数据没有对话内容',
      'viewer.messages': '对话',
      'viewer.candidate': '候选 {id}',
      'viewer.meta': '元数据',
      'viewer.caption': '字幕',
      'viewer.addBoxHint': '拖拽创建框；选中框可移动、缩放或删除',
      'viewer.boxLabel': '框类别',
      'viewer.boxText': '框内文字',
      'viewer.boxDelete': '删除选中框',
      'viewer.boxCount': '{n} 个框',
      'viewer.addSpan': '添加片段',
      'viewer.spanLabel': '片段类别',
      'viewer.selectFirst': '请先在原文中选中一段文字',
      'viewer.spansCount': '{n} 个片段',
      'media.segments': '分段',
      'media.addSegment': '添加分段',
      'media.deleteSegment': '删除分段',
      'media.splitSegment': '在播放位置拆分',
      'media.mergeSegment': '与下一段合并',
      'media.empty': '还没有分段。按 n 新建，或从字幕文本导入。',
      'media.importSubs': '从字幕文本导入',
      'media.importSubsHint': '粘贴 SRT 或 VTT 文本，解析成时间轴分段。',
      'media.replaceSegments': '替换现有分段',
      'media.subsEmpty': '没有解析出分段',
      'media.subsParsed': '已解析 {n} 条分段',
      'media.start': '起点',
      'media.end': '终点',
      'media.text': '文本',
      'media.label': '类别',
      'media.duration': '时长',
      'media.noMedia': '这条数据没有可播放的媒体文件。',
      'media.unsupported': '浏览器不支持这种媒体格式。',
      'review.title': '复核',
      'review.compare': '标注结果对比',
      'review.actor': '标注员',
      'review.final': '最终标签',
      'review.needFinal': '请先填写最终标签',
      'review.noAnnotations': '还没有标注员提交结果。',
      'review.different': '分歧',
      'review.same': '一致',
      'review.decision': '复核结论',
      'review.comment': '复核意见',
      'review.commentPlaceholder': '驳回时请写明原因，或在通过时补充说明…',
      'review.next': '下一项复核',
      'review.completed': '复核已保存',
      'review.noItem': '从左侧选择一条待复核数据',
      'review.history': '历史复核',
      'review.needComment': '驳回时请填写原因',
      'review.adoptHint': '点“采用”把某位标注员的结果复制到最终标签。',
      'review.pending': '待复核',
      'review.approved': '已通过',
      'review.rejected': '已驳回',
      'review.approve': '通过',
      'review.reject': '驳回',
      'stats.title': '统计',
      'stats.total': '总条目',
      'stats.unlabeled': '未标注',
      'stats.in_progress': '进行中',
      'stats.submitted': '已提交',
      'stats.approved': '已通过',
      'stats.rejected': '已驳回',
      'stats.flagged': '已标记',
      'stats.reviewBacklog': '待复核积压',
      'stats.actorProgress': '标注员进度',
      'stats.today': '今日提交',
      'stats.labelDistribution': '标签分布',
      'stats.agreement': '一致性',
      'stats.overall': '总体一致率',
      'stats.field': '字段',
      'stats.type': '类型',
      'stats.pairs': '对比数',
      'stats.score': '分数',
      'stats.recent': '最近动态',
      'stats.noActors': '还没有标注记录。',
      'stats.noAgreement': '还没有可比较的历史标注。',
      'stats.noRecent': '暂无动态。',
      'stats.noDistribution': '暂无标签分布。',
      'stats.loading': '正在加载统计…',
      'stats.gold': '金标准',
      'settings.title': '标注台设置',
      'settings.nav': '标注台',
      'settings.actor': '标注员名称',
      'settings.actorHint': '每台设备一个身份，会写入标注事件。',
      'settings.dataRoot': '数据根目录',
      'settings.dataRootHint': '项目只保存在本机这个目录下，不会上传或共享。',
      'settings.openOnStart': '打开页面时自动进入标注台',
      'settings.autosave': '自动保存草稿',
      'settings.autosaveHint': '停止输入 1.5 秒后自动保存为草稿。',
      'settings.refresh': '刷新项目',
      'settings.copyPath': '复制数据路径',
      'settings.copied': '数据路径已复制',
      'settings.version': '版本',
      'settings.go': '前往标注台',
      'settings.save': '保存设置',
      'settings.saved': '设置已保存',
      'settings.pickDirectory': '选择目录',
      'settings.pickFailed': '无法打开目录选择器，请手动填写路径',
      'settings.deviceFailed': '无法读取设备设置',
      'settings.saveFailed': '保存失败：{message}',
      'header.project': '项目',
      'header.ai': '问 AI',
      'header.copyPrompt': '复制任务指令',
      'header.settings': '设置',
      'header.shortcuts': '快捷键',
      'header.progress': '已提交 {done}/{total}',
      'header.noProject': '未选择项目',
      'prompt.intro': '标注任务指令',
      'prompt.project': '项目：{name}（{id}）',
      'prompt.item': '当前条目：{id}',
      'prompt.mode': '模式：{mode}',
      'prompt.body': '请先读取项目规范与 schema，再处理当前条目：给出预标注草稿（status=draft，不要提交），逐字段说明依据；发现时间码越界、类别不在选项内或必填缺失时先指出并询问。',
      'prompt.copied': '任务指令已复制',
      'toast.close': '关闭',
      'toast.unauthorized': '登录已失效，请刷新页面或重新打开标注台',
      'toast.error': '请求失败：{message}',
      'toast.network': '网络错误，请确认 DSH 服务仍在运行',
      'toast.openWorkbench': '打开标注台',
      'shortcuts.title': '键盘快捷键',
      'shortcuts.next': '下一项',
      'shortcuts.prev': '上一项',
      'shortcuts.save': '保存草稿',
      'shortcuts.submit': '提交',
      'shortcuts.skip': '跳过',
      'shortcuts.flag': '标记',
      'shortcuts.help': '显示快捷键',
      'shortcuts.escape': '关闭弹窗',
      'shortcuts.play': '播放 / 暂停',
      'shortcuts.segStart': '设置分段起点',
      'shortcuts.segEnd': '设置分段终点',
      'shortcuts.newSegment': '新建分段',
      'misc.loading': '正在加载…',
      'misc.none': '无',
      'misc.unknown': '未知',
      'misc.untitled': '未命名',
      'misc.notice': '提示',
      'misc.copyFailed': '复制失败，请手动复制',
      'misc.itemCount': '{n} 条',
      'misc.noData': '暂无数据',
      'misc.seconds': '{n} 秒',
      'misc.search': '搜索',
      'actions.validate': '校验项目',
      'actions.download': '下载',
      'actions.saveChanges': '保存修改',
      'export.title': '导出数据',
      'export.format': '导出格式',
      'export.scope': '导出范围',
      'export.scope.approved': '仅已通过（缺省回退到已提交）',
      'export.scope.submitted': '所有已提交',
      'export.scope.all': '全部（含草稿与跳过）',
      'export.currentItem': '只导出当前条目',
      'export.run': '开始导出',
      'export.running': '正在导出…',
      'export.result': '导出结果',
      'export.files': '生成的文件',
      'export.empty': '没有生成任何文件',
      'export.hint': 'JSONL / CSV / COCO / 报表按范围导出；SRT / VTT 可只导当前条目，也可导出全部分段字幕。',
      'export.failed': '导出失败：{message}',
      'export.itemOnlyHint': 'SRT / VTT 只导当前条目时需要先选中一条数据。',
      'export.openHint': '点文件名直接下载；文件保存在项目的 exports 目录。',
      'project.settings': '项目设置',
      'project.deleteTitle': '删除项目',
      'project.deleteWarning': '将删除「{name}」及其全部条目、标注、复核、媒体和导出。请先确认项目名。',
      'project.deleteTrash': '移到回收站（可恢复）',
      'project.deleteTrashHint': '项目目录会移到 dataRoot/.trash，可手动移回恢复。',
      'project.deletePurge': '彻底删除（不可恢复）',
      'project.deletePurgeHint': '直接删除项目目录，无法恢复；建议先备份。',
      'project.deletePurgeConfirm': '我确认彻底删除，无法恢复',
      'project.deleteConfirmLabel': '输入项目名确认',
      'project.deleteConfirmPlaceholder': '请输入：{name}',
      'project.deleteMismatch': '项目名不匹配',
      'project.deleteFailed': '删除失败',
      'project.deleteDanger': '危险操作',
      'project.deleteDangerHint': '删除后项目会从列表消失；建议先备份。',
      'project.deleteProject': '删除项目',
      'project.deleteButton': '确认删除',
      'project.deleted': '项目已删除',
      'project.trashed': '项目已移到回收站',
      'project.tab.basic': '基本信息',
      'project.tab.guideline': '标注规范',
      'project.tab.schema': '字段 Schema',
      'project.tab.validate': '校验',
      'project.nameSaved': '项目信息已保存',
      'project.guidelineSaved': '标注规范已保存',
      'project.schemaSaved': '字段 Schema 已保存',
      'project.schemaInvalid': 'Schema 不是合法 JSON',
      'project.loadFailed': '加载失败：{message}',
      'project.guidelinePlaceholder': '支持 Markdown；这里的内容会展示给标注员。',
      'project.schemaPlaceholder': '字段定义 JSON，例如 {"fields":[{"id":"label","label":"标签","type":"text"}]}',
      'project.revision': '修订版本 {n}',
      'project.currentRevision': '当前修订：{n}',
      'validate.title': '项目校验',
      'validate.run': '校验项目',
      'validate.running': '正在校验…',
      'validate.ok': '校验通过（检查 {checked} 条）',
      'validate.bad': '发现 {n} 条错误',
      'validate.errors': '错误',
      'validate.warnings': '警告',
      'validate.issues': '{n} 条问题',
      'validate.none': '没有发现问题',
      'validate.failed': '校验请求失败：{message}',
    };

    const EN = {
      'panel.title': 'Annotation Workbench',
      'brand.name': 'Annotation Desk',
      'mode.annotate': 'Annotate',
      'mode.review': 'Review',
      'mode.stats': 'Stats',
      'status.unlabeled': 'Unlabeled',
      'status.none': 'Unlabeled',
      'status.in_progress': 'In progress',
      'status.submitted': 'Submitted',
      'status.approved': 'Approved',
      'status.rejected': 'Rejected',
      'status.flagged': 'Flagged',
      'status.skipped': 'Skipped',
      'status.draft': 'Draft',
      'kind.text': 'Text',
      'kind.image': 'Image',
      'kind.video': 'Video',
      'kind.audio': 'Audio',
      'kind.llm': 'LLM',
      'kind.document': 'Document',
      'actions.save': 'Save draft',
      'actions.submit': 'Submit',
      'actions.skip': 'Skip',
      'actions.flag': 'Flag',
      'actions.next': 'Next',
      'actions.prev': 'Previous',
      'actions.refresh': 'Refresh',
      'actions.close': 'Close',
      'actions.cancel': 'Cancel',
      'actions.confirm': 'Confirm',
      'actions.create': 'Create',
      'actions.import': 'Import',
      'actions.export': 'Export',
      'actions.delete': 'Delete',
      'actions.add': 'Add',
      'actions.back': 'Back',
      'actions.view': 'Open',
      'actions.demo': 'Demo data',
      'actions.copy': 'Copy',
      'actions.retry': 'Retry',
      'actions.settings': 'Settings',
      'actions.help': 'Shortcuts',
      'actions.browse': 'Browse',
      'actions.preview': 'Preview',
      'actions.apply': 'Adopt',
      'actions.approve': 'Approve',
      'actions.reject': 'Reject',
      'actions.parse': 'Parse',
      'actions.replace': 'Replace',
      'actions.append': 'Append',
      'actions.split': 'Split',
      'actions.merge': 'Merge',
      'actions.setStart': 'Set start',
      'actions.setEnd': 'Set end',
      'actions.jump': 'Jump',
      'search.placeholder': 'Search item text or id',
      'filter.all': 'All',
      'filter.todo': 'To do',
      'filter.mine': 'Mine',
      'filter.review': 'To review',
      'filter.approved': 'Approved',
      'filter.rejected': 'Rejected',
      'filter.flagged': 'Flagged',
      'progress.label': 'Progress',
      'progress.value': 'Submitted {done}/{total}',
      'actor.label': 'Annotator',
      'actor.anonymous': 'Unnamed',
      'onboarding.title': 'Welcome to the Annotation Workbench',
      'onboarding.actorTitle': 'Give yourself a name first',
      'onboarding.actorHint': 'The name is written into every label event so reviewers know who did what.',
      'onboarding.actorPlaceholder': 'e.g. Alice',
      'onboarding.actorRequired': 'Please enter a name',
      'onboarding.saved': 'Saved',
      'onboarding.projectsTitle': 'Projects',
      'onboarding.projectsEmpty': 'No projects yet. Create one or import data.',
      'onboarding.newProject': 'New project',
      'onboarding.importProject': 'Import data',
      'onboarding.openProject': 'Open project',
      'onboarding.backToList': 'Back to projects',
      'onboarding.createFirst': 'Create your first project',
      'onboarding.loading': 'Loading projects…',
      'project.newTitle': 'New project',
      'project.template': 'Choose a template',
      'project.templateHint': 'The template seeds default fields and editors; fields can change later.',
      'project.name': 'Project name',
      'project.namePlaceholder': 'e.g. Video captions batch A',
      'project.description': 'Description',
      'project.demo': 'Also write demo items',
      'project.creating': 'Creating…',
      'project.importTitle': 'Import data',
      'project.importHint': 'Supports JSONL / JSON / CSV / TSV / SRT / VTT files and folders.',
      'project.source': 'Source path',
      'project.sourcePlaceholder': 'Absolute path, e.g. D:/data/batch1',
      'project.format': 'Format',
      'project.format.auto': 'Auto detect',
      'project.copyMedia': 'Copy media into the project folder',
      'project.mapping': 'Field mapping',
      'project.mappingHint': 'Map source columns to item fields; adjust when auto detection is wrong.',
      'project.mapping.id': 'id column',
      'project.mapping.text': 'text column',
      'project.mapping.media': 'media column',
      'project.mapping.messages': 'messages column',
      'project.preview': 'Preview',
      'project.importRun': 'Start import',
      'project.importing': 'Importing…',
      'project.imported': 'Imported {imported}, skipped {skipped}, warnings {warnings}',
      'project.columns': 'Detected columns',
      'project.sample': 'Sample',
      'project.warnings': 'Warnings',
      'project.noColumns': 'No mappable columns detected',
      'project.previewFirst': 'Preview first to confirm the mapping',
      'project.sourceRequired': 'Enter a source path',
      'project.browseTitle': 'Pick a data file or folder',
      'project.browseUp': 'Up',
      'project.browseEmpty': 'This folder is empty',
      'project.browseTruncated': 'Too many entries; showing the first 500',
      'queue.title': 'Task queue',
      'queue.empty': 'The queue is empty',
      'queue.count': '{n} items',
      'queue.loading': 'Loading…',
      'queue.end': 'No more items',
      'queue.pick': 'Pick an item on the left to start annotating',
      'queue.loadMore': 'Load more',
      'form.title': 'Labels',
      'form.empty': 'Pick an item first',
      'form.required': 'Required',
      'form.help': 'Help',
      'form.jsonInvalid': 'Invalid JSON',
      'form.saved': 'Draft saved',
      'form.submitted': 'Submitted',
      'form.skipped': 'Skipped',
      'form.flagged': 'Flagged',
      'form.saving': 'Saving…',
      'form.submitFirst': 'Fix the form errors first',
      'form.autosaved': 'Autosaved',
      'form.autosaveOff': 'Autosave is off',
      'form.fieldRequired': '{label} is required',
      'form.fieldRange': '{label} must be between {min} and {max}',
      'form.placeholder': 'Enter a value…',
      'form.tagsPlaceholder': 'Type and press Enter to add',
      'form.addTag': 'Add',
      'form.ratingValue': '{n}',
      'form.segmentsHint': 'Edit the timeline in the segment table under the player.',
      'form.segmentsCount': '{n} segments',
      'form.bboxHint': 'Drag on the image to draw boxes; edit label and text after selecting one.',
      'form.spansHint': 'Select text in the source, click Add span, then adjust its label here.',
      'form.noFields': 'This project has no field definitions yet.',
      'viewer.textEmpty': 'This item has no text content',
      'viewer.imageEmpty': 'This item has no usable image',
      'viewer.mediaMissing': 'The media file is unavailable',
      'viewer.llmEmpty': 'This item has no conversation content',
      'viewer.messages': 'Messages',
      'viewer.candidate': 'Candidate {id}',
      'viewer.meta': 'Metadata',
      'viewer.caption': 'Captions',
      'viewer.addBoxHint': 'Drag to draw a box; select one to move, resize or delete it',
      'viewer.boxLabel': 'Box label',
      'viewer.boxText': 'Box text',
      'viewer.boxDelete': 'Delete selected box',
      'viewer.boxCount': '{n} boxes',
      'viewer.addSpan': 'Add span',
      'viewer.spanLabel': 'Span label',
      'viewer.selectFirst': 'Select some text in the source first',
      'viewer.spansCount': '{n} spans',
      'media.segments': 'Segments',
      'media.addSegment': 'Add segment',
      'media.deleteSegment': 'Delete segment',
      'media.splitSegment': 'Split at playhead',
      'media.mergeSegment': 'Merge with next',
      'media.empty': 'No segments yet. Press n to add one, or import subtitle text.',
      'media.importSubs': 'Import subtitle text',
      'media.importSubsHint': 'Paste SRT or VTT text and parse it into timeline segments.',
      'media.replaceSegments': 'Replace segments',
      'media.subsEmpty': 'No segments parsed',
      'media.subsParsed': 'Parsed {n} segments',
      'media.start': 'Start',
      'media.end': 'End',
      'media.text': 'Text',
      'media.label': 'Label',
      'media.duration': 'Duration',
      'media.noMedia': 'This item has no playable media file.',
      'media.unsupported': 'This browser cannot play the media format.',
      'review.title': 'Review',
      'review.compare': 'Annotator comparison',
      'review.actor': 'Annotator',
      'review.final': 'Final labels',
      'review.needFinal': 'Fill in the final labels first',
      'review.noAnnotations': 'No annotator has submitted yet.',
      'review.different': 'Differs',
      'review.same': 'Same',
      'review.decision': 'Decision',
      'review.comment': 'Review comment',
      'review.commentPlaceholder': 'Explain a rejection, or add a note when approving…',
      'review.next': 'Next review',
      'review.completed': 'Review saved',
      'review.noItem': 'Pick an item to review on the left',
      'review.history': 'Review history',
      'review.needComment': 'Explain why you reject this item',
      'review.adoptHint': 'Click Adopt to copy one annotator’s labels into the final labels.',
      'review.pending': 'Pending',
      'review.approved': 'Approved',
      'review.rejected': 'Rejected',
      'review.approve': 'Approve',
      'review.reject': 'Reject',
      'stats.title': 'Stats',
      'stats.total': 'Total items',
      'stats.unlabeled': 'Unlabeled',
      'stats.in_progress': 'In progress',
      'stats.submitted': 'Submitted',
      'stats.approved': 'Approved',
      'stats.rejected': 'Rejected',
      'stats.flagged': 'Flagged',
      'stats.reviewBacklog': 'Review backlog',
      'stats.actorProgress': 'Annotator progress',
      'stats.today': 'Submitted today',
      'stats.labelDistribution': 'Label distribution',
      'stats.agreement': 'Agreement',
      'stats.overall': 'Overall agreement',
      'stats.field': 'Field',
      'stats.type': 'Type',
      'stats.pairs': 'Pairs',
      'stats.score': 'Score',
      'stats.recent': 'Recent activity',
      'stats.noActors': 'No label events yet.',
      'stats.noAgreement': 'No comparable historical annotations yet.',
      'stats.noRecent': 'Nothing recent.',
      'stats.noDistribution': 'No label distribution yet.',
      'stats.loading': 'Loading stats…',
      'stats.gold': 'Gold',
      'settings.title': 'Annotation Workbench Settings',
      'settings.nav': 'Annotation Workbench',
      'settings.actor': 'Annotator name',
      'settings.actorHint': 'One identity per device; written into label events.',
      'settings.dataRoot': 'Data root',
      'settings.dataRootHint': 'Projects stay in this local folder; nothing is uploaded or shared.',
      'settings.openOnStart': 'Open the workbench on page load',
      'settings.autosave': 'Autosave drafts',
      'settings.autosaveHint': 'Save as a draft 1.5 seconds after typing stops.',
      'settings.refresh': 'Refresh projects',
      'settings.copyPath': 'Copy data path',
      'settings.copied': 'Data path copied',
      'settings.version': 'Version',
      'settings.go': 'Go to workbench',
      'settings.save': 'Save settings',
      'settings.saved': 'Settings saved',
      'settings.pickDirectory': 'Choose folder',
      'settings.pickFailed': 'The directory picker is unavailable; type the path instead',
      'settings.deviceFailed': 'Could not read device settings',
      'settings.saveFailed': 'Could not save: {message}',
      'header.project': 'Project',
      'header.ai': 'Ask AI',
      'header.copyPrompt': 'Copy task prompt',
      'header.settings': 'Settings',
      'header.shortcuts': 'Shortcuts',
      'header.progress': 'Submitted {done}/{total}',
      'header.noProject': 'No project selected',
      'prompt.intro': 'Annotation task prompt',
      'prompt.project': 'Project: {name} ({id})',
      'prompt.item': 'Current item: {id}',
      'prompt.mode': 'Mode: {mode}',
      'prompt.body': 'Read the project guideline and schema first, then process the current item: produce draft pre-labels (status=draft, do not submit), justify each field, and report out-of-range timecodes, labels outside the options, or missing required fields before writing.',
      'prompt.copied': 'Task prompt copied',
      'toast.close': 'Close',
      'toast.unauthorized': 'Your session expired. Reload the page or reopen the workbench.',
      'toast.error': 'Request failed: {message}',
      'toast.network': 'Network error. Check that the DSH service is running.',
      'toast.openWorkbench': 'Open workbench',
      'shortcuts.title': 'Keyboard shortcuts',
      'shortcuts.next': 'Next item',
      'shortcuts.prev': 'Previous item',
      'shortcuts.save': 'Save draft',
      'shortcuts.submit': 'Submit',
      'shortcuts.skip': 'Skip',
      'shortcuts.flag': 'Flag',
      'shortcuts.help': 'Show shortcuts',
      'shortcuts.escape': 'Close dialog',
      'shortcuts.play': 'Play / pause',
      'shortcuts.segStart': 'Set segment start',
      'shortcuts.segEnd': 'Set segment end',
      'shortcuts.newSegment': 'New segment',
      'misc.loading': 'Loading…',
      'misc.none': 'None',
      'misc.unknown': 'Unknown',
      'misc.untitled': 'Untitled',
      'misc.notice': 'Notice',
      'misc.copyFailed': 'Copy failed; copy manually',
      'misc.itemCount': '{n} items',
      'misc.noData': 'No data',
      'misc.seconds': '{n} s',
      'misc.search': 'Search',
      'actions.validate': 'Validate project',
      'actions.download': 'Download',
      'actions.saveChanges': 'Save changes',
      'export.title': 'Export data',
      'export.format': 'Format',
      'export.scope': 'Scope',
      'export.scope.approved': 'Approved only (falls back to submitted)',
      'export.scope.submitted': 'Everything submitted',
      'export.scope.all': 'Everything (incl. drafts and skips)',
      'export.currentItem': 'Current item only',
      'export.run': 'Export',
      'export.running': 'Exporting…',
      'export.result': 'Export result',
      'export.files': 'Generated files',
      'export.empty': 'No files were generated',
      'export.hint': 'JSONL / CSV / COCO / report follow the scope; SRT / VTT can export one item or all subtitle segments.',
      'export.failed': 'Export failed: {message}',
      'export.itemOnlyHint': 'SRT / VTT with the current item needs a selected item.',
      'export.openHint': 'Click a file name to download it; files live in the project exports folder.',
      'project.settings': 'Project settings',
      'project.deleteTitle': 'Delete project',
      'project.deleteWarning': 'This deletes "{name}" and all of its items, labels, reviews, media and exports. Confirm the project name first.',
      'project.deleteTrash': 'Move to trash (recoverable)',
      'project.deleteTrashHint': 'The project folder moves under dataRoot/.trash and can be moved back manually.',
      'project.deletePurge': 'Delete permanently (irreversible)',
      'project.deletePurgeHint': 'Removes the project folder; this cannot be undone. Back it up first.',
      'project.deletePurgeConfirm': 'I understand this is permanent and cannot be recovered',
      'project.deleteConfirmLabel': 'Type the project name to confirm',
      'project.deleteConfirmPlaceholder': 'Type: {name}',
      'project.deleteMismatch': 'Project name does not match',
      'project.deleteFailed': 'Delete failed',
      'project.deleteDanger': 'Danger zone',
      'project.deleteDangerHint': 'The project disappears from the list; back it up first.',
      'project.deleteProject': 'Delete project',
      'project.deleteButton': 'Delete permanently',
      'project.deleted': 'Project deleted',
      'project.trashed': 'Project moved to trash',
      'project.tab.basic': 'Basics',
      'project.tab.guideline': 'Guideline',
      'project.tab.schema': 'Field schema',
      'project.tab.validate': 'Validate',
      'project.nameSaved': 'Project details saved',
      'project.guidelineSaved': 'Guideline saved',
      'project.schemaSaved': 'Field schema saved',
      'project.schemaInvalid': 'Schema is not valid JSON',
      'project.loadFailed': 'Could not load: {message}',
      'project.guidelinePlaceholder': 'Markdown is fine; annotators read this text.',
      'project.schemaPlaceholder': 'Field definition JSON, e.g. {"fields":[{"id":"label","label":"Label","type":"text"}]}',
      'project.revision': 'Revision {n}',
      'project.currentRevision': 'Current revision: {n}',
      'validate.title': 'Project validation',
      'validate.run': 'Validate project',
      'validate.running': 'Validating…',
      'validate.ok': 'Validation passed ({checked} checked)',
      'validate.bad': '{n} errors found',
      'validate.errors': 'Errors',
      'validate.warnings': 'Warnings',
      'validate.issues': '{n} issues',
      'validate.none': 'No issues found',
      'validate.failed': 'Validation request failed: {message}',
    };

    /* ===================================================================== *
     * 2. Generic helpers
     * ===================================================================== */

    /** Set by apply(); holds the client services and the bound translator. */
    let CORE = null;

    /**
     * Translate one dictionary key, interpolating `{name}` placeholders.
     * @param {string} key dictionary key
     * @param {Record<string, unknown>} [vars] placeholders
     * @returns {string}
     */
    function t(key, vars) {
      let text;
      try {
        text = CORE && CORE.t ? CORE.t(key) : undefined;
      } catch (error) {
        text = undefined;
      }
      if (typeof text !== 'string' || text === key) {
        text = ZH[key] !== undefined ? ZH[key] : EN[key] !== undefined ? EN[key] : key;
      }
      if (vars) {
        text = text.replace(/\{(\w+)\}/g, (match, name) => (
          vars[name] === undefined || vars[name] === null ? match : String(vars[name])
        ));
      }
      return text;
    }

    /** Safe number coercion. */
    function num(value, fallback = 0) {
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    /** Clamp a number into a range. */
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    /** True for plain objects. */
    function isObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /** Join truthy class names. */
    function cn(...parts) {
      return parts.filter(Boolean).join(' ');
    }

    /** Deep equality for JSON-ish label values. */
    function deepEqual(a, b) {
      if (a === b) return true;
      if (typeof a !== typeof b) return false;
      if (a === null || b === null) return false;
      if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
        return true;
      }
      if (typeof a === 'object') {
        if (!isObject(a) || !isObject(b)) return false;
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        for (const key of aKeys) if (!deepEqual(a[key], b[key])) return false;
        return true;
      }
      return false;
    }

    /** Copy a JSON-ish value. */
    function clone(value) {
      if (value === undefined) return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (error) {
        return value;
      }
    }

    /** True when a value should be treated as empty. */
    function isEmptyValue(value) {
      if (value === undefined || value === null || value === '') return true;
      if (Array.isArray(value)) return value.length === 0;
      if (isObject(value)) return Object.keys(value).length === 0;
      return false;
    }

    /** Human text for a label value. */
    function formatValue(field, value) {
      if (isEmptyValue(value)) return t('misc.none');
      if (field && field.type === 'segments' && Array.isArray(value)) {
        return value.map((segment) => `${formatTimecode(num(segment && segment.start))}–${formatTimecode(num(segment && segment.end))} ${String((segment && segment.text) || '')}`.trim()).join('\n');
      }
      if (field && field.type === 'bbox' && Array.isArray(value)) {
        return value.map((box) => `${String((box && box.label) || '?')} (${num(box && box.x).toFixed(2)}, ${num(box && box.y).toFixed(2)}, ${num(box && box.w).toFixed(2)}, ${num(box && box.h).toFixed(2)})`).join('\n');
      }
      if (field && field.type === 'spans' && Array.isArray(value)) {
        return value.map((span) => `${String((span && span.label) || '?')}: ${String((span && span.text) || '')}`).join('\n');
      }
      if (Array.isArray(value)) return value.join(' / ');
      if (isObject(value)) {
        try {
          return JSON.stringify(value);
        } catch (error) {
          return String(value);
        }
      }
      if (typeof value === 'boolean') return value ? '✓' : '✗';
      return String(value);
    }

    /** mm:ss.S timecode for editors. */
    function formatTimecode(seconds) {
      const total = Math.max(0, num(seconds));
      const minutes = Math.floor(total / 60);
      const rest = total - minutes * 60;
      return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
    }

    /** Parse `hh:mm:ss,mmm`, `mm:ss.mmm` or plain seconds. */
    function parseTimecode(text) {
      const raw = String(text === undefined || text === null ? '' : text).trim();
      if (raw === '') return 0;
      if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
      const match = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
      if (!match) return 0;
      const hours = num(match[1], 0);
      const minutes = num(match[2], 0);
      const seconds = num(match[3], 0);
      const millis = num(`${match[4] || '0'}`.padEnd(3, '0').slice(0, 3), 0);
      return hours * 3600 + minutes * 60 + seconds + millis / 1000;
    }

    /** Parse SRT/VTT text into `{start,end,text}` segments. */
    function parseSubtitles(text) {
      const source = String(text || '').replace(/\r\n?/g, '\n');
      const blocks = source.split(/\n{2,}/);
      const segments = [];
      for (const block of blocks) {
        const lines = block.split('\n').filter((line) => line.trim() !== '');
        if (lines.length === 0) continue;
        if (/^WEBVTT/i.test(lines[0])) continue;
        let index = 0;
        if (/^\d+$/.test(lines[0].trim())) index = 1;
        const timing = lines[index] || '';
        const match = timing.match(/(\d+(?::\d{1,2}){1,2}[.,]\d{1,3})\s*-->\s*(\d+(?::\d{1,2}){1,2}[.,]\d{1,3})/);
        if (!match) continue;
        const body = lines.slice(index + 1).join('\n').trim();
        segments.push({ start: parseTimecode(match[1]), end: parseTimecode(match[2]), text: body });
      }
      return segments;
    }

    /** Format segments as SRT-ish text (useful for the export hint). */
    function formatSubtitles(segments) {
      return (segments || []).map((segment, index) => {
        const start = formatTimecode(num(segment.start)).replace('.', ',');
        const end = formatTimecode(num(segment.end)).replace('.', ',');
        return `${index + 1}\n${start} --> ${end}\n${String(segment.text || '')}`;
      }).join('\n\n');
    }

    /** ISO timestamp to short relative/absolute text. */
    function formatStamp(iso) {
      if (!iso) return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return String(iso);
      const now = Date.now();
      const diff = now - date.getTime();
      if (diff >= 0 && diff < 60 * 1000) return '刚刚';
      if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
      if (diff >= 0 && diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    /** Clock text (HH:MM) used for timestamps. */
    function formatClock(iso) {
      if (!iso) return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return String(iso);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    /** Human file size. */
    function bytesText(bytes) {
      const value = num(bytes, 0);
      if (value < 1024) return `${Math.round(value)} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    /** Download URL for one export file (`downloadPath` first, else built from `urlPath`). */
    function downloadHref(projectId, file) {
      if (!file) return '';
      if (typeof file.downloadPath === 'string' && file.downloadPath !== '') return file.downloadPath;
      if (typeof file.urlPath === 'string' && file.urlPath !== '') {
        return `${API_BASE}/projects/${enc(projectId)}/download?path=${encodeURIComponent(file.urlPath)}`;
      }
      return '';
    }

    /** One readable line for a validation error/warning. */
    function issueText(issue) {
      if (issue === null || issue === undefined) return '';
      if (typeof issue === 'string') return issue;
      if (typeof issue !== 'object') return String(issue);
      const parts = [issue.itemId, issue.field, issue.path, issue.message || issue.msg || issue.code]
        .filter((part) => part !== undefined && part !== null && part !== '')
        .map((part) => String(part));
      if (parts.length > 0) return parts.join(' · ');
      try {
        return JSON.stringify(issue);
      } catch (error) {
        return String(issue);
      }
    }

    /** Normalize a validate response list (array or `{items}`). */
    function issueList(value) {
      if (Array.isArray(value)) return value;
      if (value && isObject(value) && Array.isArray(value.items)) return value.items;
      return [];
    }

    /** Read a theme token from the document, preferring the CSS variable. */
    function tokenColor(name, element, fallbackProperty) {
      try {
        const fromBody = getComputedStyle(document.body).getPropertyValue(name).trim();
        if (fromBody) return fromBody;
      } catch (error) { /* ignore */ }
      try {
        if (element) return getComputedStyle(element)[fallbackProperty || 'color'] || 'currentColor';
      } catch (error) { /* ignore */ }
      return 'currentColor';
    }

    /** Copy text with a safe fallback. */
    async function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (error) { /* fall through */ }
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok;
      } catch (error) {
        return false;
      }
    }

    /* ===================================================================== *
     * 3. Brand artwork (literal colors are allowed for artwork only)
     * ===================================================================== */

    const BRAND_BLUE = '#2f6fb2';
    const BRAND_DARK = '#1d3f66';
    const BRAND_AMBER = '#e8a33d';
    const BRAND_PAPER = '#f4f1ea';

    /** Sidebar brand mark: a tag with a pen nib (original 64x64 artwork). */
    function BrandMark(props) {
      const size = num(props && props.size, 24) || 24;
      return h('svg', {
        viewBox: '0 0 64 64',
        width: size,
        height: size,
        role: 'img',
        'aria-hidden': 'true',
        style: { display: 'block', flex: 'none' },
      },
      h('rect', { x: 4, y: 4, width: 56, height: 56, rx: 14, fill: BRAND_BLUE }),
      h('path', { d: 'M19 17h20l12 12v6l-9 9H19V17z', fill: BRAND_PAPER, opacity: 0.94 }),
      h('path', { d: 'M39 17l12 12h-9a3 3 0 0 1-3-3v-9z', fill: '#cfe0f2' }),
      h('circle', { cx: 30.5, cy: 32.5, r: 4.4, fill: 'none', stroke: BRAND_DARK, 'stroke-width': 2.4 }),
      h('path', { d: 'M33.5 34l11-11 4.2 4.2-11 11-5.2 2z', fill: BRAND_AMBER }),
      h('path', { d: 'M29 48l9-9', stroke: BRAND_DARK, 'stroke-width': 2.6, 'stroke-linecap': 'round' }),
      h('path', { d: 'M24 48l-3.5 3.5', stroke: BRAND_AMBER, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    }

    /** Sidebar brand name (visible text in the host's brand row). */
    function BrandName() {
      return h('span', { style: { fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap' } }, t('brand.name'));
    }

    /** Sidebar panel icon for the workbench entry. */
    function PanelIcon(props) {
      const size = num(props && props.size, 16) || 16;
      return h('svg', {
        viewBox: '0 0 20 20',
        width: size,
        height: size,
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
      h('path', { d: 'M3 5.2A2.2 2.2 0 0 1 5.2 3h9.6A2.2 2.2 0 0 1 17 5.2v5.1' }),
      h('path', { d: 'M7 7.4h6M7 10.2h4.2' }),
      h('path', { d: 'M12.4 16.7l.7-2.7 4.2-4.2a1.4 1.4 0 0 0-2-2l-4.2 4.2-2.7.7.7-2.7' }),
      h('path', { d: 'M3 5.2v9.6A2.2 2.2 0 0 0 5.2 17h5.6' }));
    }

    /* ===================================================================== *
     * 4. Styles (theme alias tokens only; prefixed with aw-)
     * ===================================================================== */

    const CSS_TEXT = `
.aw-root{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;position:relative;overflow:hidden}
.aw-root *,.aw-root *::before,.aw-root *::after{box-sizing:border-box}
.aw-root button,.aw-root input,.aw-root select,.aw-root textarea{font:inherit;color:inherit}
.aw-root button{cursor:pointer}
.aw-root :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.aw-mono{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px}
.aw-muted{color:var(--dsw-alias-label-secondary)}
.aw-dim{color:var(--dsw-alias-label-tertiary)}
.aw-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aw-row{display:flex;align-items:center;gap:8px;min-width:0}
.aw-col{display:flex;flex-direction:column;min-height:0}
.aw-grow{flex:1 1 auto;min-width:0;min-height:0}
.aw-wrap{flex-wrap:wrap}
.aw-center{display:flex;align-items:center;justify-content:center}
.aw-scroll{overflow:auto;min-height:0;scrollbar-width:thin}
.aw-topbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:0.5px solid var(--dsw-alias-border-l2);flex:none;flex-wrap:wrap;background:var(--dsw-alias-bg-module-platform);z-index:5}
.aw-logo{display:flex;align-items:center;gap:7px;font-weight:600;font-size:14px;white-space:nowrap}
.aw-sep{width:0.5px;height:20px;background:var(--dsw-alias-border-l2);flex:none;margin:0 2px}
.aw-spacer{flex:1 1 auto;min-width:4px}
.aw-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;padding:0 10px;border-radius:7px;border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);white-space:nowrap;font-size:12px}
.aw-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.aw-btn:disabled{opacity:0.5;cursor:not-allowed}
.aw-btn-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.aw-btn-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.aw-btn-primary{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);color:var(--dsw-alias-state-business-primary)}
.aw-btn-success{border-color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}
.aw-btn-danger{border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.aw-btn-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.aw-btn-icon{width:28px;padding:0;flex:none}
.aw-btn-lg{height:32px;padding:0 14px;font-size:13px}
.aw-seg{display:inline-flex;padding:2px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);gap:2px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent)}
.aw-seg-btn{height:24px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px}
.aw-seg-btn.aw-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600}
.aw-select,.aw-input,.aw-textarea{border:0.5px solid var(--dsw-alias-border-l3);border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 2%,transparent);padding:5px 8px;min-width:0;color:var(--dsw-alias-label-primary)}
.aw-select{height:28px;padding:0 6px;max-width:100%}
.aw-input{height:28px;width:100%}
.aw-textarea{width:100%;min-height:64px;resize:vertical;line-height:1.6}
.aw-input::placeholder,.aw-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.aw-input:focus,.aw-textarea:focus,.aw-select:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}
.aw-search{width:190px;max-width:38vw}
.aw-main{display:flex;flex:1 1 auto;min-height:0;min-width:0}
.aw-pane{display:flex;flex-direction:column;min-height:0;min-width:0}
.aw-queue{width:280px;flex:none;border-right:0.5px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-label-primary) 2%,transparent)}
.aw-viewer{flex:1 1 auto;min-width:0;overflow:auto;background:var(--dsw-alias-bg-module-platform)}
.aw-form{width:360px;flex:none;border-left:0.5px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-label-primary) 2%,transparent)}
.aw-pane-head{display:flex;align-items:center;gap:6px;padding:9px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l2);flex:none;min-height:40px}
.aw-pane-title{font-size:12px;font-weight:600;letter-spacing:0.02em;color:var(--dsw-alias-label-secondary);text-transform:none}
.aw-chips{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l1);flex:none}
.aw-chip{height:22px;padding:0 8px;border-radius:11px;border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px}
.aw-chip.aw-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);font-weight:600}
.aw-queue-list{flex:1 1 auto;overflow:auto;min-height:0;scrollbar-width:thin}
.aw-queue-row{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;padding:8px 10px;border:0;border-bottom:0.5px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;position:relative}
.aw-queue-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.aw-queue-row.aw-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 11%,transparent)}
.aw-queue-row.aw-on::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--dsw-alias-state-business-primary)}
.aw-queue-row-top{display:flex;align-items:center;gap:6px;min-width:0}
.aw-queue-id{font-weight:600;font-size:12px}
.aw-queue-preview{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.45;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.aw-queue-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:10px;color:var(--dsw-alias-label-tertiary)}
.aw-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none;display:inline-block}
.aw-dot-unlabeled{background:var(--dsw-alias-label-tertiary)}
.aw-dot-in_progress{background:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary))}
.aw-dot-submitted{background:var(--dsw-alias-state-business-primary)}
.aw-dot-approved{background:var(--dsw-alias-state-success-primary)}
.aw-dot-rejected{background:var(--dsw-alias-state-error-primary)}
.aw-dot-flagged{background:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-error-primary))}
.aw-dot-skipped{background:var(--dsw-alias-border-l4)}
.aw-tag{display:inline-flex;align-items:center;gap:3px;height:17px;padding:0 5px;border-radius:4px;font-size:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.aw-tag-tone{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.aw-tag-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}
.aw-tag-bad{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.aw-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;min-height:120px;color:var(--dsw-alias-label-tertiary);padding:24px;text-align:center}
.aw-empty-title{color:var(--dsw-alias-label-secondary);font-size:13px}
.aw-viewer-inner{padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-height:100%}
.aw-viewer-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.aw-item-title{font-size:14px;font-weight:600}
.aw-text-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;font-size:14px;padding:12px 14px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 2%,transparent);user-select:text}
.aw-text-body::selection{background:var(--dsw-alias-bg-document-selection,color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,transparent))}
.aw-image-stage{position:relative;display:inline-block;max-width:100%;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);line-height:0;touch-action:none}
.aw-image-stage img{display:block;max-width:100%;max-height:62vh;user-select:none;-webkit-user-drag:none}
.aw-image-canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none}
.aw-box-controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px}
.aw-field-list{display:flex;flex-direction:column;gap:2px}
.aw-media-player{width:100%;max-height:52vh;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);outline:none}
.aw-video-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px}
.aw-caption-overlay{position:absolute;left:50%;bottom:38px;transform:translateX(-50%);max-width:90%;padding:4px 10px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 72%,transparent);color:var(--dsw-alias-bg-module-platform);font-size:14px;line-height:1.5;text-align:center;pointer-events:none;white-space:pre-wrap}
.aw-seg-table{width:100%;border-collapse:collapse;font-size:12px}
.aw-seg-table th{position:sticky;top:0;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-weight:500;text-align:left;padding:5px 6px;border-bottom:0.5px solid var(--dsw-alias-border-l2);z-index:1;font-size:11px}
.aw-seg-table td{padding:3px 4px;border-bottom:0.5px solid var(--dsw-alias-border-l1);vertical-align:middle}
.aw-seg-row{cursor:pointer}
.aw-seg-row.aw-on td{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.aw-seg-row:hover td{background:var(--dsw-alias-interactive-bg-hover)}
.aw-seg-time{width:86px}
.aw-seg-time .aw-input{height:24px;font-size:11px;padding:0 5px}
.aw-seg-text .aw-input{height:24px;font-size:12px;padding:0 6px}
.aw-seg-label{width:104px}
.aw-seg-label .aw-select{height:24px;font-size:11px;padding:0 4px}
.aw-seg-toolbar{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
.aw-seg-actions{display:flex;gap:2px;white-space:nowrap}
.aw-mini{height:22px;padding:0 6px;font-size:11px;border-radius:5px}
.aw-form-body{padding:10px;display:flex;flex-direction:column;gap:12px;overflow:auto;min-height:0;flex:1 1 auto}
.aw-form-actions{display:flex;gap:6px;flex-wrap:wrap;padding:8px 10px;border-top:0.5px solid var(--dsw-alias-border-l2);flex:none;background:var(--dsw-alias-bg-module-platform)}
.aw-field{display:flex;flex-direction:column;gap:4px;padding-bottom:10px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
.aw-field:last-child{border-bottom:none;padding-bottom:0}
.aw-field-label{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.aw-required{color:var(--dsw-alias-state-error-primary);font-weight:600}
.aw-field-help{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.aw-field-error{font-size:11px;color:var(--dsw-alias-state-error-primary);line-height:1.5}
.aw-options{display:flex;flex-wrap:wrap;gap:5px}
.aw-option{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:6px;border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px}
.aw-option.aw-on{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);color:var(--dsw-alias-state-business-primary)}
.aw-ratings{display:flex;gap:4px}
.aw-rating{width:28px;height:28px;border-radius:6px;border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px}
.aw-rating.aw-on{border-color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary));background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary)) 16%,transparent);color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary));font-weight:700}
.aw-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;user-select:none}
.aw-switch-track{width:34px;height:20px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);position:relative;transition:background .12s ease;flex:none}
.aw-switch-track::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-module-platform);transition:transform .12s ease;box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent)}
.aw-switch.aw-on .aw-switch-track{background:var(--dsw-alias-state-business-primary)}
.aw-switch.aw-on .aw-switch-track::after{transform:translateX(14px)}
.aw-chiplist{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.aw-remove{width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}
.aw-remove:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-error-primary)}
.aw-summary{border:0.5px dashed var(--dsw-alias-border-l3);border-radius:7px;padding:7px 8px;font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:3px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 2%,transparent)}
.aw-validation{font-size:11px;color:var(--dsw-alias-state-error-primary);line-height:1.5}
.aw-form-status{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary);min-height:16px}
.aw-llm-messages{display:flex;flex-direction:column;gap:6px}
.aw-llm-msg{padding:8px 10px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent);white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
.aw-llm-role{font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--dsw-alias-label-tertiary);margin-bottom:3px}
.aw-llm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.aw-card{border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-module-platform);min-width:0}
.aw-card-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.aw-card-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.65}
.aw-meta-grid{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.aw-compare-wrap{border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:auto;max-height:340px}
.aw-compare{width:100%;border-collapse:collapse;font-size:11px}
.aw-compare th{position:sticky;top:0;background:var(--dsw-alias-bg-module-platform);text-align:left;padding:6px;border-bottom:0.5px solid var(--dsw-alias-border-l2);font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap;z-index:1}
.aw-compare td{padding:5px 6px;border-bottom:0.5px solid var(--dsw-alias-border-l1);vertical-align:top;overflow-wrap:anywhere}
.aw-compare-diff{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary)) 12%,transparent)}
.aw-compare-same{color:var(--dsw-alias-label-secondary)}
.aw-compare-field{font-weight:500;color:var(--dsw-alias-label-secondary);max-width:110px}
.aw-review-actions{display:flex;flex-direction:column;gap:8px}
.aw-onboard{flex:1 1 auto;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px}
.aw-onboard-inner{width:min(860px,100%);display:flex;flex-direction:column;gap:16px;padding:22px 24px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-module-platform);box-shadow:0 10px 30px color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.aw-onboard-head{display:flex;align-items:center;gap:10px}
.aw-onboard-title{font-size:17px;font-weight:600}
.aw-onboard-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
.aw-onboard-actor{display:flex;flex-direction:column;gap:8px;max-width:360px}
.aw-projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.aw-project{border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 2%,transparent);min-width:0}
.aw-project-name{font-size:13px;font-weight:600;overflow-wrap:anywhere}
.aw-project-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);display:flex;gap:6px;flex-wrap:wrap}
.aw-project-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.aw-templates{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;max-height:46vh;overflow:auto;padding:1px}
.aw-template{border:0.5px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px;text-align:left;background:transparent;color:inherit;display:flex;flex-direction:column;gap:4px}
.aw-template:hover{background:var(--dsw-alias-interactive-bg-hover)}
.aw-template.aw-on{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 11%,transparent)}
.aw-template-title{font-size:12px;font-weight:600}
.aw-template-desc{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.aw-modal-mask{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px 16px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 34%,transparent)}
.aw-modal{width:min(680px,100%);max-height:88vh;display:flex;flex-direction:column;border:0.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-module-platform);box-shadow:0 18px 48px color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent);overflow:hidden}
.aw-modal-wide{width:min(900px,100%)}
.aw-modal-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:0.5px solid var(--dsw-alias-border-l2);flex:none}
.aw-modal-title{font-size:14px;font-weight:600;flex:1 1 auto;min-width:0}
.aw-modal-body{padding:14px 16px;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:12px}
.aw-modal-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:0.5px solid var(--dsw-alias-border-l2);flex:none;flex-wrap:wrap}
.aw-close{width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}
.aw-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.aw-toasts{position:absolute;right:14px;bottom:14px;z-index:90;display:flex;flex-direction:column;gap:6px;align-items:flex-end;pointer-events:none;max-width:min(380px,80%)}
.aw-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-module-platform);box-shadow:0 6px 20px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);font-size:12px;overflow-wrap:anywhere;animation:aw-toast-in .14s ease}
.aw-toast-error{border-left-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.aw-toast-success{border-left-color:var(--dsw-alias-state-success-primary)}
@keyframes aw-toast-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.aw-browse{border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}
.aw-browse-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent)}
.aw-browse-path{flex:1 1 auto;min-width:0;font-size:11px;overflow-wrap:anywhere}
.aw-browse-list{max-height:220px;overflow:auto}
.aw-browse-row{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:5px 8px;border:0;border-bottom:0.5px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font-size:12px}
.aw-browse-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.aw-browse-dir{color:var(--dsw-alias-state-business-primary)}
.aw-browse-size{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-tertiary)}
.aw-split{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.aw-kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:4px;border:0.5px solid var(--dsw-alias-border-l3);background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);font-family:var(--ds-font-family-code,monospace);font-size:11px;color:var(--dsw-alias-label-secondary)}
.aw-shortcut-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:0.5px solid var(--dsw-alias-border-l1);font-size:12px}
.aw-shortcut-row:last-child{border-bottom:none}
.aw-shortcut-keys{display:flex;gap:4px;flex-wrap:wrap}
.aw-progress{height:6px;border-radius:3px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);overflow:hidden;min-width:80px;flex:1 1 auto}
.aw-progress-bar{height:100%;border-radius:3px;background:var(--dsw-alias-state-business-primary)}
.aw-progress-bar-ok{background:var(--dsw-alias-state-success-primary)}
.aw-stat-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.aw-stat-card{border:0.5px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 2%,transparent)}
.aw-stat-value{font-size:20px;font-weight:600;line-height:1.2}
.aw-stat-label{font-size:11px;color:var(--dsw-alias-label-secondary)}
.aw-stats-body{padding:14px 16px;display:flex;flex-direction:column;gap:16px;overflow:auto;min-height:0}
.aw-section{display:flex;flex-direction:column;gap:8px}
.aw-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:0.02em}
.aw-actor-row{display:grid;grid-template-columns:140px 1fr auto;gap:10px;align-items:center;font-size:12px}
.aw-bars{display:flex;flex-direction:column;gap:5px}
.aw-bar-row{display:grid;grid-template-columns:90px 1fr 34px;gap:8px;align-items:center;font-size:11px}
.aw-activity{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--dsw-alias-label-secondary);max-height:220px;overflow:auto}
.aw-activity-row{display:flex;gap:8px;align-items:baseline;padding:2px 0}
.aw-activity-time{color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-size:10px}
.aw-code-inline{padding:1px 4px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);font-family:var(--ds-font-family-code,monospace);font-size:11px;overflow-wrap:anywhere}
.aw-hr{height:0.5px;background:var(--dsw-alias-border-l1);border:0;margin:2px 0}
.aw-flag{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.aw-details{border:0.5px solid var(--dsw-alias-border-l1);border-radius:7px;padding:6px 8px}
.aw-details summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-secondary);user-select:none}
.aw-details[open] summary{margin-bottom:6px}
.aw-loading{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.aw-loading::before{content:"";width:10px;height:10px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-state-business-primary);animation:aw-spin .8s linear infinite}
@keyframes aw-spin{to{transform:rotate(360deg)}}
.aw-req{color:var(--dsw-alias-state-error-primary)}
@media (max-width:1280px){.aw-form{width:320px}.aw-queue{width:250px}}
@media (max-width:1100px){.aw-main{flex-wrap:wrap;overflow:auto}.aw-queue{width:100%;flex:none;max-height:210px;border-right:none;border-bottom:0.5px solid var(--dsw-alias-border-l2)}.aw-viewer{flex:1 1 100%;overflow:auto}.aw-form{width:100%;flex:none;border-left:none;border-top:0.5px solid var(--dsw-alias-border-l2);max-height:none}.aw-llm-grid,.aw-split{grid-template-columns:1fr}.aw-search{width:130px}}
@media (max-width:760px){.aw-topbar{gap:6px;padding:6px 8px}.aw-queue{max-height:180px}.aw-onboard{padding:10px}.aw-onboard-inner{padding:14px}.aw-stat-cards{grid-template-columns:repeat(auto-fill,minmax(104px,1fr))}.aw-search{display:none}}
`;

    /**
     * Mount the workbench CSS as a real head stylesheet. Keeping the stylesheet
     * out of the render tree avoids a class of renderer crashes and gives the
     * component an explicit cleanup path.
     */
    function StyleSheet() {
      React.useEffect(() => {
        const element = document.createElement('style');
        element.setAttribute('data-annotation-workbench', '');
        element.textContent = CSS_TEXT;
        document.head.appendChild(element);
        return () => {
          try { element.remove(); } catch (error) { /* ignore */ }
        };
      }, []);
      return null;
    }

    /* ===================================================================== *
     * 5. HTTP client for /annotation/api
     * ===================================================================== */

    /** Encode one URL path segment. */
    function enc(value) {
      return encodeURIComponent(String(value === undefined || value === null ? '' : value));
    }

    /** Build a query string, skipping empty values. */
    function qs(params) {
      const search = new URLSearchParams();
      if (params) {
        for (const key of Object.keys(params)) {
          const value = params[key];
          if (value === undefined || value === null || value === '') continue;
          search.set(key, String(value));
        }
      }
      const text = search.toString();
      return text === '' ? '' : `?${text}`;
    }

    /**
     * One JSON request against the workbench API.
     * @param {string} method HTTP method
     * @param {string} path API path below /annotation/api
     * @param {unknown} [body] JSON body
     * @returns {Promise<any>}
     */
    async function request(method, path, body) {
      const init = { method, credentials: 'same-origin', headers: {} };
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      let response;
      try {
        response = await fetch(`${API_BASE}${path}`, init);
      } catch (error) {
        const failure = new Error('network');
        failure.code = 'network';
        throw failure;
      }
      const text = await response.text().catch(() => '');
      let data = null;
      if (text !== '') {
        try {
          data = JSON.parse(text);
        } catch (error) {
          data = { raw: text };
        }
      }
      if (!response.ok) {
        const envelope = data && isObject(data.error) ? data.error : {};
        const failure = new Error(envelope.message || response.statusText || `HTTP ${response.status}`);
        failure.status = response.status;
        failure.code = envelope.code || `http_${response.status}`;
        failure.details = envelope.details;
        failure.payload = data;
        failure.unauthorized = response.status === 401 || response.status === 403;
        throw failure;
      }
      return data;
    }

    /** All endpoints the UI uses. */
    const api = {
      health: () => request('GET', '/health'),
      device: () => request('GET', '/device'),
      updateDevice: (patch) => request('PUT', '/device', patch),
      templates: () => request('GET', '/templates'),
      projects: () => request('GET', '/projects'),
      project: (projectId) => request('GET', `/projects/${enc(projectId)}`),
      createProject: (body) => request('POST', '/projects', body),
      patchProject: (projectId, body) => request('PATCH', `/projects/${enc(projectId)}`, body),
      deleteProject: (projectId, body) => request('DELETE', `/projects/${enc(projectId)}`, body),
      demo: (projectId) => request('POST', `/projects/${enc(projectId)}/demo`, {}),
      guideline: (projectId) => request('GET', `/projects/${enc(projectId)}/guideline`),
      setGuideline: (projectId, body) => request('PUT', `/projects/${enc(projectId)}/guideline`, body),
      schema: (projectId) => request('GET', `/projects/${enc(projectId)}/schema`),
      setSchema: (projectId, body) => request('PUT', `/projects/${enc(projectId)}/schema`, body),
      queue: (projectId, params) => request('GET', `/projects/${enc(projectId)}/queue${qs(params)}`),
      next: (projectId, params) => request('GET', `/projects/${enc(projectId)}/next${qs(params)}`),
      item: (projectId, itemId, actorId) => request('GET', `/projects/${enc(projectId)}/items/${enc(itemId)}${qs({ actorId })}`),
      saveLabel: (projectId, itemId, body) => request('POST', `/projects/${enc(projectId)}/items/${enc(itemId)}/label`, body),
      review: (projectId, itemId, body) => request('POST', `/projects/${enc(projectId)}/items/${enc(itemId)}/review`, body),
      stats: (projectId) => request('GET', `/projects/${enc(projectId)}/stats`),
      agreement: (projectId) => request('GET', `/projects/${enc(projectId)}/agreement`),
      activity: (projectId, limit) => request('GET', `/projects/${enc(projectId)}/activity${qs({ limit })}`),
      previewImport: (projectId, body) => request('POST', `/projects/${enc(projectId)}/import/preview`, body),
      importItems: (projectId, body) => request('POST', `/projects/${enc(projectId)}/import`, body),
      exportData: (projectId, body) => request('POST', `/projects/${enc(projectId)}/export`, body),
      browse: (path) => request('GET', `/browse${qs({ path })}`),
      validate: (projectId, body) => request('POST', `/projects/${enc(projectId)}/validate`, body || {}),
    };

    /** True when an error means the browser lost its session. */
    function isUnauthorized(error) {
      return Boolean(error && error.unauthorized);
    }

    /** Human text for a failed request. */
    function errorText(error) {
      if (!error) return 'unknown';
      if (isUnauthorized(error)) return t('toast.unauthorized');
      if (error.code === 'network') return t('toast.network');
      return error.message || String(error);
    }

    /** Show one toast through the mounted app (no-op before the app renders). */
    function toast(text, tone) {
      if (CORE && typeof CORE.toast === 'function') CORE.toast(text, tone);
    }

    /** Show the toast for a failed request. */
    function reportError(error) {
      toast(errorText(error), 'error');
    }

    /** Recent client-side failures, used to keep a crash loop from flooding the host. */
    const recentClientErrors = new Map();

    /**
     * Report a render/runtime failure to the Host so the stack survives even when
     * the slot error boundary blanks the panel. This function must never throw:
     * it is the last line of diagnostics, not a user-facing operation.
     * @param {string} kind short source label
     * @param {unknown} error thrown value
     * @param {string} [componentStack] React component stack
     */
    function reportClientError(kind, error, componentStack) {
      try {
        const message = error && error.message ? String(error.message) : String(error);
        // Chromium emits this benign ResizeObserver warning on rapid layout
        // changes; it is not a render failure and would only add log noise.
        if (message.includes('ResizeObserver loop')) return;
        const stack = error && error.stack ? String(error.stack) : '';
        const key = `${message}\n${stack}`.slice(0, 1200);
        const now = Date.now();
        const previous = recentClientErrors.get(key);
        if (previous !== undefined && now - previous < 5000) return;
        recentClientErrors.set(key, now);
        if (recentClientErrors.size > 40) {
          for (const [oldKey, at] of recentClientErrors) {
            if (now - at > 60000) recentClientErrors.delete(oldKey);
          }
        }
        const payload = {
          kind: String(kind || 'client'),
          message: message.slice(0, 4000),
          stack: stack.slice(0, 24000),
          componentStack: String(componentStack || '').slice(0, 12000),
          href: typeof location !== 'undefined' ? String(location.href || '').slice(0, 1000) : '',
          userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 500) : '',
          version: '1.0.0',
          ts: new Date().toISOString(),
        };
        fetch(`${API_BASE}/client-error`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      } catch (failure) {
        try { console.error('[annotation-workbench] error report failed', failure); } catch (ignored) { /* ignore */ }
      }
      try { console.error(`[annotation-workbench] ${kind}`, error, componentStack || ''); } catch (ignored) { /* ignore */ }
    }

    /**
     * Extract `{field: message}` from a validation failure envelope.
     * @param {any} error thrown request failure
     * @returns {Record<string, string>}
     */
    function fieldErrorsOf(error) {
      const result = {};
      const details = error && error.details;
      const collect = (list) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
          if (item && typeof item === 'object' && (item.field || item.path)) {
            result[String(item.field || item.path)] = String(item.message || item.msg || 'invalid');
          }
        }
      };
      if (Array.isArray(details)) collect(details);
      else if (details && isObject(details)) {
        collect(details.errors);
        collect(details.fields);
        if (Array.isArray(details.details)) collect(details.details);
      }
      const payload = error && error.payload;
      if (payload && payload.error && payload.error.details) {
        const inner = payload.error.details;
        if (Array.isArray(inner)) collect(inner);
        else if (isObject(inner)) {
          collect(inner.errors);
          collect(inner.fields);
        }
      }
      return result;
    }

    /* ===================================================================== *
     * 6. Shared UI primitives (host-styled, aw- classes only)
     * ===================================================================== */

    /** Stroke icon paths; artwork stays monochrome and inherits currentColor. */
    const ICON_PATHS = {
      search: ['M8.5 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z', 'M12.6 12.6 17 17'],
      gear: ['M10 6.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z', 'M10 3.2v1.7M10 15.1v1.7M3.2 10h1.7M15.1 10h1.7M5.2 5.2l1.2 1.2M13.6 13.6l1.2 1.2M14.8 5.2l-1.2 1.2M6.4 13.6l-1.2 1.2'],
      help: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M7.9 7.7A2.2 2.2 0 0 1 12.2 9c0 1.5-2.2 1.7-2.2 3.1', 'M10 14.6h.01'],
      sparkle: ['M10 2.8l1.5 3.7 3.7 1.5-3.7 1.5L10 13.2 8.5 9.5 4.8 8l3.7-1.5L10 2.8z', 'M15.4 12.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7z'],
      copy: ['M7 6.5V4.8c0-.7.6-1.3 1.3-1.3h6.4c.7 0 1.3.6 1.3 1.3v6.4c0 .7-.6 1.3-1.3 1.3h-1.7', 'M4.8 7h6.4c.7 0 1.3.6 1.3 1.3v6.4c0 .7-.6 1.3-1.3 1.3H4.8c-.7 0-1.3-.6-1.3-1.3V8.3c0-.7.6-1.3 1.3-1.3z'],
      plus: ['M10 4v12', 'M4 10h12'],
      import: ['M10 3v9', 'M6.5 8.6 10 12l3.5-3.4', 'M4 14.5v1.2h12v-1.2'],
      refresh: ['M16 10a6 6 0 1 1-1.8-4.3', 'M16 3.4v3.2h-3.2'],
      close: ['M5 5l10 10', 'M15 5 5 15'],
      check: ['M4 10.5l4 4L16 5.5'],
      trash: ['M4 6h12', 'M8 6V4.4h4V6', 'M6 6l.8 10h6.4L14 6'],
      play: ['M7 4.5v11l9-5.5-9-5.5z'],
      text: ['M4 5h12', 'M4 9h12', 'M4 13h8'],
      image: ['M3.5 4.5h13v11h-13z', 'M6.2 8.2h.01', 'M3.5 13l4-4 4 4 2.5-2.5 2.5 2.5'],
      video: ['M3.5 5.5h9v9h-9z', 'M12.5 8.5l4-2v7l-4-2'],
      audio: ['M4 12V8', 'M7 14V6', 'M10 15.5V4.5', 'M13 13V7', 'M16 11.5V8.5'],
      chat: ['M4 4.5h12v9H9.5L6 16.5v-3H4z'],
      stats: ['M4 16V9', 'M8 16V5', 'M12 16v-4', 'M16 16V7'],
      flag: ['M5 3.5v13', 'M6 4h8l-1.8 3L14 10H6'],
      skip: ['M6 4.5l7 5.5-7 5.5z', 'M15 4.5v11'],
      save: ['M4 4.5h9l3 3v8h-12z', 'M7 4.5v4h5', 'M7 12h6'],
      send: ['M3.5 10 16.5 4l-4 12.5-2.8-4.6L3.5 10z'],
      folder: ['M3.5 5.5h5l1.5 2h6.5v8.5h-13z'],
      file: ['M6 3.5h5l3.5 3.5v9.5H6z', 'M11 3.5V7h3.5'],
      up: ['M10 15.5v-11', 'M5.5 9 10 4.5 14.5 9'],
      warn: ['M10 3 18 17H2L10 3z', 'M10 8v4', 'M10 14.6h.01'],
      user: ['M10 10a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z', 'M4 17c.8-3 3.1-4.4 6-4.4s5.2 1.4 6 4.4'],
      box: ['M4.5 4.5h11v11h-11z', 'M4.5 8h11', 'M8 8v7.5'],
      segment: ['M3 6.5h14', 'M3 13.5h14', 'M9 5v3', 'M12 12v3'],
      download: ['M10 3v9', 'M6.5 8.6 10 12l3.5-3.4', 'M4 15.5h12'],
      eye: ['M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z', 'M10 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z'],
    };

    /** Render one stroke icon. */
    function Icon(props) {
      const name = props && props.name ? props.name : 'box';
      const size = num(props && props.size, 15) || 15;
      const paths = ICON_PATHS[name] || ICON_PATHS.box;
      return h('svg', {
        viewBox: '0 0 20 20',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        style: { display: 'block', flex: 'none' },
      }, paths.map((d, index) => h('path', { key: `${name}-${index}`, d })));
    }

    /** The kind glyph used by queue rows and viewer headers. */
    function KindIcon(props) {
      const kind = String(props && props.kind ? props.kind : 'text');
      const map = { text: 'text', image: 'image', video: 'video', audio: 'audio', llm: 'chat', document: 'file' };
      return h(Icon, { name: map[kind] || 'text', size: props && props.size ? props.size : 12 });
    }

    /** One button with workbench styling. */
    function Btn(props) {
      const variant = props.variant || 'outline';
      const cls = cn(
        'aw-btn',
        variant === 'primary' && 'aw-btn-primary',
        variant === 'success' && 'aw-btn-success',
        variant === 'danger' && 'aw-btn-danger',
        variant === 'ghost' && 'aw-btn-ghost',
        props.active && 'aw-btn-active',
        props.iconOnly && 'aw-btn-icon',
        props.large && 'aw-btn-lg',
        props.className,
      );
      return h('button', {
        type: 'button',
        className: cls,
        disabled: Boolean(props.disabled),
        title: props.title || props.tooltip || undefined,
        'aria-label': props.ariaLabel || props.title || undefined,
        'aria-pressed': props.pressed === undefined ? undefined : Boolean(props.pressed),
        style: props.style,
        onClick: props.onClick || undefined,
      }, props.icon ? h(Icon, { name: props.icon, size: props.iconSize || 14 }) : null, props.children === undefined || props.children === null ? null : h('span', { className: 'aw-ellipsis' }, props.children));
    }

    /** A small status dot. */
    function StatusDot(props) {
      const status = String((props && props.status) || 'unlabeled');
      const label = t(`status.${status}`);
      return h('span', { className: cn('aw-dot', `aw-dot-${status}`), title: label, role: 'img', 'aria-label': label });
    }

    /** One tone-aware tag. */
    function Tag(props) {
      const tone = props.tone ? `aw-tag-${props.tone}` : '';
      return h('span', { className: cn('aw-tag', tone, props.className), title: props.title || undefined }, props.children);
    }

    /** A checkbox-style chip used for multi-select field options. */
    function Chip(props) {
      return h('button', {
        type: 'button',
        className: cn('aw-chip', props.active && 'aw-on'),
        'aria-pressed': Boolean(props.active),
        disabled: Boolean(props.disabled),
        onClick: props.onClick,
      }, props.children);
    }

    /** One labelled field shell: label, required marker, help text and inline error. */
    function FieldShell(props) {
      return h('div', { className: 'aw-field' },
        h('div', { className: 'aw-field-label' },
          h('span', null, props.label),
          props.required ? h('span', { className: 'aw-required', title: t('form.required') }, '*') : null,
          props.extra || null),
        props.children,
        props.help ? h('div', { className: 'aw-field-help' }, props.help) : null,
        props.error ? h('div', { className: 'aw-field-error', role: 'alert' }, props.error) : null);
    }

    /** A switch row (role=switch, keyboard accessible). */
    function Switch(props) {
      const checked = Boolean(props.checked);
      return h('span', {
        className: cn('aw-switch', checked && 'aw-on'),
        role: 'switch',
        tabIndex: props.disabled ? -1 : 0,
        'aria-checked': checked,
        'aria-label': props.label,
        'aria-disabled': props.disabled ? 'true' : undefined,
        onClick: props.disabled ? undefined : () => props.onChange(!checked),
        onKeyDown: props.disabled ? undefined : (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            props.onChange(!checked);
          }
        },
      },
      h('span', { className: 'aw-switch-track', 'aria-hidden': 'true' }),
      props.children ? h('span', null, props.children) : null);
    }

    /** Centered empty state. */
    function Empty(props) {
      return h('div', { className: 'aw-empty' },
        props.icon ? h('div', { className: 'aw-dim' }, h(Icon, { name: props.icon, size: 22 })) : null,
        props.title ? h('div', { className: 'aw-empty-title' }, props.title) : null,
        props.children ? h('div', { className: 'aw-dim', style: { fontSize: 12, lineHeight: 1.6 } }, props.children) : null);
    }

    /** A loading line. */
    function Loading(props) {
      return h('div', { className: 'aw-loading' }, props && props.text ? props.text : t('misc.loading'));
    }

    /**
     * Modal dialog rendered inside the app root (fixed overlay). Escape closes
     * it; the first `[data-autofocus]` element receives focus on mount.
     */
    function Modal(props) {
      const panelRef = React.useRef(null);
      React.useEffect(() => {
        const panel = panelRef.current;
        if (panel) {
          const target = panel.querySelector('[data-autofocus]') || panel;
          try { target.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
        }
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            if (props.onClose) props.onClose();
          }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, []);
      return h('div', {
        className: 'aw-modal-mask',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && props.onClose) props.onClose();
        },
      },
      h('div', {
        ref: panelRef,
        className: cn('aw-modal', props.wide && 'aw-modal-wide'),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': props.title,
        tabIndex: -1,
      },
      h('div', { className: 'aw-modal-head' },
        h('div', { className: 'aw-modal-title' }, props.title),
        h('button', { type: 'button', className: 'aw-close', 'aria-label': t('actions.close'), onClick: props.onClose }, '×')),
      h('div', { className: 'aw-modal-body' }, props.children),
      props.footer ? h('div', { className: 'aw-modal-foot' }, props.footer) : null));
    }

    /** Toast stack (bottom-right of the app root). */
    function ToastHost(props) {
      const toasts = props.toasts || [];
      if (toasts.length === 0) return null;
      return h('div', { className: 'aw-toasts', role: 'status', 'aria-live': 'polite' },
        toasts.map((item) => h('div', {
          key: item.id,
          className: cn('aw-toast', item.tone === 'error' && 'aw-toast-error', item.tone === 'success' && 'aw-toast-success'),
        },
        h('span', { style: { flex: '1 1 auto' } }, item.text),
        h('button', { type: 'button', className: 'aw-remove', 'aria-label': t('toast.close'), onClick: () => props.onDismiss(item.id) }, '×'))));
    }

    /** One labeled progress bar. */
    function ProgressBar(props) {
      const total = Math.max(1, num(props.total, 1));
      const value = clamp(num(props.value, 0), 0, total);
      return h('div', { className: 'aw-progress', title: props.title || `${value}/${total}` },
        h('div', {
          className: cn('aw-progress-bar', props.tone === 'success' && 'aw-progress-bar-ok'),
          style: { width: `${(value / total) * 100}%` },
        }));
    }

    /** Compact list of keycaps. */
    function Keys(props) {
      const keys = Array.isArray(props.keys) ? props.keys : [];
      return h('span', { className: 'aw-shortcut-keys' }, keys.map((key, index) => h('span', { className: 'aw-kbd', key: `${key}-${index}` }, key)));
    }

    /** Button that shows a spinner while a promise runs. */
    function useBusy() {
      const [busy, setBusy] = React.useState(false);
      const run = React.useCallback(async (fn) => {
        setBusy(true);
        try {
          return await fn();
        } finally {
          setBusy(false);
        }
      }, []);
      return [busy, run];
    }

    /** Debounce a value. */
    function useDebounced(value, delayMs) {
      const [debounced, setDebounced] = React.useState(value);
      React.useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timer);
      }, [value, delayMs]);
      return debounced;
    }

    /* ===================================================================== *
     * 7. Schema-driven helpers and local validation
     * ===================================================================== */

    /** Built-in template cards; replaced by GET /templates when available. */
    const TEMPLATE_FALLBACK = [
      { id: 'text_classification', title: '文本分类 / 质检', description: '给一段文本打分类、情感、质量分。', kind: 'text', fieldCount: 4 },
      { id: 'text_span', title: '文本片段 / 实体抽取', description: '在原文中划词添加片段标签。', kind: 'text', fieldCount: 2 },
      { id: 'image_classification', title: '图像分类 / OCR', description: '图片多标签、OCR 与质量分。', kind: 'image', fieldCount: 3 },
      { id: 'image_bbox', title: '图像框选 / OCR 区域', description: '拖拽画框，标注类别与文字。', kind: 'image', fieldCount: 2 },
      { id: 'video_caption', title: '视频字幕 / 音频转写', description: '按时间轴切分字幕或转写。', kind: 'video', fieldCount: 4 },
      { id: 'audio_transcript', title: '音频转写 / 说话人', description: '音频分段转写与说话人。', kind: 'audio', fieldCount: 4 },
      { id: 'llm_preference', title: 'LLM 对话质量 / 偏好', description: '并排比较两个回答并打分。', kind: 'llm', fieldCount: 6 },
      { id: 'custom', title: '自定义', description: '从空白 schema 开始。', kind: 'text', fieldCount: 2 },
    ];

    /** Project schema fields (defensive: a broken project should not blank the UI). */
    function fieldsOf(project) {
      if (!project) return [];
      const schema = project.schema;
      if (!schema || !Array.isArray(schema.fields)) return [];
      return schema.fields.filter((field) => field && typeof field === 'object' && field.id);
    }

    /** Whether a schema field applies to the given item kind. */
    function fieldVisible(field, item) {
      if (!field || !field.when) return true;
      const when = field.when;
      if (Array.isArray(when.kind) && item && item.kind && when.kind.length > 0) return when.kind.includes(item.kind);
      return true;
    }

    /** Empty value for one field type. */
    function emptyFieldValue(field) {
      if (!field) return '';
      switch (field.type) {
        case 'multiselect':
        case 'tags':
        case 'segments':
        case 'bbox':
        case 'spans':
          return [];
        case 'boolean':
          return false;
        case 'number':
        case 'rating':
          return '';
        default:
          return '';
      }
    }

    /** Normalized label object for the current actor. */
    function initialLabels(schemaFields, source) {
      const labels = {};
      for (const field of schemaFields) {
        labels[field.id] = source && source[field.id] !== undefined ? clone(source[field.id]) : emptyFieldValue(field);
      }
      return labels;
    }

    /** Field options as `{value,label}`. */
    function optionsOf(field) {
      if (!field || !Array.isArray(field.options)) return [];
      return field.options.filter((option) => option && typeof option === 'object' && option.value !== undefined).map((option) => ({
        value: String(option.value),
        label: String(option.label === undefined ? option.value : option.label),
      }));
    }

    /**
     * Client-side validation mirroring lib/validate.js for the common cases, so
     * inline errors appear before a request is sent. The API stays the authority.
     */
    function validateLabels(schemaFields, labels, item) {
      const errors = {};
      for (const field of schemaFields) {
        if (!fieldVisible(field, item)) continue;
        const value = labels ? labels[field.id] : undefined;
        const label = field.label || field.id;
        if (field.required && isEmptyValue(value)) {
          errors[field.id] = t('form.fieldRequired', { label });
          continue;
        }
        if (isEmptyValue(value)) continue;
        switch (field.type) {
          case 'number':
          case 'rating': {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) {
              errors[field.id] = t('form.fieldRequired', { label });
              break;
            }
            const min = field.min === undefined ? (field.type === 'rating' ? 1 : undefined) : Number(field.min);
            const max = field.max === undefined ? (field.type === 'rating' ? 5 : undefined) : Number(field.max);
            if ((min !== undefined && Number.isFinite(min) && parsed < min) || (max !== undefined && Number.isFinite(max) && parsed > max)) {
              errors[field.id] = t('form.fieldRange', { label, min: min === undefined ? '-∞' : min, max: max === undefined ? '∞' : max });
            }
            break;
          }
          case 'select': {
            const options = optionsOf(field);
            if (options.length > 0 && !options.some((option) => option.value === String(value))) errors[field.id] = t('form.fieldRequired', { label });
            break;
          }
          case 'multiselect':
          case 'tags': {
            if (!Array.isArray(value)) errors[field.id] = t('form.fieldRequired', { label });
            break;
          }
          case 'segments': {
            if (!Array.isArray(value)) {
              errors[field.id] = t('form.fieldRequired', { label });
              break;
            }
            const duration = item && item.meta && item.meta.durationMs ? num(item.meta.durationMs) / 1000 : null;
            for (const segment of value) {
              if (!segment || typeof segment !== 'object') continue;
              const start = num(segment.start);
              const end = num(segment.end);
              if (start < 0) { errors[field.id] = `${label}: start < 0`; break; }
              if (end <= start) { errors[field.id] = `${label}: end ≤ start`; break; }
              if (duration !== null && end > duration + 0.5) { errors[field.id] = `${label}: end > duration`; break; }
            }
            break;
          }
          case 'bbox': {
            if (!Array.isArray(value)) {
              errors[field.id] = t('form.fieldRequired', { label });
              break;
            }
            for (const box of value) {
              if (!box || typeof box !== 'object') continue;
              const x = num(box.x); const y = num(box.y); const w = num(box.w); const hh = num(box.h);
              if (x < 0 || y < 0 || w <= 0 || hh <= 0 || x + w > 1.0001 || y + hh > 1.0001) {
                errors[field.id] = `${label}: 0..1`;
                break;
              }
            }
            break;
          }
          case 'spans': {
            if (!Array.isArray(value)) {
              errors[field.id] = t('form.fieldRequired', { label });
              break;
            }
            const textLength = item && item.payload && typeof item.payload.text === 'string' ? item.payload.text.length : 0;
            for (const span of value) {
              if (!span || typeof span !== 'object') continue;
              const start = num(span.start); const end = num(span.end);
              if (start < 0 || end <= start || (textLength > 0 && end > textLength)) {
                errors[field.id] = `${label}: offset`;
                break;
              }
            }
            break;
          }
          case 'json': {
            if (typeof value === 'string' && value.trim() !== '') {
              try { JSON.parse(value); } catch (error) { errors[field.id] = t('form.jsonInvalid'); }
            }
            break;
          }
          default:
            break;
        }
      }
      return errors;
    }

    /* ===================================================================== *
     * 8. Onboarding view
     * ===================================================================== */

    /** First-run actor form. */
    function ActorForm(props) {
      const [name, setName] = React.useState((props.device && props.device.actorName) || '');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const submit = async (event) => {
        if (event) event.preventDefault();
        const trimmed = name.trim();
        if (trimmed === '') {
          setError(t('onboarding.actorRequired'));
          return;
        }
        setBusy(true);
        setError('');
        try {
          await props.onSaveActor(trimmed);
        } catch (failure) {
          reportError(failure);
        } finally {
          setBusy(false);
        }
      };
      return h('form', { className: 'aw-onboard-actor', onSubmit: submit },
        h('div', { style: { fontSize: 14, fontWeight: 600 } }, t('onboarding.actorTitle')),
        h('div', { className: 'aw-btn-ghost aw-muted', style: { fontSize: 11, lineHeight: 1.6 } }, t('onboarding.actorHint')),
        h('input', {
          className: 'aw-input',
          value: name,
          placeholder: t('onboarding.actorPlaceholder'),
          'aria-label': t('onboarding.actorTitle'),
          autoFocus: true,
          onChange: (event) => setName(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') submit(event); },
        }),
        error ? h('div', { className: 'aw-field-error', role: 'alert' }, error) : null,
        h('div', null, h(Btn, { variant: 'primary', large: true, disabled: busy, onClick: submit }, busy ? t('form.saving') : t('onboarding.saved'))));
    }

    /** Project list shown after the actor name exists. */
    function ProjectGrid(props) {
      const projects = props.projects || [];
      if (props.loading) return h(Loading, { text: t('onboarding.loading') });
      if (projects.length === 0) {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' } },
          h('div', { className: 'aw-muted' }, t('onboarding.projectsEmpty')),
          h('div', { className: 'aw-row aw-wrap' },
            h(Btn, { variant: 'primary', large: true, icon: 'plus', onClick: () => props.onCreate() }, t('onboarding.newProject')),
            h(Btn, { large: true, icon: 'import', onClick: () => props.onImport() }, t('onboarding.importProject'))));
      }
      return h('div', { className: 'aw-col', style: { gap: 10 } },
        h('div', { className: 'aw-row aw-wrap' },
          h(Btn, { variant: 'primary', icon: 'plus', onClick: () => props.onCreate() }, t('onboarding.newProject')),
          h(Btn, { icon: 'import', onClick: () => props.onImport() }, t('onboarding.importProject')),
          h(Btn, { icon: 'refresh', onClick: () => props.onRefresh() }, t('actions.refresh'))),
        h('div', { className: 'aw-projects' }, projects.map((project) => h('div', { className: 'aw-project', key: project.id },
          h('div', { className: 'aw-project-name' }, String(project.name || project.id || t('misc.untitled'))),
          h('div', { className: 'aw-project-meta' },
            h(Tag, null, String(project.template || 'custom')),
            project.itemCount !== undefined ? h(Tag, null, t('misc.itemCount', { n: project.itemCount })) : null,
            props.activeProject === project.id ? h(Tag, { tone: 'ok' }, t('onboarding.openProject')) : null),
          project.description ? h('div', { className: 'aw-dim', style: { fontSize: 11, lineHeight: 1.5 } }, String(project.description)) : null,
          h('div', { className: 'aw-project-actions' },
            h(Btn, { variant: 'primary', onClick: () => props.onOpen(project) }, t('actions.view')),
            h(Btn, {
              icon: 'plus',
              onClick: () => props.onImport(project),
              title: t('onboarding.importProject'),
            }, t('actions.import')),
            h(Btn, {
              icon: 'sparkle',
              onClick: () => props.onDemo(project),
              title: t('actions.demo'),
            }, t('actions.demo')),
            h(Btn, {
              iconOnly: true,
              icon: 'trash',
              onClick: () => props.onDelete(project),
              title: t('actions.delete'),
            }))))));
    }

    /** Whole onboarding screen (actor gate + project browser). */
    function OnboardingView(props) {
      const device = props.device || {};
      return h('div', { className: 'aw-onboard' },
        h('div', { className: 'aw-onboard-inner' },
          h('div', { className: 'aw-onboard-head' },
            h(BrandMark, { size: 34 }),
            h('div', { className: 'aw-col', style: { gap: 2 } },
              h('div', { className: 'aw-onboard-title' }, t('onboarding.title')),
              h('div', { className: 'aw-onboard-sub' }, device.dataRoot ? t('settings.dataRoot') : '')),
            h('span', { className: 'aw-spacer' }),
            h(Btn, { iconOnly: true, icon: 'gear', title: t('header.settings'), onClick: () => props.onOpenModal('settings') }),
            h(Btn, { iconOnly: true, icon: 'help', title: t('header.shortcuts'), onClick: () => props.onOpenModal('shortcuts') })),
          !device.actorName ? h(ActorForm, { device, onSaveActor: props.onSaveActor })
            : h(React.Fragment, null,
              h('div', { className: 'aw-onboard-sub' }, `${t('actor.label')}：${device.actorName}`),
              h(ProjectGrid, {
                projects: props.projects,
                loading: props.loading,
                activeProject: device.activeProject,
                onOpen: props.onOpenProject,
                onCreate: () => props.onOpenModal('create'),
                onImport: (project) => props.onOpenModal('import', project || null),
                onDemo: props.onDemo,
                onDelete: (project) => props.onOpenModal('deleteProject', project),
                onRefresh: props.onRefresh,
              })))) ;
    }

    /* ===================================================================== *
     * 9. Create-project wizard
     * ===================================================================== */

    /** Template picker + name form. */
    function CreateProjectModal(props) {
      const templates = props.templates && props.templates.length > 0 ? props.templates : TEMPLATE_FALLBACK;
      const [template, setTemplate] = React.useState(templates[0] ? templates[0].id : 'text_classification');
      const [name, setName] = React.useState('');
      const [description, setDescription] = React.useState('');
      const [withDemo, setWithDemo] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const submit = async () => {
        const trimmed = name.trim();
        if (trimmed === '') { setError(t('project.name')); return; }
        setBusy(true);
        setError('');
        try {
          const created = await api.createProject({
            name: trimmed,
            template,
            description: description.trim(),
            actor: CORE && CORE.actor ? CORE.actor : undefined,
          });
          const projectId = created && created.project && created.project.id;
          if (withDemo && projectId) {
            try {
              await api.demo(projectId);
            } catch (failure) {
              reportError(failure);
            }
          }
          if (projectId) {
            toast(t('settings.saved'), 'success');
            props.onCreated(projectId, created);
          } else {
            props.onCreated(null, created);
          }
        } catch (failure) {
          reportError(failure);
          setError(errorText(failure));
        } finally {
          setBusy(false);
        }
      };
      return h(Modal, {
        title: t('project.newTitle'),
        onClose: props.onClose,
        wide: true,
        footer: [
          h(Btn, { key: 'cancel', onClick: props.onClose }, t('actions.cancel')),
          h(Btn, { key: 'create', variant: 'primary', disabled: busy, onClick: submit }, busy ? t('project.creating') : t('actions.create')),
        ],
      },
      h('div', { className: 'aw-col', style: { gap: 12 } },
        h('div', null,
          h('div', { className: 'aw-field-label', style: { marginBottom: 5 } }, t('project.template')),
          h('div', { className: 'aw-field-help', style: { marginBottom: 6 } }, t('project.templateHint')),
          h('div', { className: 'aw-templates' }, templates.map((item) => {
            const id = String(item.id || item.template || 'custom');
            return h('button', {
              key: id,
              type: 'button',
              className: cn('aw-template', template === id && 'aw-on'),
              onClick: () => setTemplate(id),
            },
            h('div', { className: 'aw-template-title' }, String(item.title || id)),
            h('div', { className: 'aw-template-desc' }, String(item.description || '')),
            h('div', { className: 'aw-dim', style: { fontSize: 10 } }, `${String(item.kind || '')} · ${num(item.fieldCount, 0)}`));
          }))),
        h(FieldShell, { label: t('project.name'), required: true, error: error || undefined },
          h('input', {
            className: 'aw-input',
            value: name,
            placeholder: t('project.namePlaceholder'),
            'data-autofocus': true,
            onChange: (event) => setName(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
          })),
        h(FieldShell, { label: t('project.description') },
          h('textarea', {
            className: 'aw-textarea',
            rows: 2,
            value: description,
            onChange: (event) => setDescription(event.target.value),
          })),
        h('label', { className: 'aw-row', style: { cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: withDemo, onChange: (event) => setWithDemo(event.target.checked) }),
          h('span', { className: 'aw-muted' }, t('project.demo')))));
    }

    /* ===================================================================== *
     * 10. Import wizard
     * ===================================================================== */

    /** Directory browser backed by GET /browse (names and sizes only). */
    function BrowsePane(props) {
      const [path, setPath] = React.useState(props.initialPath || '');
      const [state, setState] = React.useState({ loading: true, data: null, error: '' });
      const load = React.useCallback(async (nextPath) => {
        setState({ loading: true, data: null, error: '' });
        try {
          const data = await api.browse(nextPath || '');
          setState({ loading: false, data, error: '' });
          if (data && typeof data.path === 'string') setPath(data.path);
        } catch (failure) {
          setState({ loading: false, data: null, error: errorText(failure) });
        }
      }, []);
      React.useEffect(() => { load(path); }, []);
      const data = state.data;
      const entries = data && Array.isArray(data.entries) ? data.entries : [];
      return h('div', { className: 'aw-browse' },
        h('div', { className: 'aw-browse-head' },
          h(Btn, { icon: 'up', iconOnly: true, title: t('project.browseUp'), disabled: !data || !data.parent, onClick: () => load(data && data.parent ? data.parent : '') }),
          h('div', { className: 'aw-browse-path aw-mono' }, String((data && data.path) || path || '')),
          h(Btn, { icon: 'refresh', iconOnly: true, title: t('actions.refresh'), onClick: () => load(path) })),
        h('div', { className: 'aw-browse-list' },
          state.loading ? h(Loading, null) : null,
          state.error ? h('div', { className: 'aw-validation', style: { padding: 8 } }, state.error) : null,
          !state.loading && entries.length === 0 ? h('div', { className: 'aw-dim', style: { padding: 10 }, }, t('project.browseEmpty')) : null,
          entries.map((entry) => h('button', {
            key: String(entry.path || entry.name),
            type: 'button',
            className: 'aw-browse-row',
            onClick: () => {
              if (entry.isDirectory || entry.type === 'dir') load(String(entry.path || entry.name));
              else props.onSelectPath(String(entry.path || entry.name));
            },
          },
          h('span', { className: entry.isDirectory || entry.type === 'dir' ? 'aw-browse-dir' : '' },
            h(Icon, { name: entry.isDirectory || entry.type === 'dir' ? 'folder' : 'file', size: 13 })),
          h('span', { className: 'aw-ellipsis', style: { flex: '1 1 auto' } }, String(entry.name || entry.path || '')),
          entry.size !== undefined ? h('span', { className: 'aw-browse-size' }, `${Math.max(1, Math.round(num(entry.size) / 1024))} KB`) : null))),
        h('div', { className: 'aw-modal-foot', style: { borderTop: '0.5px solid var(--dsw-alias-border-l2)' } },
          h(Btn, { onClick: () => props.onSelectPath(String(path || '')) }, t('actions.confirm'))));
    }

    /** Import wizard: preview then import. */
    function ImportWizard(props) {
      const [source, setSource] = React.useState((props.initialSource || ''));
      const [format, setFormat] = React.useState('auto');
      const [copyMedia, setCopyMedia] = React.useState(true);
      const [mapping, setMapping] = React.useState({});
      const [preview, setPreview] = React.useState(null);
      const [result, setResult] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [browsing, setBrowsing] = React.useState(false);
      const runPreview = async () => {
        if (source.trim() === '') { setError(t('project.sourceRequired')); return; }
        setBusy(true);
        setError('');
        try {
          const data = await api.previewImport(props.project.id, {
            source: source.trim(),
            format: format === 'auto' ? undefined : format,
            mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
          });
          setPreview(data || {});
          setMapping((previous) => {
            const next = { ...previous };
            const suggested = data && data.suggestedMapping;
            if (suggested && typeof suggested === 'object') {
              for (const key of Object.keys(suggested)) if (suggested[key] && !next[key]) next[key] = String(suggested[key]);
            }
            return next;
          });
          if (data && data.format) setFormat((previous) => (previous === 'auto' ? previous : previous));
        } catch (failure) {
          reportError(failure);
          setError(errorText(failure));
        } finally {
          setBusy(false);
        }
      };
      const runImport = async () => {
        if (source.trim() === '') { setError(t('project.sourceRequired')); return; }
        setBusy(true);
        setError('');
        try {
          const data = await api.importItems(props.project.id, {
            source: source.trim(),
            format: format === 'auto' ? undefined : format,
            mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
            copyMedia,
          });
          setResult(data || {});
          toast(t('project.imported', {
            imported: num(data && data.imported),
            skipped: num(data && data.skipped),
            warnings: Array.isArray(data && data.warnings) ? data.warnings.length : num(data && data.warnings),
          }), 'success');
          if (props.onImported) props.onImported(data);
        } catch (failure) {
          reportError(failure);
          setError(errorText(failure));
        } finally {
          setBusy(false);
        }
      };
      const columns = preview && Array.isArray(preview.columns) ? preview.columns : [];
      const sample = preview && Array.isArray(preview.sample) ? preview.sample.slice(0, 3) : [];
      const warnings = preview && Array.isArray(preview.warnings) ? preview.warnings : [];
      const mappingTargets = [
        ['id', t('project.mapping.id')],
        ['text', t('project.mapping.text')],
        ['media', t('project.mapping.media')],
        ['messages', t('project.mapping.messages')],
      ];
      return h(Modal, {
        title: `${t('project.importTitle')} · ${String(props.project.name || props.project.id || '')}`,
        onClose: props.onClose,
        wide: true,
        footer: [
          h(Btn, { key: 'cancel', onClick: props.onClose }, t('actions.close')),
          h(Btn, { key: 'preview', disabled: busy, onClick: runPreview }, t('actions.preview')),
          h(Btn, { key: 'import', variant: 'primary', disabled: busy, onClick: runImport }, busy ? t('project.importing') : t('project.importRun')),
        ],
      },
      h('div', { className: 'aw-col', style: { gap: 10 } },
        h('div', { className: 'aw-field-help' }, t('project.importHint')),
        h(FieldShell, { label: t('project.source'), required: true },
          h('div', { className: 'aw-row' },
            h('input', {
              className: 'aw-input',
              value: source,
              placeholder: t('project.sourcePlaceholder'),
              'data-autofocus': true,
              onChange: (event) => setSource(event.target.value),
            }),
            h(Btn, { icon: 'folder', onClick: () => setBrowsing((value) => !value) }, t('actions.browse')))),
        browsing ? h(BrowsePane, { initialPath: source.trim(), onSelectPath: (picked) => { setSource(picked); setBrowsing(false); } }) : null,
        h('div', { className: 'aw-split' },
          h(FieldShell, { label: t('project.format') },
            h('select', { className: 'aw-select', value: format, onChange: (event) => setFormat(event.target.value) },
              h('option', { value: 'auto' }, t('project.format.auto')),
              ['jsonl', 'json', 'csv', 'tsv', 'srt', 'vtt', 'folder'].map((value) => h('option', { key: value, value }, value.toUpperCase())))),
          h('div', { className: 'aw-row', style: { alignSelf: 'flex-end', paddingBottom: 6 } },
            h('label', { className: 'aw-row', style: { cursor: 'pointer', gap: 6 } },
              h('input', { type: 'checkbox', checked: copyMedia, onChange: (event) => setCopyMedia(event.target.checked) }),
              h('span', { className: 'aw-muted' }, t('project.copyMedia'))))),
        columns.length > 0 ? h('div', null,
          h('div', { className: 'aw-field-label', style: { marginBottom: 4 } }, t('project.mapping')),
          h('div', { className: 'aw-field-help', style: { marginBottom: 6 } }, t('project.mappingHint')),
          h('div', { className: 'aw-split' }, mappingTargets.map(([key, label]) => h(FieldShell, { key, label },
            h('select', {
              className: 'aw-select',
              value: mapping[key] || '',
              onChange: (event) => setMapping({ ...mapping, [key]: event.target.value || undefined }),
            },
            h('option', { value: '' }, t('misc.none')),
            columns.map((column) => h('option', { key: String(column), value: String(column) }, String(column))))))))
          : (preview ? h('div', { className: 'aw-dim' }, t('project.noColumns')) : null),
        preview ? h('details', { className: 'aw-details', open: true },
          h('summary', null, `${t('project.sample')} (${String(preview.format || format)}, ${sample.length})`),
          h('div', { className: 'aw-mono', style: { whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', fontSize: 11 } }, sample.length > 0 ? sample.map((row) => JSON.stringify(row)).join('\n') : t('misc.noData'))) : null,
        warnings.length > 0 ? h('div', { className: 'aw-validation' }, warnings.slice(0, 5).join('\n')) : null,
        error ? h('div', { className: 'aw-field-error', role: 'alert' }, error) : null,
        result ? h('div', { className: 'aw-summary' },
          h('div', null, t('project.imported', {
            imported: num(result.imported),
            skipped: num(result.skipped),
            warnings: Array.isArray(result.warnings) ? result.warnings.length : num(result.warnings),
          }))) : null));
    }

    /* ===================================================================== *
     * 11. Settings form (shared by the settings section and the header modal)
     * ===================================================================== */

    /** Device settings, data root picker and workbench shortcuts. */
    function SettingsForm(props) {
      const device = props.device || {};
      const [actorName, setActorName] = React.useState(device.actorName || '');
      const [dataRoot, setDataRoot] = React.useState(device.dataRoot || '');
      const [openOnStart, setOpenOnStart] = React.useState(Boolean(device.openOnStart));
      const [autosave, setAutosave] = React.useState(!(device.ui && device.ui.autosave === false));
      const [busy, setBusy] = React.useState('');
      const [error, setError] = React.useState('');
      React.useEffect(() => {
        setActorName(device.actorName || '');
        setDataRoot(device.dataRoot || '');
        setOpenOnStart(Boolean(device.openOnStart));
        setAutosave(!(device.ui && device.ui.autosave === false));
      }, [device.actorName, device.dataRoot, device.openOnStart, device.ui && device.ui.autosave]);
      const save = async (patch, message) => {
        setBusy('save');
        setError('');
        try {
          const updated = await api.updateDevice(patch);
          if (props.onDevice) props.onDevice(updated);
          toast(message || t('settings.saved'), 'success');
          return updated;
        } catch (failure) {
          reportError(failure);
          setError(errorText(failure));
          return null;
        } finally {
          setBusy('');
        }
      };
      const pickDirectory = async () => {
        setError('');
        try {
          const ctx = CORE && CORE.ctx;
          if (!ctx || !ctx.uiWorkspace || typeof ctx.uiWorkspace.pickDirectory !== 'function') throw new Error('no picker');
          const picked = await ctx.uiWorkspace.pickDirectory();
          const path = typeof picked === 'string' ? picked : picked && typeof picked.path === 'string' ? picked.path : '';
          if (path) setDataRoot(path);
        } catch (failure) {
          setError(t('settings.pickFailed'));
        }
      };
      const saveAll = async () => {
        const patch = {
          actorName: actorName.trim() || undefined,
          dataRoot: dataRoot.trim() || undefined,
          openOnStart,
          ui: { autosave },
        };
        const updated = await save(patch, t('settings.saved'));
        if (updated && props.onRefreshProjects) props.onRefreshProjects();
      };
      const copyPath = async () => {
        const ok = await copyText(dataRoot);
        toast(ok ? t('settings.copied') : t('misc.copyFailed'), ok ? 'success' : 'error');
      };
      return h('div', { className: 'aw-col', style: { gap: 12 } },
        h(FieldShell, { label: t('settings.actor'), help: t('settings.actorHint') },
          h('input', { className: 'aw-input', value: actorName, placeholder: t('onboarding.actorPlaceholder'), onChange: (event) => setActorName(event.target.value) })),
        h(FieldShell, { label: t('settings.dataRoot'), help: t('settings.dataRootHint') },
          h('div', { className: 'aw-row' },
            h('input', { className: 'aw-input', value: dataRoot, placeholder: t('project.sourcePlaceholder'), onChange: (event) => setDataRoot(event.target.value) }),
            h(Btn, { icon: 'folder', onClick: pickDirectory, title: t('settings.pickDirectory') }, t('settings.pickDirectory')))),
        h('div', { className: 'aw-col', style: { gap: 8 } },
          h(Switch, { checked: openOnStart, label: t('settings.openOnStart'), onChange: (next) => { setOpenOnStart(next); save({ openOnStart: next }); } }, t('settings.openOnStart')),
          h(Switch, { checked: autosave, label: t('settings.autosave'), onChange: (next) => { setAutosave(next); save({ ui: { autosave: next } }); } }, t('settings.autosave')),
          h('div', { className: 'aw-field-help' }, t('settings.autosaveHint'))),
        h('div', { className: 'aw-hr' }),
        h('div', { className: 'aw-row aw-wrap' },
          h(Btn, { variant: 'primary', disabled: busy === 'save', onClick: saveAll }, busy === 'save' ? t('form.saving') : t('settings.save')),
          h(Btn, { icon: 'refresh', onClick: () => props.onRefreshProjects && props.onRefreshProjects() }, t('settings.refresh')),
          h(Btn, { icon: 'copy', onClick: copyPath }, t('settings.copyPath')),
          props.onGo ? h(Btn, { variant: 'primary', icon: 'box', onClick: props.onGo }, t('settings.go')) : null),
        error ? h('div', { className: 'aw-validation', role: 'alert' }, error) : null,
        h('div', { className: 'aw-modal-foot', style: { borderTop: '0.5px solid var(--dsw-alias-border-l2)', padding: '8px 0 0', justifyContent: 'flex-start' } },
          h('span', { className: 'aw-dim', style: { fontSize: 11 } }, `${t('settings.version')}：${String(props.version || (CORE && CORE.version) || t('misc.unknown'))}`),
          h('span', { className: 'aw-dim', style: { fontSize: 11, overflowWrap: 'anywhere' } }, dataRoot)));
    }

    /** Keyboard shortcut reference. */
    function ShortcutsModal(props) {
      const rows = [
        [['j'], t('shortcuts.next')],
        [['k'], t('shortcuts.prev')],
        [['s'], t('shortcuts.save')],
        [['Ctrl', 'Enter'], t('shortcuts.submit')],
        [['x'], t('shortcuts.skip')],
        [['f'], t('shortcuts.flag')],
        [['?'], t('shortcuts.help')],
        [['Space'], t('shortcuts.play')],
        [['['], t('shortcuts.segStart')],
        [[']'], t('shortcuts.segEnd')],
        [['n'], t('shortcuts.newSegment')],
        [['Esc'], t('shortcuts.escape')],
      ];
      return h(Modal, {
        title: t('shortcuts.title'),
        onClose: props.onClose,
        footer: h(Btn, { onClick: props.onClose }, t('actions.close')),
      }, h('div', null, rows.map(([keys, label]) => h('div', { className: 'aw-shortcut-row', key: label },
        h('span', null, label),
        h(Keys, { keys })))));
    }

    /* ===================================================================== *
     * 12. Task queue
     * ===================================================================== */

    /** Filter chip definitions per mode. */
    function filterChips(mode) {
      if (mode === 'review') {
        return [
          { id: 'all', label: t('filter.review') },
          { id: 'approved', label: t('filter.approved') },
          { id: 'rejected', label: t('filter.rejected') },
          { id: 'todo', label: t('filter.todo') },
        ];
      }
      return [
        { id: 'all', label: t('filter.all') },
        { id: 'todo', label: t('filter.todo') },
        { id: 'mine', label: t('filter.mine') },
        { id: 'approved', label: t('filter.approved') },
        { id: 'rejected', label: t('filter.rejected') },
        { id: 'flagged', label: t('filter.flagged') },
      ];
    }

    /** Map a UI filter id to queue query parameters. */
    function filterParams(mode, filterId) {
      const params = { mode: mode === 'review' ? 'review' : 'annotate' };
      if (mode === 'review') {
        if (filterId === 'todo') params.status = 'submitted';
        else if (filterId === 'approved') params.status = 'approved';
        else if (filterId === 'rejected') params.status = 'rejected';
        return params;
      }
      if (filterId === 'todo') params.status = 'unlabeled';
      else if (filterId === 'approved') params.status = 'approved';
      else if (filterId === 'rejected') params.status = 'rejected';
      else if (filterId === 'flagged') params.status = 'flagged';
      else if (filterId === 'mine') params.status = 'mine';
      return params;
    }

    /** Preview text for one queue row. */
    function queuePreview(row) {
      if (!row) return '';
      if (typeof row.preview === 'string' && row.preview.trim() !== '') return row.preview;
      if (row.item && typeof row.item.preview === 'string') return row.item.preview;
      return String(row.id || '');
    }

    /** The left task queue with filter chips, search and windowed rows. */
    function TaskQueue(props) {
      const listRef = React.useRef(null);
      const rows = Array.isArray(props.rows) ? props.rows : [];
      const onScroll = () => {
        const list = listRef.current;
        if (!list || !props.hasMore || props.loading) return;
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 160) props.onLoadMore();
      };
      React.useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const active = list.querySelector('[data-active="true"]');
        if (active && typeof active.scrollIntoView === 'function') {
          try { active.scrollIntoView({ block: 'nearest' }); } catch (error) { /* ignore */ }
        }
      }, [props.activeId]);
      return h(React.Fragment, null,
        h('div', { className: 'aw-pane-head' },
          h('span', { className: 'aw-pane-title' }, props.mode === 'review' ? t('review.title') : t('queue.title')),
          h('span', { className: 'aw-dim', style: { fontSize: 11 } }, t('queue.count', { n: props.total === undefined ? rows.length : props.total })),
          h('span', { className: 'aw-spacer' }),
          h(Btn, { icon: 'refresh', iconOnly: true, title: t('actions.refresh'), onClick: props.onRefresh })),
        h('div', { className: 'aw-chips' }, filterChips(props.mode).map((chip) => h('button', {
          key: chip.id,
          type: 'button',
          className: cn('aw-chip', props.filter === chip.id && 'aw-on'),
          onClick: () => props.onFilter(chip.id),
        }, chip.label))),
        h('div', { className: 'aw-pane-head', style: { paddingTop: 6, paddingBottom: 6 } },
          h('input', {
            className: 'aw-input',
            style: { height: 26 },
            value: props.query,
            placeholder: t('search.placeholder'),
            'aria-label': t('search.placeholder'),
            onChange: (event) => props.onQuery(event.target.value),
          })),
        h('div', { className: 'aw-queue-list', ref: listRef, onScroll },
          props.loading && rows.length === 0 ? h('div', { style: { padding: 10 } }, h(Loading, null)) : null,
          rows.length === 0 && !props.loading ? h(Empty, { icon: 'box', title: t('queue.empty') }, t('queue.pick')) : null,
          rows.map((row) => h('button', {
            key: String(row.id),
            type: 'button',
            'data-active': row.id === props.activeId ? 'true' : undefined,
            className: cn('aw-queue-row', row.id === props.activeId && 'aw-on'),
            onClick: () => props.onSelect(row),
          },
          h('div', { className: 'aw-queue-row-top' },
            h(StatusDot, { status: String(row.status || 'unlabeled') }),
            h('span', { className: 'aw-queue-id aw-ellipsis' }, String(row.id || '')),
            h('span', { className: 'aw-spacer' }),
            row.priority ? h(Tag, { tone: 'bad' }, `P${row.priority}`) : null,
            h('span', { className: 'aw-dim', title: t(`kind.${String(row.kind || 'text')}`) }, h(KindIcon, { kind: row.kind }))),
          h('div', { className: 'aw-queue-preview' }, queuePreview(row)),
          h('div', { className: 'aw-queue-meta' },
            h(Tag, null, t(`status.${String(row.status || 'unlabeled')}`)),
            row.myStatus && row.myStatus !== 'none' && row.myStatus !== row.status ? h(Tag, { tone: 'tone' }, `${t('actor.label')}: ${t(`status.${String(row.myStatus)}`)}`) : null,
            row.review === 'approved' ? h(Tag, { tone: 'ok' }, t('review.approved')) : null,
            row.review === 'rejected' ? h(Tag, { tone: 'bad' }, t('review.rejected')) : null,
            row.batch ? h(Tag, null, String(row.batch)) : null))) ,
          props.loading && rows.length > 0 ? h('div', { style: { padding: 8 } }, h(Loading, null)) : null,
          !props.hasMore && rows.length > 0 ? h('div', { className: 'aw-dim', style: { padding: '8px 10px', fontSize: 11 } }, t('queue.end')) : null));
    }

    /* ===================================================================== *
     * 13. Item viewers
     * ===================================================================== */

    /** Render highlighted spans over plain text (offsets are UTF-16). */
    function highlightedText(text, spans) {
      const source = String(text || '');
      const list = Array.isArray(spans)
        ? spans.filter((span) => span && num(span.end) > num(span.start) && num(span.start) >= 0 && num(span.end) <= source.length)
          .slice().sort((a, b) => num(a.start) - num(b.start))
        : [];
      if (list.length === 0) return [source];
      const parts = [];
      let cursor = 0;
      let key = 0;
      for (const span of list) {
        const start = Math.max(cursor, num(span.start));
        const end = Math.max(start, num(span.end));
        if (start > cursor) parts.push(source.slice(cursor, start));
        if (end > start) {
          parts.push(h('span', {
            key: `span-${key}`,
            title: `${String(span.label || '')} ${String(span.text || '')}`,
            style: {
              background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent)',
              borderBottom: '1px dashed var(--dsw-alias-state-business-primary)',
              borderRadius: 2,
            },
          }, source.slice(start, end)));
          key += 1;
        }
        cursor = Math.max(cursor, end);
      }
      if (cursor < source.length) parts.push(source.slice(cursor));
      return parts;
    }

    /** Text item viewer with span selection. */
    function TextViewer(props) {
      const item = props.item || {};
      const text = item.payload && typeof item.payload.text === 'string' ? item.payload.text : '';
      const fields = props.fields || [];
      const spanField = fields.find((field) => field.type === 'spans' && fieldVisible(field, item));
      const spans = spanField && Array.isArray(props.labels[spanField.id]) ? props.labels[spanField.id] : [];
      const options = spanField ? optionsOf(spanField) : [];
      const [newLabel, setNewLabel] = React.useState(options.length > 0 ? options[0].value : '');
      const [pending, setPending] = React.useState(null);
      const bodyRef = React.useRef(null);
      React.useEffect(() => {
        setPending(null);
      }, [item.id]);
      if (text === '') return h(Empty, { icon: 'text', title: t('viewer.textEmpty') });
      const captureSelection = () => {
        if (!spanField) return;
        const container = bodyRef.current;
        if (!container) return;
        try {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
          const range = selection.getRangeAt(0);
          if (!container.contains(range.commonAncestorContainer)) return;
          const prefix = document.createRange();
          prefix.selectNodeContents(container);
          prefix.setEnd(range.startContainer, range.startOffset);
          const start = prefix.toString().length;
          const end = start + range.toString().length;
          if (end <= start) return;
          setPending({ start, end, text: text.slice(start, end) });
        } catch (error) { /* ignore */ }
      };
      const addSpan = () => {
        if (!pending || !spanField) return;
        const next = spans.concat([{ start: pending.start, end: pending.end, label: newLabel, text: pending.text }]);
        props.setFieldValue(spanField.id, next);
        setPending(null);
        try { window.getSelection().removeAllRanges(); } catch (error) { /* ignore */ }
      };
      const removeSpan = (index) => {
        if (!spanField) return;
        props.setFieldValue(spanField.id, spans.filter((span, position) => position !== index));
      };
      return h('div', { className: 'aw-col', style: { gap: 8 } },
        spanField ? h('div', { className: 'aw-row aw-wrap' },
          h(Btn, { icon: 'plus', onClick: captureSelection, disabled: Boolean(pending) }, t('viewer.addSpan')),
          h('span', { className: 'aw-dim', style: { fontSize: 11 } }, t('viewer.spansCount', { n: spans.length }))) : null,
        spanField ? h('div', { className: 'aw-row aw-wrap' },
          options.length > 0 ? h('select', { className: 'aw-select', value: newLabel, onChange: (event) => setNewLabel(event.target.value), 'aria-label': t('viewer.spanLabel') },
            options.map((option) => h('option', { key: option.value, value: option.value }, option.label)))
            : h('input', { className: 'aw-input', style: { maxWidth: 160 }, value: newLabel, placeholder: t('viewer.spanLabel'), onChange: (event) => setNewLabel(event.target.value) }),
          pending
            ? h(React.Fragment, null,
              h(Btn, { variant: 'primary', onClick: addSpan }, t('actions.add')),
              h('span', { className: 'aw-dim', style: { fontSize: 11 } }, `${pending.start}–${pending.end}: ${pending.text}`))
            : h('span', { className: 'aw-dim', style: { fontSize: 11 } }, t('viewer.selectFirst'))) : null,
        h('div', { className: 'aw-text-body', ref: bodyRef, onMouseUp: captureSelection, onKeyUp: captureSelection },
          highlightedText(text, spans)),
        spans.length > 0 ? h('div', { className: 'aw-field-list' }, spans.map((span, index) => h('div', { className: 'aw-row', key: `${num(span.start)}-${num(span.end)}-${index}` },
          h('span', { className: 'aw-tag' }, `${num(span.start)}–${num(span.end)}`),
          options.length > 0
            ? h('select', {
              className: 'aw-select',
              value: span.label || '',
              onChange: (event) => {
                const next = spans.slice();
                next[index] = { ...next[index], label: event.target.value };
                props.setFieldValue(spanField.id, next);
              },
            }, options.map((option) => h('option', { key: option.value, value: option.value }, option.label)))
            : null,
          h('span', { className: 'aw-ellipsis', style: { flex: '1 1 auto', fontSize: 12 } }, String(span.text || '')),
          h('button', { type: 'button', className: 'aw-remove', 'aria-label': t('actions.delete'), onClick: () => removeSpan(index) }, '×')))) : null);
    }

    /** Image viewer with a canvas bbox editor (normalized 0..1 coordinates). */
    function ImageViewer(props) {
      const item = props.item || {};
      const media = Array.isArray(props.media) ? props.media : [];
      const first = media[0];
      const src = first && (first.url || first.path) ? String(first.url || first.path) : '';
      const fields = props.fields || [];
      const boxField = fields.find((field) => field.type === 'bbox' && fieldVisible(field, item));
      const boxes = boxField && Array.isArray(props.labels[boxField.id]) ? props.labels[boxField.id] : [];
      const options = boxField ? optionsOf(boxField) : [];
      const stageRef = React.useRef(null);
      const imgRef = React.useRef(null);
      const canvasRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const [selected, setSelected] = React.useState(-1);
      const [size, setSize] = React.useState({ w: 0, h: 0 });
      const [failed, setFailed] = React.useState(false);
      const setBoxes = React.useCallback((next) => {
        if (boxField) props.setFieldValue(boxField.id, next);
      }, [boxField && boxField.id, props.setFieldValue]);
      const draw = React.useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;
        const rect = img.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        const base = tokenColor('--dsw-alias-state-business-primary', img, 'color');
        const accent = tokenColor('--dsw-alias-state-success-primary', img, 'color');
        context.font = '11px sans-serif';
        context.lineWidth = 1.5;
        boxes.forEach((box, index) => {
          if (!box) return;
          const x = num(box.x) * width;
          const y = num(box.y) * height;
          const w = num(box.w) * width;
          const hgt = num(box.h) * height;
          const active = index === selected;
          context.strokeStyle = active ? accent : base;
          context.globalAlpha = 0.18;
          context.fillStyle = active ? accent : base;
          context.fillRect(x, y, w, hgt);
          context.globalAlpha = 1;
          context.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, hgt - 1));
          const label = String(box.label || '');
          if (label) {
            context.fillStyle = active ? accent : base;
            context.fillText(label, x + 3, Math.max(11, y - 3));
          }
          if (active) {
            context.fillStyle = accent;
            for (const [hx, hy] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]) {
              context.fillRect(x + hx * w - 3, y + hy * hgt - 3, 6, 6);
            }
          }
        });
      }, [boxes, selected]);
      React.useEffect(() => {
        draw();
      }, [draw, size.w, size.h]);
      React.useEffect(() => {
        const stage = stageRef.current;
        if (!stage || typeof ResizeObserver !== 'function') return undefined;
        const observer = new ResizeObserver(() => {
          const img = imgRef.current;
          if (img) setSize({ w: img.clientWidth, h: img.clientHeight });
        });
        observer.observe(stage);
        return () => observer.disconnect();
      }, []);
      React.useEffect(() => { setSelected(-1); setFailed(false); }, [item.id]);
      if (!src) return h(Empty, { icon: 'image', title: failed ? t('viewer.mediaMissing') : t('viewer.imageEmpty') });
      const pointOf = (event) => {
        const img = imgRef.current;
        if (!img) return { x: 0, y: 0 };
        const rect = img.getBoundingClientRect();
        return {
          x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
          y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
        };
      };
      const handleAt = (box, point) => {
        if (!box) return null;
        const thresholdX = 10 / Math.max(1, size.w);
        const thresholdY = 10 / Math.max(1, size.h);
        const x = num(box.x); const y = num(box.y); const w = num(box.w); const hgt = num(box.h);
        const nearX = (value) => Math.abs(point.x - value) <= thresholdX;
        const nearY = (value) => Math.abs(point.y - value) <= thresholdY;
        const inX = point.x >= x - thresholdX && point.x <= x + w + thresholdX;
        const inY = point.y >= y - thresholdY && point.y <= y + hgt + thresholdY;
        if (!inX || !inY) return null;
        if (nearX(x) && nearY(y)) return 'nw';
        if (nearX(x + w) && nearY(y)) return 'ne';
        if (nearX(x) && nearY(y + hgt)) return 'sw';
        if (nearX(x + w) && nearY(y + hgt)) return 'se';
        if (nearX(x)) return 'w';
        if (nearX(x + w)) return 'e';
        if (nearY(y)) return 'n';
        if (nearY(y + hgt)) return 's';
        return null;
      };
      const onPointerDown = (event) => {
        if (!boxField) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
        const point = pointOf(event);
        const selectedBox = boxes[selected];
        const handle = handleAt(selectedBox, point);
        if (handle) {
          dragRef.current = { mode: 'resize', handle, index: selected, start: point, origin: clone(selectedBox) };
          return;
        }
        let hit = -1;
        for (let index = boxes.length - 1; index >= 0; index -= 1) {
          const box = boxes[index];
          if (!box) continue;
          if (point.x >= num(box.x) && point.x <= num(box.x) + num(box.w) && point.y >= num(box.y) && point.y <= num(box.y) + num(box.h)) {
            hit = index;
            break;
          }
        }
        if (hit >= 0) {
          setSelected(hit);
          dragRef.current = { mode: 'move', index: hit, start: point, origin: clone(boxes[hit]) };
          return;
        }
        const label = options.length > 0 ? options[0].value : '';
        const next = boxes.concat([{ x: point.x, y: point.y, w: 0, h: 0, label, text: '' }]);
        setBoxes(next);
        setSelected(next.length - 1);
        dragRef.current = { mode: 'create', index: next.length - 1, start: point, origin: { x: point.x, y: point.y, w: 0, h: 0 } };
      };
      const onPointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const point = pointOf(event);
        const next = boxes.slice();
        const box = next[drag.index];
        if (!box) return;
        if (drag.mode === 'create' || drag.mode === 'resize') {
          if (drag.mode === 'create') {
            box.x = Math.min(drag.start.x, point.x);
            box.y = Math.min(drag.start.y, point.y);
            box.w = Math.abs(point.x - drag.start.x);
            box.h = Math.abs(point.y - drag.start.y);
          } else {
            const origin = drag.origin;
            let x = num(origin.x); let y = num(origin.y); let w = num(origin.w); let hgt = num(origin.h);
            const handle = drag.handle || '';
            if (handle.includes('e')) w = clamp(origin.w + (point.x - drag.start.x), 0.005, 1 - x);
            if (handle.includes('s')) hgt = clamp(origin.h + (point.y - drag.start.y), 0.005, 1 - y);
            if (handle.includes('w')) {
              x = clamp(origin.x + (point.x - drag.start.x), 0, origin.x + origin.w - 0.005);
              w = origin.w + (origin.x - x);
              w = clamp(w, 0.005, 1 - x);
            }
            if (handle.includes('n')) {
              y = clamp(origin.y + (point.y - drag.start.y), 0, origin.y + origin.h - 0.005);
              hgt = origin.h + (origin.y - y);
              hgt = clamp(hgt, 0.005, 1 - y);
            }
            box.x = x; box.y = y; box.w = w; box.h = hgt;
          }
          next[drag.index] = box;
          setBoxes(next);
        } else if (drag.mode === 'move') {
          const origin = drag.origin;
          const dx = point.x - drag.start.x;
          const dy = point.y - drag.start.y;
          box.x = clamp(num(origin.x) + dx, 0, 1 - num(origin.w));
          box.y = clamp(num(origin.y) + dy, 0, 1 - num(origin.h));
          next[drag.index] = box;
          setBoxes(next);
        }
      };
      const onPointerUp = (event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        try { canvasRef.current && canvasRef.current.releasePointerCapture(event.pointerId); } catch (error) { /* ignore */ }
        if (!drag) return;
        if (drag.mode === 'create') {
          const box = boxes[drag.index];
          if (!box || num(box.w) < 0.01 || num(box.h) < 0.01) {
            setBoxes(boxes.filter((entry, index) => index !== drag.index));
            setSelected(-1);
          }
        }
      };
      const updateSelected = (patch) => {
        if (selected < 0 || !boxField) return;
        const next = boxes.slice();
        next[selected] = { ...next[selected], ...patch };
        setBoxes(next);
      };
      const removeSelected = () => {
        if (selected < 0 || !boxField) return;
        setBoxes(boxes.filter((entry, index) => index !== selected));
        setSelected(-1);
      };
      const current = selected >= 0 && selected < boxes.length ? boxes[selected] : undefined;
      return h('div', { className: 'aw-col', style: { gap: 8 } },
        h('div', { className: 'aw-row aw-wrap' },
          h('span', { className: 'aw-dim', style: { fontSize: 11 } }, boxField ? t('viewer.addBoxHint') : ''),
          h('span', { className: 'aw-spacer' }),
          h('span', { className: 'aw-tag' }, t('viewer.boxCount', { n: boxes.length }))),
        h('div', { className: 'aw-image-stage', ref: stageRef },
          h('img', {
            ref: imgRef,
            src,
            alt: String(item.id || ''),
            onLoad: (event) => setSize({ w: event.currentTarget.clientWidth, h: event.currentTarget.clientHeight }),
            onError: () => setFailed(true),
          }),
          h('canvas', {
            ref: canvasRef,
            className: 'aw-image-canvas',
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
          })),
        current ? h('div', { className: 'aw-box-controls' },
          options.length > 0
            ? h('select', {
              className: 'aw-select',
              'aria-label': t('viewer.boxLabel'),
              value: current.label || '',
              onChange: (event) => updateSelected({ label: event.target.value }),
            }, options.map((option) => h('option', { key: option.value, value: option.value }, option.label)))
            : h('input', { className: 'aw-input', style: { maxWidth: 120 }, value: current.label || '', placeholder: t('viewer.boxLabel'), onChange: (event) => updateSelected({ label: event.target.value }) }),
          h('input', {
            className: 'aw-input',
            style: { maxWidth: 200 },
            value: current.text || '',
            placeholder: t('viewer.boxText'),
            onChange: (event) => updateSelected({ text: event.target.value }),
          }),
          h(Btn, { variant: 'danger', icon: 'trash', onClick: removeSelected }, t('viewer.boxDelete'))) : null);
    }

    /** LLM pair viewer: prompt messages plus side-by-side candidates. */
    function LlmViewer(props) {
      const item = props.item || {};
      const payload = item.payload || {};
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const candidates = Array.isArray(payload.candidates) ? payload.candidates
        : Array.isArray(payload.responses) ? payload.responses
          : Array.isArray(payload.answers) ? payload.answers : [];
      if (messages.length === 0 && candidates.length === 0) return h(Empty, { icon: 'chat', title: t('viewer.llmEmpty') });
      const meta = payload.metadata || payload.meta || null;
      return h('div', { className: 'aw-col', style: { gap: 10 } },
        messages.length > 0 ? h('div', null,
          h('div', { className: 'aw-section-title', style: { marginBottom: 4 } }, t('viewer.messages')),
          h('div', { className: 'aw-llm-messages' }, messages.map((message, index) => {
            const role = message && typeof message === 'object' ? String(message.role || 'user') : 'user';
            const content = message && typeof message === 'object' ? String(message.content === undefined ? '' : message.content) : String(message);
            return h('div', { className: 'aw-llm-msg', key: index },
              h('div', { className: 'aw-llm-role' }, role),
              content);
          }))) : null,
        candidates.length > 0 ? h('div', { className: 'aw-llm-grid' }, candidates.slice(0, 4).map((candidate, index) => {
          const id = candidate && typeof candidate === 'object'
            ? String(candidate.id || candidate.key || String.fromCharCode(65 + index))
            : String.fromCharCode(65 + index);
          const model = candidate && typeof candidate === 'object' ? String(candidate.model || '') : '';
          const text = candidate && typeof candidate === 'object'
            ? String(candidate.text !== undefined ? candidate.text : candidate.content === undefined ? '' : candidate.content)
            : String(candidate);
          return h('div', { className: 'aw-card', key: `${id}-${index}` },
            h('div', { className: 'aw-card-title' },
              h(Tag, { tone: 'tone' }, id),
              model ? h('span', { className: 'aw-dim', style: { fontSize: 10 } }, model) : null),
            h('div', { className: 'aw-card-body' }, text));
        })) : null,
        meta ? h('details', { className: 'aw-details' },
          h('summary', null, t('viewer.meta')),
          h('div', { className: 'aw-meta-grid' }, Object.keys(meta).map((key) => h(React.Fragment, { key },
            h('span', null, key),
            h('span', { className: 'aw-mono' }, typeof meta[key] === 'string' ? meta[key] : JSON.stringify(meta[key])))))) : null);
    }

    /** Plain document viewer (text fallback). */
    function DocumentViewer(props) {
      const item = props.item || {};
      const text = item.payload && (typeof item.payload.text === 'string' ? item.payload.text : typeof item.payload.content === 'string' ? item.payload.content : '');
      if (text === '') return h(Empty, { icon: 'file', title: t('viewer.textEmpty') });
      return h('div', { className: 'aw-text-body' }, text);
    }

    /** Viewer dispatcher by item kind. */
    function ItemViewer(props) {
      const item = props.item;
      if (!item) return null;
      const kind = String(item.kind || 'text');
      if (kind === 'image') return h(ImageViewer, props);
      if (kind === 'video' || kind === 'audio') return h(MediaViewer, props);
      if (kind === 'llm') return h(LlmViewer, props);
      if (kind === 'document') return h(DocumentViewer, props);
      return h(TextViewer, props);
    }

    /* ===================================================================== *
     * 14. Video / audio viewer with timeline segments
     * ===================================================================== */

    /** Small timecode input that keeps a text draft while editing. */
    function TimeInput(props) {
      const [draft, setDraft] = React.useState(formatTimecode(props.value));
      const [editing, setEditing] = React.useState(false);
      React.useEffect(() => {
        if (!editing) setDraft(formatTimecode(props.value));
      }, [props.value, editing]);
      return h('input', {
        className: 'aw-input',
        value: editing ? draft : formatTimecode(props.value),
        'aria-label': props.label,
        onFocus: () => { setEditing(true); setDraft(formatTimecode(props.value)); },
        onChange: (event) => setDraft(event.target.value),
        onBlur: () => {
          setEditing(false);
          props.onCommit(parseTimecode(draft));
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        },
      });
    }

    /** Replace one segment in a list. */
    function withSegment(segments, index, patch) {
      return segments.map((segment, position) => (position === index ? { ...segment, ...patch } : segment));
    }

    /**
     * Segment table shared by the media viewer and the label form. `player`
     * carries `{ getTime, seek }` when a media element is mounted.
     */
    function SegmentTable(props) {
      const segments = Array.isArray(props.segments) ? props.segments : [];
      const options = props.options || [];
      const [internalSelected, setInternalSelected] = React.useState(-1);
      const controlled = props.selected !== undefined && props.selected !== null;
      const selected = controlled ? num(props.selected, -1) : internalSelected;
      const setSelected = React.useCallback((value) => {
        const next = Math.max(-1, num(value, -1));
        if (typeof props.onSelect === 'function') props.onSelect(next);
        else setInternalSelected(next);
      }, [props.onSelect]);
      const active = num(props.activeIndex, -1);
      const set = props.onChange;
      const current = segments[selected];
      const addAt = () => {
        const start = props.player && props.player.getTime ? Math.max(0, props.player.getTime()) : segments.length > 0 ? num(segments[segments.length - 1].end, 0) : 0;
        const duration = props.duration ? num(props.duration) : null;
        const end = duration !== null ? Math.min(duration, start + 2) : start + 2;
        const next = segments.concat([{ start, end: Math.max(end, start + 0.2), text: '', label: options.length > 0 ? options[0].value : undefined }]);
        set(next);
        setSelected(next.length - 1);
      };
      const remove = () => {
        if (selected < 0) return;
        set(segments.filter((segment, index) => index !== selected));
        setSelected(Math.max(-1, selected - 1));
      };
      const setBoundary = (which) => {
        if (selected < 0 || !props.player || !props.player.getTime) return;
        const value = Math.max(0, props.player.getTime());
        if (which === 'start') set(withSegment(segments, selected, { start: Math.min(value, num(segments[selected].end) - 0.01) }));
        else set(withSegment(segments, selected, { end: Math.max(value, num(segments[selected].start) + 0.01) }));
      };
      const split = () => {
        if (selected < 0 || !props.player || !props.player.getTime) return;
        const at = props.player.getTime();
        const segment = segments[selected];
        if (!segment || at <= num(segment.start) + 0.01 || at >= num(segment.end) - 0.01) return;
        const next = segments.slice();
        next.splice(selected, 1, { ...segment, end: at }, { ...segment, start: at, text: '' });
        set(next);
        setSelected(selected + 1);
      };
      const merge = () => {
        if (selected < 0 || selected + 1 >= segments.length) return;
        const first = segments[selected];
        const second = segments[selected + 1];
        const merged = {
          ...first,
          end: num(second.end),
          text: `${String(first.text || '')}${String(first.text || '') && String(second.text || '') ? ' ' : ''}${String(second.text || '')}`.trim(),
        };
        const next = segments.slice();
        next.splice(selected, 2, merged);
        set(next);
      };
      return h('div', { className: 'aw-col', style: { gap: 2 } },
        h('div', { className: 'aw-seg-toolbar' },
          h(Btn, { className: 'aw-mini', icon: 'plus', onClick: addAt }, t('media.addSegment')),
          h(Btn, { className: 'aw-mini', icon: 'trash', disabled: selected < 0, onClick: remove }, t('media.deleteSegment')),
          props.player ? h(Btn, { className: 'aw-mini', onClick: () => setBoundary('start'), disabled: selected < 0 }, t('actions.setStart')) : null,
          props.player ? h(Btn, { className: 'aw-mini', onClick: () => setBoundary('end'), disabled: selected < 0 }, t('actions.setEnd')) : null,
          props.player ? h(Btn, { className: 'aw-mini', onClick: split, disabled: selected < 0 }, t('actions.split')) : null,
          h(Btn, { className: 'aw-mini', disabled: selected < 0 || selected + 1 >= segments.length, onClick: merge }, t('actions.merge'))),
        segments.length === 0
          ? h('div', { className: 'aw-dim', style: { padding: '6px 2px', fontSize: 11 } }, t('media.empty'))
          : h('div', { style: { overflowX: 'auto' } },
            h('table', { className: 'aw-seg-table' },
              h('thead', null, h('tr', null,
                h('th', { style: { width: 26 } }, '#'),
                h('th', { className: 'aw-seg-time' }, t('media.start')),
                h('th', { className: 'aw-seg-time' }, t('media.end')),
                h('th', null, t('media.text')),
                h('th', { className: 'aw-seg-label' }, t('media.label')),
                h('th', null, ''))),
              h('tbody', null, segments.map((segment, index) => h('tr', {
                key: index,
                className: cn('aw-seg-row', index === selected && 'aw-on', index === active && 'aw-seg-active'),
                onClick: () => setSelected(index),
              },
              h('td', null, index + 1),
              h('td', { className: 'aw-seg-time' }, h(TimeInput, {
                value: num(segment.start),
                label: t('media.start'),
                onCommit: (value) => set(withSegment(segments, index, { start: clamp(value, 0, Math.max(0, num(segment.end) - 0.01)) })),
              })),
              h('td', { className: 'aw-seg-time' }, h(TimeInput, {
                value: num(segment.end),
                label: t('media.end'),
                onCommit: (value) => set(withSegment(segments, index, { end: Math.max(value, num(segment.start) + 0.01) })),
              })),
              h('td', { className: 'aw-seg-text' }, h('input', {
                className: 'aw-input',
                value: String(segment.text || ''),
                'aria-label': t('media.text'),
                onChange: (event) => set(withSegment(segments, index, { text: event.target.value })),
              })),
              h('td', { className: 'aw-seg-label' }, options.length > 0
                ? h('select', {
                  className: 'aw-select',
                  'aria-label': t('media.label'),
                  value: segment.label || '',
                  onChange: (event) => set(withSegment(segments, index, { label: event.target.value })),
                }, h('option', { value: '' }, t('misc.none')), options.map((option) => h('option', { key: option.value, value: option.value }, option.label)))
                : h('input', {
                  className: 'aw-input',
                  value: String(segment.label || ''),
                  onChange: (event) => set(withSegment(segments, index, { label: event.target.value })),
                })),
              h('td', { className: 'aw-seg-actions' },
                props.player ? h('button', {
                  type: 'button',
                  className: 'aw-btn aw-btn-ghost aw-mini',
                  title: t('actions.jump'),
                  onClick: (event) => { event.stopPropagation(); props.player.seek(num(segment.start)); },
                }, '▶') : null)))))));
    }

    /** Video/audio player plus segments, caption overlay and subtitle import. */
    function MediaViewer(props) {
      const item = props.item || {};
      const media = Array.isArray(props.media) ? props.media : [];
      const first = media[0];
      const src = first ? String(first.url || first.path || '') : '';
      const isAudio = String(item.kind || '') === 'audio';
      const playerRef = React.useRef(null);
      const [time, setTime] = React.useState(0);
      const [duration, setDuration] = React.useState(0);
      const [subText, setSubText] = React.useState('');
      const [showSubs, setShowSubs] = React.useState(false);
      const [failed, setFailed] = React.useState(false);
      const [segmentSelected, setSegmentSelected] = React.useState(-1);
      const fields = props.fields || [];
      const segField = fields.find((field) => field.type === 'segments' && fieldVisible(field, item));
      const segments = segField && Array.isArray(props.labels[segField.id]) ? props.labels[segField.id] : [];
      const options = segField ? optionsOf(segField) : [];
      const setSegments = React.useCallback((next) => {
        if (segField) props.setFieldValue(segField.id, next);
      }, [segField && segField.id, props.setFieldValue]);
      const player = React.useMemo(() => ({
        getTime: () => (playerRef.current ? num(playerRef.current.currentTime) : 0),
        seek: (value) => {
          if (!playerRef.current) return;
          try { playerRef.current.currentTime = Math.max(0, num(value)); } catch (error) { /* ignore */ }
        },
        play: () => { if (playerRef.current) playerRef.current.play().catch(() => {}); },
        pause: () => { if (playerRef.current) playerRef.current.pause(); },
      }), []);
      const activeIndex = segments.findIndex((segment) => time >= num(segment.start) && time < num(segment.end));
      const activeSegment = activeIndex >= 0 ? segments[activeIndex] : null;
      React.useEffect(() => {
        setTime(0);
        setFailed(false);
        setSubText('');
        setSegmentSelected(-1);
        if (!segField) return;
        const preloaded = item.payload && Array.isArray(item.payload.segments) ? item.payload.segments : null;
        if (preloaded && preloaded.length > 0 && segments.length === 0) setSegments(clone(preloaded));
      }, [item.id]);
      React.useEffect(() => {
        const onKey = (event) => {
          const target = event.target;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
          if (document.querySelector('.aw-modal')) return;
          if (event.key === ' ' || event.code === 'Space') {
            event.preventDefault();
            const playerEl = playerRef.current;
            if (!playerEl) return;
            if (playerEl.paused) player.play(); else player.pause();
            return;
          }
          if (!segField) return;
          const targetIndex = segmentSelected >= 0 ? segmentSelected : activeIndex;
          if (targetIndex < 0 || targetIndex >= segments.length) return;
          if (event.key === '[') {
            event.preventDefault();
            setSegments(withSegment(segments, targetIndex, { start: Math.max(0, Math.min(player.getTime(), num(segments[targetIndex].end) - 0.01)) }));
            return;
          }
          if (event.key === ']') {
            event.preventDefault();
            setSegments(withSegment(segments, targetIndex, { end: Math.max(num(segments[targetIndex].start) + 0.01, player.getTime()) }));
            return;
          }
          if (event.key === 'n' || event.key === 'N') {
            event.preventDefault();
            const start = player.getTime();
            const end = duration ? Math.min(duration, start + 2) : start + 2;
            setSegments(segments.concat([{ start, end: Math.max(start + 0.2, end), text: '', label: options.length > 0 ? options[0].value : undefined }]));
            setSegmentSelected(segments.length);
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [segments, segField, duration, options.length, segmentSelected, activeIndex]);
      const importSubs = (mode) => {
        const parsed = parseSubtitles(subText);
        if (parsed.length === 0) {
          toast(t('media.subsEmpty'), 'error');
          return;
        }
        setSegments(mode === 'append' ? segments.concat(parsed) : parsed);
        toast(t('media.subsParsed', { n: parsed.length }), 'success');
        setShowSubs(false);
      };
      if (!src) {
        return h('div', { className: 'aw-col', style: { gap: 8 } },
          h(Empty, { icon: isAudio ? 'audio' : 'video', title: t('media.noMedia') }),
          segField ? h(SegmentTable, { segments, options, duration, player, onChange: setSegments, activeIndex, selected: segmentSelected, onSelect: setSegmentSelected }) : null,
          segField ? h('details', { className: 'aw-details', open: showSubs, onToggle: (event) => setShowSubs(event.currentTarget.open) },
            h('summary', null, t('media.importSubs')),
            h('div', { className: 'aw-col', style: { gap: 6 } },
              h('div', { className: 'aw-field-help' }, t('media.importSubsHint')),
              h('textarea', { className: 'aw-textarea', rows: 4, value: subText, onChange: (event) => setSubText(event.target.value) }),
              h('div', { className: 'aw-row' },
                h(Btn, { onClick: () => importSubs('replace') }, t('media.replaceSegments')),
                h(Btn, { onClick: () => importSubs('append') }, t('actions.append'))))) : null);
      }
      return h('div', { className: 'aw-col', style: { gap: 8 } },
        h('div', { className: 'aw-video-wrap' },
          isAudio
            ? h('audio', {
              ref: playerRef,
              className: 'aw-media-player',
              controls: true,
              preload: 'metadata',
              src,
              onTimeUpdate: (event) => setTime(num(event.currentTarget.currentTime)),
              onLoadedMetadata: (event) => setDuration(num(event.currentTarget.duration)),
              onError: () => setFailed(true),
            })
            : h('video', {
              ref: playerRef,
              className: 'aw-media-player',
              controls: true,
              preload: 'metadata',
              src,
              onTimeUpdate: (event) => setTime(num(event.currentTarget.currentTime)),
              onLoadedMetadata: (event) => setDuration(num(event.currentTarget.duration)),
              onError: () => setFailed(true),
            }),
          activeSegment && !isAudio ? h('div', { className: 'aw-caption-overlay' }, String(activeSegment.text || '')) : null),
        failed ? h('div', { className: 'aw-validation' }, t('media.unsupported')) : null,
        isAudio && activeSegment ? h('div', { className: 'aw-text-body', style: { padding: '8px 10px', fontSize: 13 } }, String(activeSegment.text || '')) : null,
        h('div', { className: 'aw-row aw-wrap' },
          h('span', { className: 'aw-section-title' }, t('media.segments')),
          h('span', { className: 'aw-tag' }, String(segments.length)),
          h('span', { className: 'aw-spacer' }),
          h('span', { className: 'aw-dim aw-mono', style: { fontSize: 11 } }, `${formatTimecode(time)} / ${formatTimecode(duration)}`)),
        segField
          ? h(React.Fragment, null,
            h(SegmentTable, { segments, options, duration, player, onChange: setSegments, activeIndex, selected: segmentSelected, onSelect: setSegmentSelected }),
            h('details', { className: 'aw-details', open: showSubs, onToggle: (event) => setShowSubs(event.currentTarget.open) },
              h('summary', null, t('media.importSubs')),
              h('div', { className: 'aw-col', style: { gap: 6 } },
                h('div', { className: 'aw-field-help' }, t('media.importSubsHint')),
                h('textarea', { className: 'aw-textarea', rows: 4, value: subText, onChange: (event) => setSubText(event.target.value) }),
                h('div', { className: 'aw-row' },
                  h(Btn, { onClick: () => importSubs('replace') }, t('media.replaceSegments')),
                  h(Btn, { onClick: () => importSubs('append') }, t('actions.append'))))))
          : h('div', { className: 'aw-dim', style: { fontSize: 11 } }, t('form.noFields')));
    }

    /* ===================================================================== *
     * 15. Dynamic label form
     * ===================================================================== */

    /** JSON field with a text draft; commits only valid JSON. */
    function JsonField(props) {
      const [draft, setDraft] = React.useState(() => {
        if (props.value === undefined || props.value === null || props.value === '') return '';
        return typeof props.value === 'string' ? props.value : JSON.stringify(props.value, null, 2);
      });
      const [invalid, setInvalid] = React.useState(false);
      React.useEffect(() => {
        if (props.value === undefined || props.value === null || props.value === '') setDraft('');
        else if (typeof props.value === 'string') setDraft(props.value);
        else setDraft(JSON.stringify(props.value, null, 2));
      }, [props.fieldId]);
      return h('div', { className: 'aw-col', style: { gap: 4 } },
        h('textarea', {
          className: 'aw-textarea aw-mono',
          rows: 4,
          value: draft,
          onChange: (event) => {
            const next = event.target.value;
            setDraft(next);
            if (next.trim() === '') {
              setInvalid(false);
              props.onChange('');
              return;
            }
            try {
              const parsed = JSON.parse(next);
              setInvalid(false);
              props.onChange(parsed);
            } catch (error) {
              setInvalid(true);
            }
          },
        }),
        invalid ? h('div', { className: 'aw-field-error' }, t('form.jsonInvalid')) : null);
    }

    /** Tag list editor. */
    function TagsField(props) {
      const value = Array.isArray(props.value) ? props.value : [];
      const [draft, setDraft] = React.useState('');
      const add = () => {
        const trimmed = draft.trim();
        if (trimmed === '') return;
        if (!value.includes(trimmed)) props.onChange(value.concat([trimmed]));
        setDraft('');
      };
      return h('div', { className: 'aw-col', style: { gap: 4 } },
        value.length > 0 ? h('div', { className: 'aw-chiplist' }, value.map((tag) => h('span', { className: 'aw-tag', key: tag },
          String(tag),
          h('button', { type: 'button', className: 'aw-remove', 'aria-label': t('actions.delete'), onClick: () => props.onChange(value.filter((entry) => entry !== tag)) }, '×')))) : null,
        h('div', { className: 'aw-row' },
          h('input', {
            className: 'aw-input',
            value: draft,
            placeholder: t('form.tagsPlaceholder'),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            },
          }),
          h(Btn, { onClick: add, icon: 'plus' }, t('form.addTag'))));
    }

    /** One dynamic form control for a schema field type. */
    function FieldControl(props) {
      const field = props.field;
      const value = props.value;
      const set = props.onChange;
      const options = optionsOf(field);
      switch (field.type) {
        case 'textarea':
          return h('textarea', {
            className: 'aw-textarea',
            rows: 3,
            value: value === undefined || value === null ? '' : String(value),
            placeholder: field.placeholder || t('form.placeholder'),
            onChange: (event) => set(event.target.value),
          });
        case 'number': {
          const min = field.min === undefined ? undefined : num(field.min);
          const max = field.max === undefined ? undefined : num(field.max);
          return h('input', {
            className: 'aw-input',
            type: 'number',
            min,
            max,
            step: field.step === undefined ? 'any' : String(field.step),
            value: value === undefined || value === null ? '' : String(value),
            placeholder: field.placeholder || t('form.placeholder'),
            onChange: (event) => set(event.target.value === '' ? '' : num(event.target.value)),
          });
        }
        case 'select':
          return h('select', {
            className: 'aw-select',
            value: value === undefined || value === null ? '' : String(value),
            onChange: (event) => set(event.target.value === '' ? '' : event.target.value),
          }, h('option', { value: '' }, t('misc.none')),
          options.map((option) => h('option', { key: option.value, value: option.value }, option.label)));
        case 'multiselect': {
          const list = Array.isArray(value) ? value.map(String) : [];
          return h('div', { className: 'aw-options' }, options.map((option) => h('button', {
            key: option.value,
            type: 'button',
            className: cn('aw-option', list.includes(option.value) && 'aw-on'),
            'aria-pressed': list.includes(option.value),
            onClick: () => set(list.includes(option.value) ? list.filter((entry) => entry !== option.value) : list.concat([option.value])),
          }, option.label)));
        }
        case 'boolean':
          return h(Switch, { checked: Boolean(value), label: field.label || field.id, onChange: (next) => set(next) }, Boolean(value) ? t('status.approved') : t('misc.none'));
        case 'rating': {
          const min = field.min === undefined ? 1 : num(field.min, 1);
          const max = field.max === undefined ? 5 : num(field.max, 5);
          const items = [];
          for (let score = min; score <= max; score += 1) items.push(score);
          return h('div', { className: 'aw-ratings' }, items.map((score) => h('button', {
            key: score,
            type: 'button',
            className: cn('aw-rating', num(value) === score && 'aw-on'),
            'aria-pressed': num(value) === score,
            title: t('form.ratingValue', { n: score }),
            onClick: () => set(score),
          }, score)));
        }
        case 'tags':
          return h(TagsField, { value, onChange: set });
        case 'segments': {
          const list = Array.isArray(value) ? value : [];
          return h('div', { className: 'aw-summary' },
            h('div', null, t('form.segmentsCount', { n: list.length })),
            h('div', { className: 'aw-field-help' }, t('form.segmentsHint')));
        }
        case 'bbox': {
          const list = Array.isArray(value) ? value : [];
          return h('div', { className: 'aw-summary' },
            h('div', null, t('viewer.boxCount', { n: list.length })),
            list.length > 0 ? h('div', { className: 'aw-field-list' }, list.map((box, index) => h('div', { className: 'aw-row', key: index, style: { fontSize: 11 } },
              options.length > 0
                ? h('select', {
                  className: 'aw-select',
                  style: { height: 22, fontSize: 11 },
                  value: (box && box.label) || '',
                  onChange: (event) => set(list.map((entry, position) => (position === index ? { ...entry, label: event.target.value } : entry))),
                }, options.map((option) => h('option', { key: option.value, value: option.value }, option.label)))
                : null,
              h('span', { className: 'aw-mono' }, `${Math.round(num(box && box.w) * 100)}×${Math.round(num(box && box.h) * 100)}`),
              h('span', { className: 'aw-ellipsis', style: { flex: '1 1 auto' } }, String((box && box.text) || '')),
              h('button', { type: 'button', className: 'aw-remove', 'aria-label': t('actions.delete'), onClick: () => set(list.filter((entry, position) => position !== index)) }, '×')))) : null,
            h('div', { className: 'aw-field-help' }, t('form.bboxHint')));
        }
        case 'spans': {
          const list = Array.isArray(value) ? value : [];
          return h('div', { className: 'aw-summary' },
            h('div', null, t('viewer.spansCount', { n: list.length })),
            list.length > 0 ? h('div', { className: 'aw-field-list' }, list.map((span, index) => h('div', { className: 'aw-row', key: index, style: { fontSize: 11 } },
              options.length > 0
                ? h('select', {
                  className: 'aw-select',
                  style: { height: 22, fontSize: 11 },
                  value: (span && span.label) || '',
                  onChange: (event) => set(list.map((entry, position) => (position === index ? { ...entry, label: event.target.value } : entry))),
                }, options.map((option) => h('option', { key: option.value, value: option.value }, option.label)))
                : null,
              h('span', { className: 'aw-ellipsis', style: { flex: '1 1 auto' } }, String((span && span.text) || '')),
              h('button', { type: 'button', className: 'aw-remove', 'aria-label': t('actions.delete'), onClick: () => set(list.filter((entry, position) => position !== index)) }, '×')))) : null,
            h('div', { className: 'aw-field-help' }, t('form.spansHint')));
        }
        case 'json':
          return h(JsonField, { fieldId: field.id, value, onChange: set });
        case 'text':
        default:
          return h('input', {
            className: 'aw-input',
            value: value === undefined || value === null ? '' : String(value),
            placeholder: field.placeholder || t('form.placeholder'),
            onChange: (event) => set(event.target.value),
          });
      }
    }

    /** The dynamic form generated from the project schema. */
    function LabelForm(props) {
      const fields = props.fields || [];
      const item = props.item;
      const visible = fields.filter((field) => fieldVisible(field, item));
      if (visible.length === 0) return h('div', { className: 'aw-dim' }, t('form.noFields'));
      return h('div', { className: 'aw-col', style: { gap: 12 } }, visible.map((field) => h(FieldShell, {
        key: field.id,
        label: field.label || field.id,
        required: Boolean(field.required),
        help: field.help || undefined,
        error: props.errors && props.errors[field.id] ? String(props.errors[field.id]) : undefined,
      }, h(FieldControl, {
        field,
        value: props.labels ? props.labels[field.id] : emptyFieldValue(field),
        onChange: (value) => props.onChange(field.id, value),
      }))));
    }

    /* ===================================================================== *
     * 16. Review mode
     * ===================================================================== */

    /** Per-actor comparison table for review mode. */
    function CompareTable(props) {
      const fields = (props.fields || []).filter((field) => fieldVisible(field, props.item));
      const annotations = (props.annotations || []).filter((annotation) => annotation && annotation.labels && typeof annotation.labels === 'object');
      if (fields.length === 0) return null;
      const actors = annotations.map((annotation) => ({
        key: String(annotation.actorId || annotation.actorName || Math.random()),
        name: String(annotation.actorName || annotation.actorId || t('actor.anonymous')),
        labels: annotation.labels,
      }));
      return h('div', { className: 'aw-col', style: { gap: 6 } },
        h('div', { className: 'aw-row' },
          h('span', { className: 'aw-section-title' }, t('review.compare')),
          h('span', { className: 'aw-dim', style: { fontSize: 11 } }, t('review.adoptHint'))),
        actors.length === 0
          ? h('div', { className: 'aw-dim', style: { fontSize: 12 } }, t('review.noAnnotations'))
          : h('div', { className: 'aw-compare-wrap' },
            h('table', { className: 'aw-compare' },
              h('thead', null, h('tr', null,
                h('th', null, t('stats.field')),
                actors.map((actor) => h('th', { key: actor.key },
                  h('div', { className: 'aw-row', style: { gap: 6 } },
                    h('span', { className: 'aw-ellipsis', style: { maxWidth: 130 } }, actor.name),
                    h('button', {
                      type: 'button',
                      className: 'aw-btn aw-btn-primary aw-mini',
                      onClick: () => props.onAdopt(actor.labels),
                    }, t('actions.apply'))))),
                h('th', null, t('review.final')))),
              h('tbody', null, fields.map((field) => {
                const values = actors.map((actor) => actor.labels ? actor.labels[field.id] : undefined);
                const comparable = values.filter((value) => !isEmptyValue(value));
                const distinct = [];
                for (const value of comparable) {
                  if (!distinct.some((entry) => deepEqual(entry, value))) distinct.push(value);
                }
                const differs = distinct.length > 1;
                return h('tr', { key: field.id },
                  h('td', { className: 'aw-compare-field' },
                    h('div', null, field.label || field.id),
                    h('div', { className: 'aw-dim', style: { fontSize: 10 } }, String(field.type || ''))),
                  actors.map((actor) => h('td', {
                    key: actor.key,
                    className: cn(differs && 'aw-compare-diff'),
                  }, h('div', { style: { whiteSpace: 'pre-wrap', fontSize: 11, maxWidth: 240 } }, formatValue(field, actor.labels ? actor.labels[field.id] : undefined)))),
                  h('td', null, h('div', { style: { whiteSpace: 'pre-wrap', fontSize: 11, maxWidth: 240 } }, formatValue(field, props.finalLabels ? props.finalLabels[field.id] : undefined))));
              })))));
    }

    /** Right-hand review pane: final labels, comment and decision. */
    function ReviewPanel(props) {
      const comment = props.comment || '';
      return h(React.Fragment, null,
        h('div', { className: 'aw-pane-head' },
          h('span', { className: 'aw-pane-title' }, t('review.final')),
          h('span', { className: 'aw-spacer' }),
          props.review ? h(Tag, { tone: props.review === 'approved' ? 'ok' : props.review === 'rejected' ? 'bad' : 'tone' }, t(`review.${props.review === 'none' ? 'pending' : props.review}`)) : null),
        h('div', { className: 'aw-form-body' },
          h(LabelForm, {
            fields: props.fields,
            item: props.item,
            labels: props.finalLabels,
            errors: props.errors,
            onChange: props.onChange,
          }),
          h(FieldShell, { label: t('review.comment') },
            h('textarea', {
              className: 'aw-textarea',
              rows: 3,
              value: comment,
              placeholder: t('review.commentPlaceholder'),
              onChange: (event) => props.onComment(event.target.value),
            })),
          props.reviews && props.reviews.length > 0 ? h('details', { className: 'aw-details' },
            h('summary', null, t('review.history')),
            h('div', { className: 'aw-field-list' }, props.reviews.slice(-5).reverse().map((review, index) => h('div', { key: index, style: { fontSize: 11 } },
              h('span', { className: 'aw-row', style: { gap: 4 } },
                h(Tag, { tone: review.decision === 'approve' ? 'ok' : 'bad' }, t(review.decision === 'approve' ? 'review.approved' : 'review.rejected')),
                h('span', { className: 'aw-dim' }, String(review.actorName || '')),
                h('span', { className: 'aw-dim' }, formatStamp(review.ts))),
              review.comment ? h('div', { className: 'aw-muted', style: { marginTop: 2 } }, String(review.comment)) : null)))) : null),
        h('div', { className: 'aw-review-actions aw-form-actions' },
          h(Btn, {
            variant: 'success',
            large: true,
            icon: 'check',
            disabled: props.busy,
            onClick: () => props.onDecision('approve', comment),
          }, t('review.approve')),
          h(Btn, {
            variant: 'danger',
            large: true,
            icon: 'close',
            disabled: props.busy,
            onClick: () => props.onDecision('reject', comment),
          }, t('review.reject')),
          h(Btn, { icon: 'play', disabled: props.busy, onClick: props.onNext }, t('review.next'))));
    }

    /* ===================================================================== *
     * 17. Stats view
     * ===================================================================== */

    /** Counters, actor progress, distributions, agreement and activity. */
    function StatsView(props) {
      const stats = props.stats || null;
      const counts = (stats && stats.counts) || {};
      const agreement = props.agreement || null;
      const activity = Array.isArray(props.activity) ? props.activity : [];
      const cards = [
        ['total', t('stats.total'), num(counts.total)],
        ['unlabeled', t('stats.unlabeled'), num(counts.unlabeled)],
        ['in_progress', t('stats.in_progress'), num(counts.in_progress)],
        ['submitted', t('stats.submitted'), num(counts.submitted)],
        ['approved', t('stats.approved'), num(counts.approved)],
        ['rejected', t('stats.rejected'), num(counts.rejected)],
        ['flagged', t('stats.flagged'), num(counts.flagged)],
        ['backlog', t('stats.reviewBacklog'), num(stats && stats.reviewBacklog)],
      ];
      const actors = stats && Array.isArray(stats.actors) ? stats.actors.slice(0, 20) : [];
      const distribution = stats && isObject(stats.labelDistribution) ? stats.labelDistribution : {};
      const distributionKeys = Object.keys(distribution).slice(0, 12);
      const maxCount = Math.max(1, ...distributionKeys.map((key) => num(distribution[key])));
      const totalItems = Math.max(1, num(counts.total));
      const fields = agreement && Array.isArray(agreement.fields) ? agreement.fields : [];
      return h('div', { className: 'aw-grow aw-col', style: { minHeight: 0 } },
        h('div', { className: 'aw-pane-head' },
          h('span', { className: 'aw-pane-title' }, t('stats.title')),
          h('span', { className: 'aw-spacer' }),
          h(Btn, { icon: 'refresh', onClick: props.onRefresh }, t('actions.refresh'))),
        h('div', { className: 'aw-stats-body' },
          props.loading ? h(Loading, { text: t('stats.loading') }) : null,
          props.error ? h('div', { className: 'aw-validation' }, String(props.error)) : null,
          h('div', { className: 'aw-stat-cards' }, cards.map(([id, label, value]) => h('div', { className: 'aw-stat-card', key: id },
            h('div', { className: 'aw-stat-value' }, String(value)),
            h('div', { className: 'aw-stat-label' }, label)))),
          h('div', { className: 'aw-section' },
            h('div', { className: 'aw-section-title' }, t('validate.title')),
            h(ValidationPanel, { projectId: props.projectId })),
          h('div', { className: 'aw-section' },
            h('div', { className: 'aw-section-title' }, t('stats.actorProgress')),
            actors.length === 0 ? h('div', { className: 'aw-dim' }, t('stats.noActors')) : h('div', { className: 'aw-actor-row' },
              h('span', null, ''),
              h('span', null, ''),
              h('span', { className: 'aw-dim' }, `${t('stats.submitted')} / ${t('stats.approved')}`),
              actors.map((actor, index) => h(React.Fragment, { key: actor.actorId || index },
                h('span', { className: 'aw-ellipsis' }, String(actor.actorName || actor.actorId || t('actor.anonymous'))),
                h(ProgressBar, { value: num(actor.submitted), total: totalItems, title: `${num(actor.submitted)}/${totalItems}` }),
                h('span', { className: 'aw-dim', style: { fontSize: 11, whiteSpace: 'nowrap' } }, `${num(actor.submitted)} / ${num(actor.approved)}`))))),
          h('div', { className: 'aw-section' },
            h('div', { className: 'aw-section-title' }, t('stats.labelDistribution')),
            distributionKeys.length === 0 ? h('div', { className: 'aw-dim' }, t('stats.noDistribution')) : h('div', { className: 'aw-bars' },
              distributionKeys.map((key) => h('div', { className: 'aw-bar-row', key },
                h('span', { className: 'aw-ellipsis' }, key),
                h('div', { className: 'aw-progress' }, h('div', { className: 'aw-progress-bar', style: { width: `${(num(distribution[key]) / maxCount) * 100}%` } })),
                h('span', { className: 'aw-dim' }, String(num(distribution[key]))))))),
          h('div', { className: 'aw-section' },
            h('div', { className: 'aw-section-title' }, t('stats.agreement')),
            agreement && agreement.overall !== null && agreement.overall !== undefined
              ? h('div', { className: 'aw-row' }, h('span', { className: 'aw-muted' }, t('stats.overall')), h('span', { className: 'aw-tag aw-tag-ok' }, `${Math.round(num(agreement.overall) * 100)}%`), h('span', { className: 'aw-dim' }, t('misc.itemCount', { n: num(agreement.itemsCompared) })))
              : h('div', { className: 'aw-dim' }, t('stats.noAgreement')),
            fields.length > 0 ? h('div', { className: 'aw-compare-wrap', style: { maxHeight: 240 } },
              h('table', { className: 'aw-compare' },
                h('thead', null, h('tr', null,
                  h('th', null, t('stats.field')),
                  h('th', null, t('stats.type')),
                  h('th', null, t('stats.pairs')),
                  h('th', null, t('stats.score')))),
                h('tbody', null, fields.map((row) => h('tr', { key: String(row.field) },
                  h('td', null, String(row.field)),
                  h('td', null, String(row.type || '')),
                  h('td', null, String(num(row.pairs))),
                  h('td', null, h('div', { className: 'aw-row', style: { gap: 6 } },
                    h(ProgressBar, { value: num(row.score) * 100, total: 100 }),
                    h('span', { className: 'aw-dim' }, `${Math.round(num(row.score) * 100)}%`)))))))) : null),
          h('div', { className: 'aw-section' },
            h('div', { className: 'aw-section-title' }, t('stats.recent')),
            activity.length === 0 ? h('div', { className: 'aw-dim' }, t('stats.noRecent')) : h('div', { className: 'aw-activity' },
              activity.slice(0, 40).map((entry, index) => h('div', { className: 'aw-activity-row', key: index },
                h('span', { className: 'aw-activity-time' }, formatStamp(entry.ts)),
                h('span', null, String(entry.actorName || '')),
                h('span', { className: 'aw-muted' }, String(entry.action || '')),
                entry.itemId ? h('span', { className: 'aw-code-inline' }, String(entry.itemId)) : null))))));
    }

    /* ===================================================================== *
     * 17b. Validation, export and project settings
     * ===================================================================== */

    /** One collapsible list of validation issues. */
    function IssueList(props) {
      const items = Array.isArray(props.items) ? props.items : [];
      if (items.length === 0) return null;
      return h('details', { className: 'aw-details', open: items.length <= 8 },
        h('summary', null, `${props.title} · ${items.length}`),
        h('div', { className: 'aw-field-list', style: { maxHeight: 190, overflow: 'auto' } },
          items.map((issue, index) => h('div', {
            key: index,
            className: 'aw-mono',
            style: {
              fontSize: 10,
              lineHeight: 1.5,
              overflowWrap: 'anywhere',
              color: props.tone === 'bad' ? 'var(--dsw-alias-state-error-primary)' : undefined,
            },
          }, issueText(issue)))));
    }

    /** Run POST /projects/:id/validate and list errors/warnings. */
    function ValidationPanel(props) {
      const [busy, setBusy] = React.useState(false);
      const [result, setResult] = React.useState(null);
      const [error, setError] = React.useState('');
      const run = async () => {
        if (!props.projectId) return;
        setBusy(true);
        setError('');
        try {
          const data = await api.validate(props.projectId, props.itemId ? { itemId: props.itemId } : {});
          setResult(data || {});
          const errors = issueList(data && data.errors);
          const warnings = issueList(data && data.warnings);
          if (data && data.ok === false) toast(t('validate.bad', { n: errors.length }), 'error');
          else toast(t('validate.ok', { checked: num(data && data.checked) }), warnings.length > 0 ? 'info' : 'success');
        } catch (failure) {
          setError(t('validate.failed', { message: errorText(failure) }));
          reportError(failure);
        } finally {
          setBusy(false);
        }
      };
      const errors = issueList(result && result.errors);
      const warnings = issueList(result && result.warnings);
      const ok = result ? result.ok !== false : null;
      return h('div', { className: 'aw-col', style: { gap: 6 } },
        h('div', { className: 'aw-row aw-wrap' },
          h(Btn, { variant: 'primary', icon: 'check', disabled: busy || !props.projectId, onClick: run }, busy ? t('validate.running') : t('validate.run')),
          result && ok ? h(Tag, { tone: 'ok' }, t('validate.ok', { checked: num(result.checked) })) : null,
          result && !ok ? h(Tag, { tone: 'bad' }, t('validate.bad', { n: errors.length })) : null,
          errors.length > 0 ? h(Tag, { tone: 'bad' }, `${t('validate.errors')} ${errors.length}`) : null,
          warnings.length > 0 ? h(Tag, { tone: 'tone' }, `${t('validate.warnings')} ${warnings.length}`) : null),
        error ? h('div', { className: 'aw-validation' }, error) : null,
        result && errors.length === 0 && warnings.length === 0
          ? h('div', { className: 'aw-dim', style: { fontSize: 11 } }, t('validate.none'))
          : null,
        h(IssueList, { title: t('validate.errors'), items: errors, tone: 'bad' }),
        h(IssueList, { title: t('validate.warnings'), items: warnings, tone: 'tone' }));
    }

    /** Export dialog: format, scope and optional current item; then file downloads. */
    function ExportModal(props) {
      const project = props.project || null;
      const projectId = project && project.id ? String(project.id) : '';
      const [format, setFormat] = React.useState('jsonl');
      const [scope, setScope] = React.useState('approved');
      const [currentOnly, setCurrentOnly] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [result, setResult] = React.useState(null);
      const [error, setError] = React.useState('');
      const formats = ['jsonl', 'csv', 'srt', 'vtt', 'coco', 'report'];
      const scopes = [
        ['approved', t('export.scope.approved')],
        ['submitted', t('export.scope.submitted')],
        ['all', t('export.scope.all')],
      ];
      const subtitle = format === 'srt' || format === 'vtt';
      const run = async () => {
        if (!projectId) return;
        if (currentOnly && !props.currentItemId) {
          setError(t('export.itemOnlyHint'));
          return;
        }
        setBusy(true);
        setError('');
        try {
          const data = await api.exportData(projectId, {
            format,
            scope,
            itemId: currentOnly && props.currentItemId ? String(props.currentItemId) : undefined,
          });
          setResult(data || {});
          toast(t('export.result'), 'success');
        } catch (failure) {
          setError(t('export.failed', { message: errorText(failure) }));
          reportError(failure);
        } finally {
          setBusy(false);
        }
      };
      const files = result && Array.isArray(result.files) ? result.files : [];
      return h(Modal, {
        title: `${t('export.title')}${project && project.name ? ` · ${String(project.name)}` : ''}`,
        onClose: props.onClose,
        wide: true,
        footer: [
          h(Btn, { key: 'close', onClick: props.onClose }, t('actions.close')),
          h(Btn, { key: 'run', variant: 'primary', icon: 'download', disabled: busy || !projectId, onClick: run }, busy ? t('export.running') : t('export.run')),
        ],
      },
      h('div', { className: 'aw-col', style: { gap: 10 } },
        h('div', { className: 'aw-field-help' }, t('export.hint')),
        h('div', { className: 'aw-split' },
          h(FieldShell, { label: t('export.format') },
            h('select', { className: 'aw-select', value: format, 'data-autofocus': true, onChange: (event) => setFormat(event.target.value) },
              formats.map((value) => h('option', { key: value, value }, value.toUpperCase())))),
          h(FieldShell, { label: t('export.scope') },
            h('select', { className: 'aw-select', value: scope, onChange: (event) => setScope(event.target.value) },
              scopes.map(([value, label]) => h('option', { key: value, value }, label))))),
        h('label', { className: 'aw-row', style: { cursor: 'pointer', gap: 6 } },
          h('input', { type: 'checkbox', checked: currentOnly, onChange: (event) => setCurrentOnly(event.target.checked) }),
          h('span', { className: 'aw-muted' }, t('export.currentItem')),
          props.currentItemId ? h('span', { className: 'aw-code-inline' }, String(props.currentItemId)) : null),
        subtitle ? h('div', { className: 'aw-field-help' }, t('export.itemOnlyHint')) : null,
        error ? h('div', { className: 'aw-validation', role: 'alert' }, error) : null,
        result ? h('div', { className: 'aw-col', style: { gap: 6 } },
          h('div', { className: 'aw-section-title' }, t('export.files')),
          files.length === 0
            ? h('div', { className: 'aw-dim' }, t('export.empty'))
            : h('div', { className: 'aw-field-list' }, files.map((file, index) => {
              const href = downloadHref(projectId, file);
              return h('div', { className: 'aw-row', key: index, style: { gap: 8, flexWrap: 'wrap' } },
                h(Icon, { name: 'file', size: 13 }),
                href
                  ? h('a', {
                    className: 'aw-btn aw-btn-ghost aw-mini',
                    href,
                    download: String(file && file.name ? file.name : ''),
                    target: '_blank',
                    rel: 'noreferrer',
                    title: t('actions.download'),
                  }, t('actions.download'), ' ', String((file && file.name) || href))
                  : h('span', { className: 'aw-mono' }, String((file && file.name) || '')),
                h('span', { className: 'aw-dim', style: { fontSize: 10 } }, bytesText(file && file.size)),
                file && file.mime ? h('span', { className: 'aw-dim', style: { fontSize: 10 } }, String(file.mime)) : null);
            })),
          h('div', { className: 'aw-field-help' }, t('export.openHint')),
          result.summary
            ? h('details', { className: 'aw-details' },
              h('summary', null, t('export.result')),
              h('div', { className: 'aw-mono', style: { fontSize: 10, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' } },
                typeof result.summary === 'string' ? result.summary : JSON.stringify(result.summary, null, 2)))
            : null)
          : null));
    }

    /** Project settings: basics, guideline, schema JSON and validation. */
    function ProjectSettingsModal(props) {
      const project = props.project || {};
      const projectId = props.projectId || (project && project.id ? String(project.id) : '');
      const [tab, setTab] = React.useState('basic');
      const [name, setName] = React.useState(String(project.name || ''));
      const [description, setDescription] = React.useState(String(project.description || ''));
      const [revision, setRevision] = React.useState(num(project.revision));
      const [busy, setBusy] = React.useState('');
      const [error, setError] = React.useState('');
      const [guide, setGuide] = React.useState({ loaded: false, loading: false, text: '', revision: null });
      const [schema, setSchema] = React.useState({ loaded: false, loading: false, text: '', revision: null, invalid: '' });
      const adopt = (data) => {
        if (data && data.project) {
          if (props.onUpdated) props.onUpdated(data);
          setRevision(num(data.project.revision, revision));
        }
      };
      const loadGuideline = async () => {
        setGuide((previous) => ({ ...previous, loading: true }));
        try {
          const data = await api.guideline(projectId);
          setGuide({ loaded: true, loading: false, text: String((data && data.text) || ''), revision: data && data.revision !== undefined ? num(data.revision) : null });
        } catch (failure) {
          setError(t('project.loadFailed', { message: errorText(failure) }));
          setGuide((previous) => ({ ...previous, loading: false, loaded: true }));
        }
      };
      const loadSchema = async () => {
        setSchema((previous) => ({ ...previous, loading: true }));
        try {
          const data = await api.schema(projectId);
          const value = data && data.schema !== undefined ? data.schema : { fields: [] };
          setSchema({
            loaded: true,
            loading: false,
            text: JSON.stringify(value, null, 2),
            revision: data && data.revision !== undefined ? num(data.revision) : null,
            invalid: '',
          });
        } catch (failure) {
          setError(t('project.loadFailed', { message: errorText(failure) }));
          setSchema((previous) => ({ ...previous, loading: false, loaded: true }));
        }
      };
      React.useEffect(() => {
        if (tab === 'guideline' && !guide.loaded && !guide.loading) loadGuideline();
        if (tab === 'schema' && !schema.loaded && !schema.loading) loadSchema();
      }, [tab]);
      const saveBasic = async () => {
        setBusy('basic');
        setError('');
        try {
          const data = await api.patchProject(projectId, {
            name: name.trim() === '' ? project.name : name.trim(),
            description: description.trim(),
            revision,
          });
          adopt(data);
          toast(t('project.nameSaved'), 'success');
          if (props.onReload) props.onReload();
        } catch (failure) {
          setError(errorText(failure));
          reportError(failure);
        } finally {
          setBusy('');
        }
      };
      const saveGuideline = async () => {
        setBusy('guideline');
        setError('');
        try {
          const data = await api.setGuideline(projectId, {
            text: guide.text,
            revision: guide.revision === null ? revision : guide.revision,
          });
          adopt(data);
          toast(t('project.guidelineSaved'), 'success');
          loadGuideline();
        } catch (failure) {
          setError(errorText(failure));
          reportError(failure);
        } finally {
          setBusy('');
        }
      };
      const saveSchema = async () => {
        let parsed;
        try {
          parsed = JSON.parse(schema.text);
        } catch (parseError) {
          setSchema((previous) => ({ ...previous, invalid: t('project.schemaInvalid') }));
          return;
        }
        if (!isObject(parsed) || !Array.isArray(parsed.fields)) {
          setSchema((previous) => ({ ...previous, invalid: t('project.schemaInvalid') }));
          return;
        }
        setBusy('schema');
        setError('');
        try {
          const data = await api.setSchema(projectId, {
            schema: parsed,
            revision: schema.revision === null ? revision : schema.revision,
          });
          adopt(data);
          toast(t('project.schemaSaved'), 'success');
          if (props.onReload) props.onReload();
        } catch (failure) {
          setError(errorText(failure));
          reportError(failure);
        } finally {
          setBusy('');
        }
      };
      const tabs = [
        ['basic', t('project.tab.basic')],
        ['guideline', t('project.tab.guideline')],
        ['schema', t('project.tab.schema')],
        ['validate', t('project.tab.validate')],
      ];
      return h(Modal, {
        title: `${t('project.settings')}${project.name ? ` · ${String(project.name)}` : ''}`,
        onClose: props.onClose,
        wide: true,
        footer: h(Btn, { onClick: props.onClose }, t('actions.close')),
      },
      h('div', { className: 'aw-col', style: { gap: 10 } },
        h('div', { className: 'aw-chips', style: { borderBottom: 'none', padding: 0 } }, tabs.map(([id, label]) => h('button', {
          key: id,
          type: 'button',
          className: cn('aw-chip', tab === id && 'aw-on'),
          'aria-pressed': tab === id,
          onClick: () => { setError(''); setTab(id); },
        }, label))),
        error ? h('div', { className: 'aw-validation', role: 'alert' }, error) : null,
        tab === 'basic' ? h('div', { className: 'aw-col', style: { gap: 8 } },
          h(FieldShell, { label: t('project.name'), required: true },
            h('input', { className: 'aw-input', 'data-autofocus': true, value: name, onChange: (event) => setName(event.target.value) })),
          h(FieldShell, { label: t('project.description') },
            h('textarea', { className: 'aw-textarea', rows: 3, value: description, onChange: (event) => setDescription(event.target.value) })),
          h('div', { className: 'aw-row' },
            h(Btn, { variant: 'primary', icon: 'save', disabled: busy === 'basic', onClick: saveBasic }, busy === 'basic' ? t('form.saving') : t('actions.saveChanges')),
            h('span', { className: 'aw-dim', style: { fontSize: 11 } }, t('project.currentRevision', { n: revision }))),
          h('div', { className: 'aw-hr' }),
          h('div', { className: 'aw-section-title', style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('project.deleteDanger')),
          h('div', { className: 'aw-field-help' }, t('project.deleteDangerHint')),
          h('div', { className: 'aw-row' },
            h(Btn, { variant: 'danger', icon: 'trash', onClick: () => props.onDelete && props.onDelete(project) }, t('project.deleteProject'))))
          : null,
        tab === 'guideline' ? h('div', { className: 'aw-col', style: { gap: 8 } },
          guide.loading ? h(Loading, null) : null,
          h(FieldShell, { label: t('project.tab.guideline'), help: t('project.guidelinePlaceholder') },
            h('textarea', {
              className: 'aw-textarea aw-mono',
              rows: 14,
              value: guide.text,
              onChange: (event) => setGuide((previous) => ({ ...previous, text: event.target.value })),
            })),
          h('div', { className: 'aw-row' },
            h(Btn, { variant: 'primary', icon: 'save', disabled: busy === 'guideline', onClick: saveGuideline }, busy === 'guideline' ? t('form.saving') : t('actions.saveChanges')),
            h(Btn, { icon: 'refresh', onClick: loadGuideline }, t('actions.refresh')),
            h('span', { className: 'aw-dim', style: { fontSize: 11 } }, guide.revision !== null ? t('project.currentRevision', { n: guide.revision }) : '')))
          : null,
        tab === 'schema' ? h('div', { className: 'aw-col', style: { gap: 8 } },
          schema.loading ? h(Loading, null) : null,
          h(FieldShell, { label: t('project.tab.schema'), help: t('project.schemaPlaceholder'), error: schema.invalid || undefined },
            h('textarea', {
              className: 'aw-textarea aw-mono',
              rows: 14,
              value: schema.text,
              onChange: (event) => setSchema((previous) => ({ ...previous, text: event.target.value, invalid: '' })),
            })),
          h('div', { className: 'aw-row' },
            h(Btn, { variant: 'primary', icon: 'save', disabled: busy === 'schema', onClick: saveSchema }, busy === 'schema' ? t('form.saving') : t('actions.saveChanges')),
            h(Btn, { icon: 'refresh', onClick: loadSchema }, t('actions.refresh')),
            h('span', { className: 'aw-dim', style: { fontSize: 11 } }, schema.revision !== null ? t('project.currentRevision', { n: schema.revision }) : '')))
          : null,
        tab === 'validate' ? h('div', { className: 'aw-col', style: { gap: 12 } },
          h('div', { className: 'aw-section-title' }, t('validate.title')),
          h(ValidationPanel, { projectId }))
          : null));
    }

    /**
     * Delete-project confirmation. The document text is intentionally serious:
     * deleting a project removes its items, labels, reviews, media and exports.
     */
    function DeleteProjectModal(props) {
      const project = props.project || {};
      const projectId = props.projectId || (project && project.id ? String(project.id) : '');
      const projectName = String(project.name || project.id || '');
      const [confirmName, setConfirmName] = React.useState('');
      const [mode, setMode] = React.useState('trash');
      const [purgeChecked, setPurgeChecked] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const nameMatches = confirmName.trim() === projectName.trim();
      const canDelete = nameMatches && (mode === 'trash' || purgeChecked);
      const submit = async () => {
        if (!canDelete || busy) return;
        setBusy(true);
        setError('');
        try {
          const result = await api.deleteProject(projectId, {
            confirmName: confirmName.trim(),
            mode,
          });
          if (props.onDeleted) await props.onDeleted(result || {}, project);
        } catch (failure) {
          setError(failure && failure.message ? failure.message : t('project.deleteFailed'));
          reportError(failure);
        } finally {
          setBusy(false);
        }
      };
      return h(Modal, {
        title: t('project.deleteTitle'),
        onClose: props.onClose,
        footer: h(React.Fragment, null,
          h(Btn, { onClick: props.onClose }, t('actions.cancel')),
          h(Btn, {
            variant: 'danger',
            icon: 'trash',
            disabled: !canDelete || busy,
            onClick: submit,
          }, busy ? t('form.saving') : t('project.deleteButton'))),
      },
      h('div', { className: 'aw-col', style: { gap: 12 } },
        h('div', { className: 'aw-validation', role: 'alert' }, t('project.deleteWarning', { name: projectName })),
        h('div', { className: 'aw-row aw-wrap' },
          h(Tag, null, String(project.template || 'custom')),
          project.itemCount !== undefined ? h(Tag, null, t('misc.itemCount', { n: project.itemCount })) : null),
        h('div', { className: 'aw-col', style: { gap: 6 } },
          h('button', {
            type: 'button',
            className: cn('aw-option', mode === 'trash' && 'aw-on'),
            'aria-pressed': mode === 'trash',
            onClick: () => { setMode('trash'); setError(''); },
          }, t('project.deleteTrash')),
          h('div', { className: 'aw-field-help' }, t('project.deleteTrashHint')),
          h('button', {
            type: 'button',
            className: cn('aw-option', mode === 'purge' && 'aw-on'),
            'aria-pressed': mode === 'purge',
            onClick: () => { setMode('purge'); setError(''); },
          }, t('project.deletePurge')),
          h('div', { className: 'aw-field-help' }, t('project.deletePurgeHint')),
          mode === 'purge' ? h('label', { className: 'aw-switch' },
            h('input', {
              type: 'checkbox',
              checked: purgeChecked,
              onChange: (event) => setPurgeChecked(event.target.checked),
            }),
            h('span', null, t('project.deletePurgeConfirm'))) : null),
        h(FieldShell, {
          label: t('project.deleteConfirmLabel'),
          required: true,
          error: confirmName !== '' && !nameMatches ? t('project.deleteMismatch') : undefined,
        },
        h('input', {
          className: 'aw-input',
          'data-autofocus': true,
          value: confirmName,
          placeholder: t('project.deleteConfirmPlaceholder', { name: projectName }),
          onChange: (event) => { setConfirmName(event.target.value); setError(''); },
          onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
        })),
        error ? h('div', { className: 'aw-validation', role: 'alert' }, error) : null));
    }

    /* ===================================================================== *
     * 18. Workbench application root (main panel)
     * ===================================================================== */

    /** One toast sequence counter shared by the app instance. */
    let toastSeq = 0;

    /** Read the browser session flag without throwing in restricted contexts. */
    function sessionGet(key) {
      try { return window.sessionStorage.getItem(key); } catch (error) { return null; }
    }

    /** Write the browser session flag. */
    function sessionSet(key, value) {
      try { window.sessionStorage.setItem(key, value); } catch (error) { /* ignore */ }
    }

    /** The main workbench panel. */
    function WorkbenchApp() {
      const [boot, setBoot] = React.useState({ loading: true, device: null, health: null, projects: [], templates: [], error: '' });
      const [screen, setScreen] = React.useState('onboarding');
      const [mode, setMode] = React.useState('annotate');
      const [projectId, setProjectId] = React.useState(null);
      const [projectDetail, setProjectDetail] = React.useState(null);
      const [queue, setQueue] = React.useState({ rows: [], total: 0, nextCursor: null, loading: false, error: '' });
      const [filter, setFilter] = React.useState('all');
      const [query, setQuery] = React.useState('');
      const debouncedQuery = useDebounced(query, 320);
      const [itemId, setItemId] = React.useState(null);
      const [detail, setDetail] = React.useState(null);
      const [detailLoading, setDetailLoading] = React.useState(false);
      const [labels, setLabelsState] = React.useState({});
      const [dirty, setDirty] = React.useState(false);
      const [fieldErrors, setFieldErrors] = React.useState({});
      const [saving, setSaving] = React.useState('');
      const [statusText, setStatusText] = React.useState('');
      const [finalLabels, setFinalLabels] = React.useState({});
      const [reviewComment, setReviewComment] = React.useState('');
      const [reviewBusy, setReviewBusy] = React.useState(false);
      const [stats, setStats] = React.useState({ stats: null, agreement: null, activity: [], loading: false, error: '' });
      const [modal, setModal] = React.useState(null);
      const [toasts, setToasts] = React.useState([]);
      const openedAtRef = React.useRef(Date.now());
      const projectRef = React.useRef(null);
      projectRef.current = projectDetail && projectDetail.project ? projectDetail.project : projectId ? { id: projectId } : null;
      const fields = fieldsOf(projectDetail && projectDetail.project);
      const device = boot.device || {};
      const project = projectDetail && projectDetail.project ? projectDetail.project : null;
      const activeItem = detail && detail.item ? detail.item : null;
      const annotations = detail && Array.isArray(detail.annotations) ? detail.annotations : [];
      const reviews = detail && Array.isArray(detail.reviews) ? detail.reviews : [];
      const autosaveEnabled = !(device.ui && device.ui.autosave === false);

      /** Push one transient toast. */
      const pushToast = React.useCallback((text, tone) => {
        toastSeq += 1;
        const id = toastSeq;
        setToasts((list) => list.concat([{ id, text: String(text), tone: tone || 'info' }]));
        window.setTimeout(() => {
          setToasts((list) => list.filter((item) => item.id !== id));
        }, 4200);
      }, []);
      React.useEffect(() => {
        if (!CORE) return undefined;
        CORE.toast = pushToast;
        return () => {
          if (CORE && CORE.toast === pushToast) CORE.toast = null;
        };
      }, [pushToast]);

      /** Refresh device.json. */
      const refreshDevice = React.useCallback(async () => {
        try {
          const next = await api.device();
          setBoot((previous) => ({ ...previous, device: next }));
          if (CORE) CORE.actor = next && next.actorName ? { id: next.actorId, name: next.actorName } : null;
          return next;
        } catch (failure) {
          reportError(failure);
          return null;
        }
      }, []);

      /** Refresh the project directory. */
      const refreshProjects = React.useCallback(async () => {
        try {
          const list = await api.projects();
          const projects = Array.isArray(list) ? list : Array.isArray(list && list.projects) ? list.projects : [];
          setBoot((previous) => ({ ...previous, projects }));
          return projects;
        } catch (failure) {
          reportError(failure);
          return [];
        }
      }, []);

      /** Load one project's detail (`{project,stats,members,counts}`). */
      const loadProject = React.useCallback(async (id) => {
        const data = await api.project(id);
        const detailData = data && data.project ? data : { project: data };
        setProjectDetail(detailData);
        setProjectId(detailData.project ? String(detailData.project.id || id) : id);
        if (CORE) CORE.projectId = detailData.project ? String(detailData.project.id || id) : id;
        return detailData;
      }, []);

      /** Open a project and switch to the workbench screen. */
      const openProject = React.useCallback(async (target) => {
        const id = target && typeof target === 'object' ? String(target.id || target.project && target.project.id || '') : String(target || '');
        if (id === '') return;
        setQueue({ rows: [], total: 0, nextCursor: null, loading: true, error: '' });
        setDetail(null);
        setItemId(null);
        setLabelsState({});
        setDirty(false);
        setFilter('all');
        setMode('annotate');
        try {
          const data = await loadProject(id);
          setScreen('workbench');
          try { await api.updateDevice({ activeProject: id }); } catch (failure) { /* non-fatal */ }
          if (data && data.project && data.project.name && CORE) CORE.projectName = data.project.name;
          return data;
        } catch (failure) {
          reportError(failure);
          setScreen('onboarding');
          return null;
        }
      }, [loadProject]);

      /** Load a queue page; `append` keeps windowed rows. */
      const loadQueue = React.useCallback(async (options) => {
        const targetId = projectId;
        if (!targetId) return;
        const append = Boolean(options && options.append);
        const cursor = append ? queue.nextCursor : null;
        if (append && !cursor) return;
        setQueue((previous) => ({ ...previous, loading: true, error: '' }));
        try {
          const data = await api.queue(targetId, {
            ...filterParams(mode, filter),
            q: debouncedQuery || undefined,
            cursor: cursor || undefined,
            limit: 50,
            actorId: device.actorId || undefined,
          });
          const rows = data && Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
          setQueue((previous) => ({
            rows: append ? previous.rows.concat(rows) : rows,
            total: data && data.total !== undefined ? num(data.total) : append ? previous.rows.length + rows.length : rows.length,
            nextCursor: data && data.nextCursor ? data.nextCursor : null,
            loading: false,
            error: '',
          }));
        } catch (failure) {
          setQueue((previous) => ({ ...previous, loading: false, error: errorText(failure) }));
          reportError(failure);
        }
      }, [projectId, mode, filter, debouncedQuery, queue.nextCursor, device.actorId]);

      /** Load one item detail and seed the editors. */
      const loadItem = React.useCallback(async (id) => {
        if (!projectId || !id) return;
        setDetailLoading(true);
        try {
          const data = await api.item(projectId, id, device.actorId || undefined);
          setDetail(data);
          const item = data && data.item ? data.item : data;
          const list = fieldsOf(project);
          const mine = Array.isArray(data && data.annotations)
            ? data.annotations.find((annotation) => annotation && (annotation.actorId === device.actorId || (!device.actorId && annotation.actorName === device.actorName)))
            : null;
          setLabelsState(initialLabels(list, mine && mine.labels ? mine.labels : {}));
          setFinalLabels(initialLabels(list, data && data.finalLabels && Object.keys(data.finalLabels).length > 0 ? data.finalLabels : {}));
          setReviewComment('');
          setFieldErrors({});
          setDirty(false);
          setStatusText('');
          openedAtRef.current = Date.now();
          setItemId(String(item && item.id ? item.id : id));
          return data;
        } catch (failure) {
          reportError(failure);
          return null;
        } finally {
          setDetailLoading(false);
        }
      }, [projectId, device.actorId, device.actorName, project]);

      /** Update one label field. */
      const onChangeLabel = React.useCallback((fieldId, value) => {
        setLabelsState((previous) => ({ ...previous, [fieldId]: value }));
        setDirty(true);
        setFieldErrors((previous) => {
          if (!previous[fieldId]) return previous;
          const next = { ...previous };
          delete next[fieldId];
          return next;
        });
      }, []);

      /** Move through the queue (j/k, after submitting). */
      const goRelative = React.useCallback((delta) => {
        const jump = () => {
          if (!projectId) return;
          api.next(projectId, filterParams(mode, filter)).then((data) => {
            const next = data && (data.item ? data.item : data);
            const nextItem = next && next.item ? next.item : next;
            if (nextItem && nextItem.id) setItemId(String(nextItem.id));
          }).catch(reportError);
        };
        const rows = queue.rows;
        if (rows.length === 0) {
          if (delta > 0) jump();
          return;
        }
        const currentIndex = rows.findIndex((row) => String(row.id) === String(itemId));
        const target = currentIndex >= 0 ? rows[currentIndex + delta] : null;
        if (target) {
          setItemId(String(target.id));
          return;
        }
        if (delta > 0) jump();
      }, [queue.rows, itemId, projectId, mode, filter]);

      /** Save the current labels; `status` is a contract status. */
      const saveLabels = React.useCallback(async (status, options) => {
        if (!projectId || !itemId) return false;
        if (status === 'submitted') {
          const errors = validateLabels(fields, labels, activeItem || {});
          if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            pushToast(t('form.submitFirst'), 'error');
            return false;
          }
        }
        setSaving(status);
        setFieldErrors({});
        try {
          const data = await api.saveLabel(projectId, itemId, {
            labels,
            status,
            durationMs: Date.now() - openedAtRef.current,
          });
          setDirty(false);
          if (data && data.item) setDetail(data);
          const messages = { draft: 'form.saved', submitted: 'form.submitted', skipped: 'form.skipped', flagged: 'form.flagged' };
          setStatusText(t(messages[status] || 'form.saved'));
          if (!(options && options.silent)) pushToast(t(messages[status] || 'form.saved'), status === 'submitted' ? 'success' : 'info');
          loadQueue({});
          if (status === 'submitted' || status === 'skipped' || status === 'flagged') {
            goRelative(1);
          }
          return true;
        } catch (failure) {
          const perField = fieldErrorsOf(failure);
          if (Object.keys(perField).length > 0) setFieldErrors(perField);
          reportError(failure);
          return false;
        } finally {
          setSaving('');
        }
      }, [projectId, itemId, fields, labels, activeItem, pushToast, loadQueue, goRelative]);

      /** Autosave after 1.5s of inactivity. */
      React.useEffect(() => {
        if (!dirty || saving !== '' || !autosaveEnabled || mode !== 'annotate' || !itemId) return undefined;
        const timer = window.setTimeout(() => {
          saveLabels('draft', { silent: true });
        }, 1500);
        return () => window.clearTimeout(timer);
      }, [labels, dirty, saving, autosaveEnabled, mode, itemId, saveLabels]);

      /** Submit one review decision. */
      const submitReview = React.useCallback(async (decision, comment) => {
        if (!projectId || !itemId) return false;
        if (decision === 'reject' && String(comment || '').trim() === '') {
          pushToast(t('review.needComment'), 'error');
          return false;
        }
        setReviewBusy(true);
        try {
          const body = { decision, comment: String(comment || '') };
          const meaningful = {};
          for (const key of Object.keys(finalLabels || {})) {
            if (!isEmptyValue(finalLabels[key])) meaningful[key] = finalLabels[key];
          }
          if (Object.keys(meaningful).length > 0) body.finalLabels = meaningful;
          const data = await api.review(projectId, itemId, body);
          pushToast(t('review.completed'), 'success');
          loadQueue({});
          if (data && data.item) setDetail(data);
          setTimeout(() => goRelative(1), 250);
          return true;
        } catch (failure) {
          const perField = fieldErrorsOf(failure);
          if (Object.keys(perField).length > 0) setFieldErrors(perField);
          reportError(failure);
          return false;
        } finally {
          setReviewBusy(false);
        }
      }, [projectId, itemId, finalLabels, pushToast, loadQueue, goRelative]);

      /** Load stats, agreement and activity for the stats view. */
      const loadStats = React.useCallback(async () => {
        if (!projectId) return;
        setStats((previous) => ({ ...previous, loading: true, error: '' }));
        try {
          const [statsData, agreementData, activityData] = await Promise.all([
            api.stats(projectId),
            api.agreement(projectId).catch(() => null),
            api.activity(projectId, 60).catch(() => []),
          ]);
          setStats({
            stats: statsData || null,
            agreement: agreementData || null,
            activity: Array.isArray(activityData) ? activityData : Array.isArray(activityData && activityData.items) ? activityData.items : [],
            loading: false,
            error: '',
          });
        } catch (failure) {
          setStats((previous) => ({ ...previous, loading: false, error: errorText(failure) }));
          reportError(failure);
        }
      }, [projectId]);

      /** First boot: health + device + projects + templates. */
      React.useEffect(() => {
        let alive = true;
        (async () => {
          const [healthResult, deviceResult, projectsResult, templatesResult] = await Promise.allSettled([
            api.health(), api.device(), api.projects(), api.templates(),
          ]);
          if (!alive) return;
          const healthData = healthResult.status === 'fulfilled' ? healthResult.value : null;
          const deviceData = deviceResult.status === 'fulfilled' ? deviceResult.value : null;
          const projectsData = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
          const templatesData = templatesResult.status === 'fulfilled' ? templatesResult.value : [];
          const projects = Array.isArray(projectsData) ? projectsData : Array.isArray(projectsData && projectsData.projects) ? projectsData.projects : [];
          const templates = Array.isArray(templatesData) ? templatesData : Array.isArray(templatesData && templatesData.templates) ? templatesData.templates : [];
          if (CORE) {
            CORE.version = healthData && healthData.version ? String(healthData.version) : '';
            CORE.actor = deviceData && deviceData.actorName ? { id: deviceData.actorId, name: deviceData.actorName } : null;
          }
          setBoot({ loading: false, device: deviceData || {}, health: healthData || null, projects, templates: templates.length > 0 ? templates : TEMPLATE_FALLBACK, error: '' });
          if (deviceData && deviceData.actorName) {
            const active = deviceData.activeProject && projects.some((entry) => String(entry.id) === String(deviceData.activeProject)) ? deviceData.activeProject : null;
            if (active) openProject(active);
          }
        })();
        return () => { alive = false; };
      }, []);

      /** Reload the queue when the project, mode, filter or search changes. */
      React.useEffect(() => {
        if (screen !== 'workbench' || !projectId || mode === 'stats') return;
        loadQueue({});
      }, [screen, projectId, mode, filter, debouncedQuery]);

      /** Load the selected item. */
      React.useEffect(() => {
        if (!itemId || !projectId) return;
        loadItem(itemId);
      }, [itemId, projectId]);

      /** Load stats when the stats mode is shown. */
      React.useEffect(() => {
        if (mode !== 'stats' || !projectId) return;
        loadStats();
      }, [mode, projectId]);

      /** Save the actor name from the actor gate. */
      const saveActor = React.useCallback(async (name) => {
        const updated = await api.updateDevice({ actorName: name, onboarded: true });
        setBoot((previous) => ({ ...previous, device: updated || { ...previous.device, actorName: name } }));
        if (CORE && updated) CORE.actor = { id: updated.actorId, name: updated.actorName };
        pushToast(t('onboarding.saved'), 'success');
      }, [pushToast]);

      /** Open the project list from the top bar. */
      const backToProjects = React.useCallback(() => {
        setScreen('onboarding');
        refreshProjects();
      }, [refreshProjects]);

      /** Open the create/import/settings/shortcuts dialogs. */
      const openModal = React.useCallback((kind, projectArg) => {
        setModal({ kind, project: projectArg || project || projectRef.current || null });
      }, [project]);

      /** Copy a prepared task prompt for the Agent. */
      const copyPrompt = React.useCallback(async () => {
        const lines = [t('prompt.intro'), ''];
        if (project) lines.push(t('prompt.project', { name: project.name || project.id, id: project.id }), '');
        if (activeItem) lines.push(t('prompt.item', { id: activeItem.id }), '');
        lines.push(t('prompt.mode', { mode: t(mode === 'review' ? 'mode.review' : mode === 'stats' ? 'mode.stats' : 'mode.annotate') }), '', t('prompt.body'));
        const ok = await copyText(lines.join('\n'));
        pushToast(ok ? t('prompt.copied') : t('misc.copyFailed'), ok ? 'success' : 'error');
      }, [project, activeItem, mode, pushToast]);

      /** Ask the Agent in a new session with the annotation preset. */
      const askAI = React.useCallback(() => {
        try {
          const ctx = CORE && CORE.ctx;
          if (!ctx) return;
          if (ctx.uiWorkspace && typeof ctx.uiWorkspace.startSession === 'function') {
            ctx.uiWorkspace.startSession(undefined, { agentPreset: 'annotation' });
          }
          if (ctx.layout && typeof ctx.layout.selectPanel === 'function') ctx.layout.selectPanel(null);
        } catch (failure) {
          reportError(failure);
        }
      }, []);

      /** React to the project switcher. */
      const switchProject = React.useCallback(async (id) => {
        if (!id) return;
        if (String(id) === String(projectId)) return;
        await openProject(id);
      }, [projectId, openProject]);

      /** Demo data for an existing project. */
      const seedDemo = React.useCallback(async (target) => {
        const id = target && typeof target === 'object' ? String(target.id || '') : String(target || projectId || '');
        if (!id) return;
        try {
          await api.demo(id);
          pushToast(t('settings.saved'), 'success');
          await openProject(id);
        } catch (failure) {
          reportError(failure);
        }
      }, [projectId, pushToast, openProject]);

      /** Global keyboard shortcuts. */
      React.useEffect(() => {
        const onKey = (event) => {
          const target = event.target;
          const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (screen !== 'workbench') return;
            if (mode === 'review') submitReview('approve', reviewComment);
            else saveLabels('submitted');
            return;
          }
          if (typing) return;
          if (event.key === 'Escape') {
            setModal(null);
            return;
          }
          if (event.altKey || event.ctrlKey || event.metaKey || screen !== 'workbench') return;
          if (mode === 'stats' && (event.key === 'j' || event.key === 'k')) return;
          if (event.key === 'j') { event.preventDefault(); goRelative(1); }
          else if (event.key === 'k') { event.preventDefault(); goRelative(-1); }
          else if (event.key === 's' && mode === 'annotate') { event.preventDefault(); saveLabels('draft'); }
          else if (event.key === 'x' && mode === 'annotate') { event.preventDefault(); saveLabels('skipped'); }
          else if (event.key === 'f' && mode === 'annotate') { event.preventDefault(); saveLabels('flagged'); }
          else if (event.key === '?') { event.preventDefault(); setModal({ kind: 'shortcuts' }); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [screen, mode, goRelative, saveLabels, submitReview, reviewComment]);

      const progressDone = projectDetail && projectDetail.counts
        ? num(projectDetail.counts.submitted) + num(projectDetail.counts.approved)
        : num(stats.stats && stats.stats.counts && stats.stats.counts.submitted) + num(stats.stats && stats.stats.counts && stats.stats.counts.approved);
      const progressTotal = projectDetail && projectDetail.counts ? num(projectDetail.counts.total)
        : num(stats.stats && stats.stats.counts && stats.stats.counts.total);

      /* ----- top bar ----- */
      const topBar = h('div', { className: 'aw-topbar' },
        h('div', { className: 'aw-logo' }, h(BrandMark, { size: 20 }), h('span', null, t('panel.title'))),
        h('div', { className: 'aw-sep' }),
        h('button', { type: 'button', className: 'aw-btn aw-btn-ghost aw-btn-icon', title: t('onboarding.backToList'), 'aria-label': t('onboarding.backToList'), onClick: backToProjects }, h(Icon, { name: 'up', size: 14 })),
        h('select', {
          className: 'aw-select',
          style: { maxWidth: 200 },
          'aria-label': t('header.project'),
          value: projectId || '',
          onChange: (event) => { switchProject(event.target.value); },
        },
        projectId ? null : h('option', { value: '' }, t('header.noProject')),
        boot.projects.map((entry) => h('option', { key: entry.id, value: entry.id }, String(entry.name || entry.id)))),
        h(Btn, { iconOnly: true, icon: 'file', title: t('project.settings'), onClick: () => openModal('projectSettings') }),
        h('div', { className: 'aw-seg' }, ['annotate', 'review', 'stats'].map((id) => h('button', {
          key: id,
          type: 'button',
          className: cn('aw-seg-btn', mode === id && 'aw-on'),
          'aria-pressed': mode === id,
          onClick: () => setMode(id),
        }, id === 'annotate' ? t('mode.annotate') : id === 'review' ? t('mode.review') : t('mode.stats')))),
        mode !== 'stats' ? h('input', {
          className: 'aw-input aw-search',
          type: 'search',
          value: query,
          placeholder: t('search.placeholder'),
          'aria-label': t('search.placeholder'),
          onChange: (event) => setQuery(event.target.value),
        }) : null,
        h('span', { className: 'aw-spacer' }),
        h('span', { className: 'aw-dim', style: { fontSize: 11, whiteSpace: 'nowrap' } }, progressTotal > 0 ? t('header.progress', { done: progressDone, total: progressTotal }) : ''),
        h('span', { className: 'aw-tag', title: t('actor.label') }, h(Icon, { name: 'user', size: 11 }), String(device.actorName || t('actor.anonymous'))),
        h(Btn, { icon: 'sparkle', onClick: askAI, title: t('header.ai') }, t('header.ai')),
        h(Btn, { iconOnly: true, icon: 'copy', onClick: copyPrompt, title: t('header.copyPrompt') }),
        h(Btn, { iconOnly: true, icon: 'download', title: t('actions.export'), onClick: () => openModal('export') }),
        h(Btn, { iconOnly: true, icon: 'gear', title: t('header.settings'), onClick: () => openModal('settings') }),
        h(Btn, { iconOnly: true, icon: 'help', title: t('header.shortcuts'), onClick: () => openModal('shortcuts') }));

      /* ----- center pane ----- */
      let center = null;
      if (mode === 'stats') {
        center = null;
      } else {
        center = h('div', { className: 'aw-pane aw-viewer' },
          detailLoading ? h('div', { style: { padding: 16 } }, h(Loading, null)) : null,
          !detailLoading && !activeItem
            ? h(Empty, {
              icon: mode === 'review' ? 'check' : 'box',
              title: mode === 'review' ? t('review.noItem') : t('queue.pick'),
            })
            : null,
          activeItem ? h('div', { className: 'aw-viewer-inner' },
            h('div', { className: 'aw-viewer-head' },
              h(StatusDot, { status: String(detail.status || 'unlabeled') }),
              h('span', { className: 'aw-item-title' }, String(activeItem.id || '')),
              h(Tag, null, h(KindIcon, { kind: activeItem.kind }), t(`kind.${String(activeItem.kind || 'text')}`)),
              detail.myStatus ? h(Tag, { tone: 'tone' }, t(`status.${String(detail.myStatus)}`)) : null,
              detail.review && detail.review !== 'none' ? h(Tag, { tone: detail.review === 'approved' ? 'ok' : 'bad' }, t(`review.${detail.review}`)) : null,
              Array.isArray(activeItem.tags) ? activeItem.tags.slice(0, 4).map((tag) => h(Tag, { key: String(tag) }, String(tag))) : null,
              h('span', { className: 'aw-spacer' }),
              h(Btn, { iconOnly: true, icon: 'play', title: mode === 'review' ? t('review.next') : t('actions.next'), onClick: () => goRelative(1) }),
              h(Btn, { iconOnly: true, icon: 'refresh', title: t('actions.refresh'), onClick: () => loadItem(itemId) })),
            h(ItemViewer, {
              item: activeItem,
              media: detail.media || (activeItem ? activeItem.media : []),
              fields,
              labels: mode === 'review' ? finalLabels : labels,
              setFieldValue: mode === 'review' ? (fieldId, value) => setFinalLabels((previous) => ({ ...previous, [fieldId]: value })) : onChangeLabel,
            }),
            mode === 'review' ? h(React.Fragment, null,
              h('div', { className: 'aw-hr' }),
              h(CompareTable, {
                fields,
                item: activeItem,
                annotations,
                finalLabels,
                onAdopt: (adopted) => setFinalLabels(initialLabels(fields, adopted || {})),
              }),
              reviews.length > 0 ? h('details', { className: 'aw-details' },
                h('summary', null, `${t('review.history')} (${reviews.length})`),
                h('div', { className: 'aw-field-list' }, reviews.slice(-8).reverse().map((review, index) => h('div', { key: index, style: { fontSize: 11 } },
                  h(Tag, { tone: review.decision === 'approve' ? 'ok' : 'bad' }, t(review.decision === 'approve' ? 'review.approved' : 'review.rejected')),
                  ' ', String(review.actorName || ''), ' ', h('span', { className: 'aw-dim' }, formatStamp(review.ts)),
                  review.comment ? h('div', { className: 'aw-muted' }, String(review.comment)) : null)))) : null)
            : null,
            activeItem.note ? h('div', { className: 'aw-field-help' }, String(activeItem.note)) : null) : null);
      }

      /* ----- right pane ----- */
      let rightPane = null;
      if (mode !== 'stats') {
        rightPane = h('div', { className: 'aw-pane aw-form' },
          mode === 'review'
            ? h(ReviewPanel, {
              item: activeItem,
              fields,
              finalLabels,
              errors: fieldErrors,
              reviews,
              review: detail ? detail.review : null,
              busy: reviewBusy,
              comment: reviewComment,
              onComment: setReviewComment,
              onChange: (fieldId, value) => setFinalLabels((previous) => ({ ...previous, [fieldId]: value })),
              onDecision: submitReview,
              onNext: () => goRelative(1),
            })
            : h(React.Fragment, null,
              h('div', { className: 'aw-pane-head' },
                h('span', { className: 'aw-pane-title' }, t('form.title')),
                h('span', { className: 'aw-spacer' }),
                dirty ? h('span', { className: 'aw-dim', style: { fontSize: 10 } }, autosaveEnabled ? t('form.autosaved') : t('form.autosaveOff')) : null),
              activeItem
                ? h('div', { className: 'aw-form-body' },
                  h(LabelForm, {
                    fields,
                    item: activeItem,
                    labels,
                    errors: fieldErrors,
                    onChange: onChangeLabel,
                  }),
                  h('div', { className: 'aw-form-status' },
                    h('span', null, statusText),
                    saving !== '' ? h('span', { className: 'aw-dim' }, t('form.saving')) : null))
                : h(Empty, { title: t('form.empty') }),
              h('div', { className: 'aw-form-actions' },
                h(Btn, { variant: 'primary', icon: 'save', disabled: !activeItem || saving !== '', onClick: () => saveLabels('draft') }, t('actions.save')),
                h(Btn, { variant: 'success', icon: 'send', disabled: !activeItem || saving !== '', onClick: () => saveLabels('submitted') }, t('actions.submit')),
                h(Btn, { icon: 'skip', disabled: !activeItem || saving !== '', onClick: () => saveLabels('skipped') }, t('actions.skip')),
                h(Btn, { icon: 'flag', disabled: !activeItem || saving !== '', onClick: () => saveLabels('flagged') }, t('actions.flag')),
                h(Btn, { icon: 'play', disabled: !activeItem, onClick: () => goRelative(1) }, t('actions.next')))));
      }

      /* ----- modals ----- */
      let modalNode = null;
      if (modal) {
        if (modal.kind === 'create') {
          modalNode = h(CreateProjectModal, {
            templates: boot.templates,
            onClose: () => setModal(null),
            onCreated: async (id) => {
              setModal(null);
              await refreshProjects();
              if (id) await openProject(id);
              else setScreen('onboarding');
            },
          });
        } else if (modal.kind === 'import') {
          const target = modal.project && modal.project.id ? modal.project : projectRef.current;
          const targetId = target && target.id ? String(target.id) : '';
          modalNode = target && target.id ? h(ImportWizard, {
            project: target,
            onClose: () => setModal(null),
            onImported: async () => {
              await refreshProjects();
              if (targetId) {
                try {
                  await loadProject(targetId);
                  setProjectId(targetId);
                  setScreen('workbench');
                } catch (failure) { /* keep view */ }
                loadQueue({});
              }
            },
          }) : h(Modal, {
            title: t('project.importTitle'),
            onClose: () => setModal(null),
            footer: h(Btn, { variant: 'primary', onClick: () => { setModal(null); setModal({ kind: 'create' }); } }, t('onboarding.newProject')),
          }, h('div', { className: 'aw-muted' }, t('onboarding.projectsEmpty')));
        } else if (modal.kind === 'settings') {
          modalNode = h(Modal, {
            title: t('settings.title'),
            onClose: () => setModal(null),
            wide: true,
            footer: h(Btn, { onClick: () => setModal(null) }, t('actions.close')),
          }, h(SettingsForm, {
            device,
            version: boot.health && boot.health.version,
            onDevice: (updated) => setBoot((previous) => ({ ...previous, device: updated || previous.device })),
            onRefreshProjects: refreshProjects,
            onGo: () => {
              setModal(null);
              setScreen('workbench');
              try { CORE.ctx.layout.selectPanel(PANEL_ID); } catch (error) { /* ignore */ }
            },
          }));
        } else if (modal.kind === 'export') {
          const exportProject = projectRef.current || project;
          modalNode = exportProject && exportProject.id ? h(ExportModal, {
            project: exportProject,
            currentItemId: itemId || (activeItem && activeItem.id ? activeItem.id : null),
            onClose: () => setModal(null),
          }) : h(Modal, {
            title: t('export.title'),
            onClose: () => setModal(null),
            footer: h(Btn, { onClick: () => setModal(null) }, t('actions.close')),
          }, h('div', { className: 'aw-muted' }, t('header.noProject')));
        } else if (modal.kind === 'projectSettings') {
          const settingsProject = projectRef.current || project;
          modalNode = h(ProjectSettingsModal, {
            project: project || settingsProject || {},
            projectId: projectId || (settingsProject && settingsProject.id ? String(settingsProject.id) : ''),
            onClose: () => setModal(null),
            onUpdated: (data) => {
              if (data && data.project) setProjectDetail(data);
              refreshProjects();
              loadQueue({});
            },
            onReload: () => {
              if (projectId) loadProject(projectId).catch(reportError);
              refreshProjects();
            },
            onDelete: (target) => openModal('deleteProject', target || settingsProject),
          });
        } else if (modal.kind === 'deleteProject') {
          const target = modal.project || projectRef.current || project;
          modalNode = target && target.id ? h(DeleteProjectModal, {
            project: target,
            projectId: String(target.id),
            onClose: () => setModal(null),
            onDeleted: async (result, deletedProject) => {
              setModal(null);
              const deletedId = String((deletedProject && deletedProject.id) || (result && result.id) || '');
              const isActive = String(projectId || '') === deletedId
                || String((boot.device && boot.device.activeProject) || '') === deletedId;
              pushToast(result && result.mode === 'trash' ? t('project.trashed') : t('project.deleted'), 'success');
              if (isActive) {
                setProjectId(null);
                setProjectDetail(null);
                setDetail(null);
                setItemId(null);
                setLabelsState({});
                setFinalLabels({});
                setReviewComment('');
                setFieldErrors({});
                setDirty(false);
                setQueue({ rows: [], total: 0, nextCursor: null, loading: false, error: '' });
                setScreen('onboarding');
                if (CORE) { CORE.projectId = null; CORE.projectName = null; }
              }
              setBoot((previous) => ({
                ...previous,
                device: { ...previous.device, activeProject: isActive ? null : previous.device.activeProject },
              }));
              await refreshProjects();
            },
          }) : h(Modal, {
            title: t('project.deleteTitle'),
            onClose: () => setModal(null),
            footer: h(Btn, { onClick: () => setModal(null) }, t('actions.close')),
          }, h('div', { className: 'aw-muted' }, t('header.noProject')));
        } else if (modal.kind === 'shortcuts') {
          modalNode = h(ShortcutsModal, { onClose: () => setModal(null) });
        }
      }

      if (boot.loading) {
        return h('div', { className: 'aw-root' }, h(StyleSheet), h('div', { className: 'aw-center', style: { flex: '1 1 auto' } }, h(Loading, { text: t('onboarding.loading') })));
      }

      const onboarding = screen !== 'workbench' || !projectId;
      return h('div', { className: 'aw-root' },
        h(StyleSheet),
        !onboarding ? topBar : null,
        onboarding
          ? h(OnboardingView, {
            device,
            projects: boot.projects,
            loading: false,
            onSaveActor: saveActor,
            onOpenProject: (target) => openProject(target),
            onDemo: seedDemo,
            onRefresh: refreshProjects,
            onOpenModal: (kind, projectArg) => openModal(kind, projectArg),
          })
          : h(React.Fragment, null,
            h('div', { className: 'aw-main' },
              mode === 'stats'
                ? h(StatsView, {
                  projectId,
                  stats: stats.stats,
                  agreement: stats.agreement,
                  activity: stats.activity,
                  loading: stats.loading,
                  error: stats.error,
                  onRefresh: loadStats,
                })
                : h(React.Fragment, null,
                  h('div', { className: 'aw-queue aw-pane' },
                    h(TaskQueue, {
                      mode,
                      rows: queue.rows,
                      total: queue.total,
                      loading: queue.loading,
                      filter,
                      query,
                      activeId: itemId,
                      hasMore: Boolean(queue.nextCursor),
                      onFilter: (id) => { setFilter(id); },
                      onQuery: setQuery,
                      onSelect: (row) => { setItemId(String(row.id)); },
                      onLoadMore: () => { if (!queue.loading) loadQueue({ append: true }); },
                      onRefresh: () => { loadQueue({}); if (projectId) loadProject(projectId).catch(reportError); },
                    })),
                  center,
                  rightPane))),
        modalNode,
        h(ToastHost, { toasts, onDismiss: (id) => setToasts((list) => list.filter((item) => item.id !== id)) }));
    }

    /* ===================================================================== *
     * 19. Settings section (global Settings dialog entry)
     * ===================================================================== */

    /** The workbench's section inside the host Settings dialog. */
    function SettingsSection(props) {
      const [state, setState] = React.useState({ loading: true, device: null, health: null });
      const load = React.useCallback(async () => {
        try {
          const [deviceData, healthData] = await Promise.all([api.device(), api.health().catch(() => null)]);
          setState({ loading: false, device: deviceData || {}, health: healthData || null });
        } catch (failure) {
          reportError(failure);
          setState({ loading: false, device: {}, health: null });
        }
      }, []);
      React.useEffect(() => {
        if (!CORE) return undefined;
        load();
        return undefined;
      }, [load]);
      const goWorkbench = () => {
        try {
          if (props.close) props.close();
        } catch (error) { /* ignore */ }
        try {
          CORE.ctx.layout.selectPanel(PANEL_ID);
        } catch (error) { /* ignore */ }
      };
      if (state.loading) return h('div', { style: { padding: 16 } }, h(Loading, null));
      return h('div', { style: { padding: '8px 0' } },
        h(SettingsForm, {
          device: state.device,
          version: state.health && state.health.version,
          onDevice: (updated) => setState((previous) => ({ ...previous, device: updated || previous.device })),
          onRefreshProjects: () => { load(); },
          onGo: goWorkbench,
        }));
    }

    /* ===================================================================== *
     * 20. Error boundary and plugin registration
     * ===================================================================== */

    /**
     * Catch a WorkbenchApp render failure and keep the main panel visible.
     * The fallback deliberately uses inline styles and no workbench components:
     * if the crash came from a component dependency, the fallback must still
     * render and tell the user (and the host error log) what happened.
     */
    class WorkbenchBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null, info: null };
        this.retry = this.retry.bind(this);
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      componentDidCatch(error, info) {
        this.setState({ info: info || null });
        reportClientError('slot', error, info && info.componentStack);
      }

      retry() {
        this.setState({ error: null, info: null });
      }

      render() {
        const error = this.state.error;
        if (!error) return this.props.children;
        const message = error && error.message ? String(error.message) : String(error);
        const stack = error && error.stack ? String(error.stack) : '';
        const componentStack = this.state.info && this.state.info.componentStack ? String(this.state.info.componentStack) : '';
        const copyDiagnostics = () => {
          const text = `标注台加载失败\n${message}\n\n${stack}\n\n${componentStack}`;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).catch(() => {});
            }
          } catch (failure) { /* ignore */ }
        };
        const buttonStyle = {
          height: '30px',
          padding: '0 12px',
          borderRadius: '7px',
          border: '1px solid #c9ced6',
          background: '#fff',
          color: '#1d2430',
          cursor: 'pointer',
          fontSize: '12px',
        };
        return h('div', {
          'data-aw-error': 'main',
          style: {
            minHeight: '100%',
            boxSizing: 'border-box',
            padding: '28px 32px',
            background: 'var(--dsw-alias-bg-base, #fff)',
            color: 'var(--dsw-alias-label-primary, #1d2430)',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            fontSize: '13px',
            lineHeight: 1.6,
          },
        },
        h('div', { style: { fontSize: '16px', fontWeight: 600, marginBottom: '6px' } }, '标注台加载失败'),
        h('div', { style: { color: '#5b6472', marginBottom: '14px' } }, '主面板渲染时发生错误。可以重试；错误已写入本机日志，便于定位。'),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
          h('button', { type: 'button', style: buttonStyle, onClick: this.retry }, '重试'),
          h('button', { type: 'button', style: buttonStyle, onClick: () => { try { location.reload(); } catch (failure) { /* ignore */ } } }, '重新加载'),
          h('button', { type: 'button', style: buttonStyle, onClick: copyDiagnostics }, '复制诊断')),
        h('div', { style: { fontWeight: 600, marginBottom: '4px' } }, message),
        h('details', { style: { marginTop: '6px' } },
          h('summary', { style: { cursor: 'pointer', color: '#5b6472' } }, '展开技术栈'),
          h('pre', {
            style: {
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '260px',
              overflow: 'auto',
              padding: '10px',
              borderRadius: '7px',
              background: '#f5f6f8',
              color: '#333b46',
              fontSize: '11px',
            },
          }, `${stack}${componentStack ? `\n\n组件栈：\n${componentStack}` : ''}`)));
      }
    }

    /** The component registered in the main slot; the boundary is the outer shell. */
    function WorkbenchRoot() {
      return h(WorkbenchBoundary, null, h(WorkbenchApp));
    }

    /** Services required by the browser half (per CONTRACT.md). */
    const inject = ['slots', 'locale', 'uiWorkspace', 'layout'];

    /**
     * Auto-open the workbench once per browser session when the device setting
     * asks for it. Failures stay silent: the plugin must never blank the app.
     */
    function autoOpen(ctx) {
      try {
        fetch(`${API_BASE}/device`, { credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : null))
          .then((device) => {
            if (!device || !device.openOnStart) return;
            if (sessionGet('annotation.autoOpened') !== null) return;
            window.setTimeout(() => {
              try {
                if (sessionGet('annotation.autoOpened') !== null) return;
                sessionSet('annotation.autoOpened', '1');
                ctx.layout.selectPanel(PANEL_ID);
              } catch (error) { /* ignore */ }
            }, 500);
          })
          .catch(() => {});
      } catch (error) { /* ignore */ }
    }

    /**
     * Register the dictionaries, the main panel, the sidebar entry, the settings
     * section and the brand seats.
     * @param {any} ctx client root context
     */
    function apply(ctx) {
      const boundT = ctx.locale.bind(NS);
      CORE = { ctx, t: boundT, toast: null, version: '', actor: null };
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'annotation-workbench: dictionaries');
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, WorkbenchRoot));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => boundT('panel.title'),
        locale: NS,
      }, PanelIcon));
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: PANEL_ID,
        order: 25,
        label: () => boundT('settings.nav'),
        locale: NS,
      }, SettingsSection));
      ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, BrandMark));
      ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -1 }, BrandName));
      ctx.effect(() => {
        const previous = document.title;
        document.title = '标注台 · 数据标注工作台';
        return () => { document.title = previous; };
      }, 'annotation-workbench: document title');
      ctx.effect(() => {
        const onError = (event) => {
          reportClientError('window-error', event && event.error ? event.error : new Error(event && event.message ? event.message : 'window error'), '');
        };
        const onRejection = (event) => {
          const reason = event && event.reason;
          reportClientError('unhandled-rejection', reason instanceof Error ? reason : new Error(String(reason)), '');
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
          window.removeEventListener('error', onError);
          window.removeEventListener('unhandledrejection', onRejection);
        };
      }, 'annotation-workbench: client error reporting');
      autoOpen(ctx);
    }

    return { inject, apply };
  },
});
