/**
 * Built-in annotation templates. A template only seeds a project's schema and
 * demo data; users may edit the schema afterwards.
 *
 * @module @local/annotation-workbench/lib/templates
 */

/** @typedef {{ value: string, label: string }} Option */

const LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'other', label: '其他' },
];

const QUALITY = [
  { value: '5', label: '5 · 很好' },
  { value: '4', label: '4 · 较好' },
  { value: '3', label: '3 · 一般' },
  { value: '2', label: '2 · 较差' },
  { value: '1', label: '1 · 很差' },
];

const field = (id, label, type, extra = {}) => ({ id, label, type, ...extra });

/** @type {Record<string, {id:string,title:string,description:string,kind:string,schema:{fields:any[]},guideline:string}>} */
export const TEMPLATES = {
  text_classification: {
    id: 'text_classification',
    title: '文本分类 / 质检',
    description: '给一段文本打分类、情感、质量分，并可写备注。',
    kind: 'text',
    schema: {
      fields: [
        field('category', '分类', 'select', {
          required: true,
          options: [
            { value: 'news', label: '新闻' },
            { value: 'social', label: '社交媒体' },
            { value: 'review', label: '评论' },
            { value: 'other', label: '其他' },
          ],
        }),
        field('sentiment', '情感', 'select', {
          required: true,
          options: [
            { value: 'positive', label: '正面' },
            { value: 'neutral', label: '中性' },
            { value: 'negative', label: '负面' },
            { value: 'mixed', label: '混合' },
          ],
        }),
        field('confidence', '置信度', 'rating', { min: 1, max: 5, help: '1 表示拿不准，5 表示确定。' }),
        field('note', '备注', 'textarea', { placeholder: '边界情况、判断依据……' }),
      ],
    },
    guideline:
      '# 文本分类规范\n\n1. 先通读全文，再选主分类；一条数据只能有一个主分类。\n2. 情感以作者对主题的整体态度为准，不按单句判断。\n3. 拿不准时把置信度设为 1–2，并在备注写明两种候选。\n',
  },
  text_span: {
    id: 'text_span',
    title: '文本片段 / 实体抽取',
    description: '在原文中划词添加片段标签，适合 NER、关键句、引用抽取。',
    kind: 'text',
    schema: {
      fields: [
        field('spans', '片段', 'spans', {
          required: true,
          options: [
            { value: 'person', label: '人物' },
            { value: 'org', label: '组织' },
            { value: 'place', label: '地点' },
            { value: 'time', label: '时间' },
            { value: 'quote', label: '引用' },
          ],
          help: '在原文中选中文字后点“添加片段”。',
        }),
        field('note', '备注', 'textarea'),
      ],
    },
    guideline:
      '# 片段标注规范\n\n1. 只标原文中连续出现的片段，不改写原文。\n2. 同一片段只标一个主标签；边界包含完整实体。\n3. 无法确定时先不标，在备注里说明。\n',
  },
  image_classification: {
    id: 'image_classification',
    title: '图像分类 / OCR',
    description: '给图片打多标签、抄录主要文字并评估质量。',
    kind: 'image',
    schema: {
      fields: [
        field('labels', '图像标签', 'multiselect', {
          required: true,
          options: [
            { value: 'product', label: '商品' },
            { value: 'document', label: '文档' },
            { value: 'screenshot', label: '截图' },
            { value: 'scene', label: '场景' },
            { value: 'person', label: '人物' },
          ],
        }),
        field('ocr_text', '主要文字（OCR）', 'textarea', { help: '按阅读顺序抄录；没有文字留空。' }),
        field('quality', '图像质量', 'rating', { min: 1, max: 5 }),
      ],
    },
    guideline:
      '# 图像分类规范\n\n1. 多标签按主要程度排序，第一个是主标签。\n2. OCR 只抄图中实际出现的文字，不补全、不翻译。\n3. 模糊到无法辨认时质量分 ≤2，并在备注说明。\n',
  },
  image_bbox: {
    id: 'image_bbox',
    title: '图像框选 / OCR 区域',
    description: '拖拽画框，给每个框一个类别和可选文字。',
    kind: 'image',
    schema: {
      fields: [
        field('boxes', '标注框', 'bbox', {
          required: true,
          options: [
            { value: 'text', label: '文字' },
            { value: 'title', label: '标题' },
            { value: 'logo', label: 'Logo' },
            { value: 'object', label: '物体' },
          ],
          help: '在图上拖拽新建框；选中后可移动、缩放、删除。',
        }),
        field('caption', '整体说明', 'textarea'),
      ],
    },
    guideline:
      '# 框选规范\n\n1. 框紧贴目标外沿，不框入无关背景。\n2. 文字框按行或按语义块，同一个词不要拆成多个框。\n3. OCR 文字逐字照抄；看不清的字符用 □ 占位并备注。\n',
  },
  video_caption: {
    id: 'video_caption',
    title: '视频字幕 / 音频转写',
    description: '按时间轴切分字幕或转写，适合视频 caption、ASR 校对。',
    kind: 'video',
    schema: {
      fields: [
        field('segments', '字幕分段', 'segments', {
          required: true,
          help: '用播放器定位，[ 设起点、] 设终点；每段文字与时间段一一对应。',
        }),
        field('language', '语言', 'select', { required: true, options: LANGUAGES }),
        field('speaker', '说话人', 'text', { placeholder: '可选，例如 SPEAKER_1' }),
        field('notes', '备注', 'textarea'),
      ],
    },
    guideline:
      '# 字幕标注规范\n\n1. 按语义完整句切分，不把一句话拆成无意义碎片。\n2. 时间码以音频实际起止为准，前后留不超过 0.2 秒余量。\n3. 不增删原意；口误、语气词按项目要求保留或删除，并在备注说明。\n4. 听不清的片段用 [听不清] 标记，不要猜写。\n',
  },
  audio_transcript: {
    id: 'audio_transcript',
    title: '音频转写 / 说话人',
    description: '音频分段转写，可记录说话人和语言。',
    kind: 'audio',
    schema: {
      fields: [
        field('segments', '转写分段', 'segments', { required: true }),
        field('speaker', '说话人', 'text'),
        field('language', '语言', 'select', { required: true, options: LANGUAGES }),
        field('notes', '备注', 'textarea'),
      ],
    },
    guideline:
      '# 音频转写规范\n\n1. 按说话人切换或长停顿切分。\n2. 逐字转写，保留有意义的语气词；标记 [噪声]、[听不清]。\n3. 数字、专有名词按项目词表统一写法。\n',
  },
  llm_preference: {
    id: 'llm_preference',
    title: 'LLM 对话质量 / 偏好',
    description: '并排比较两个回答，选偏好、打质量分、写理由和风险标记。',
    kind: 'llm',
    schema: {
      fields: [
        field('preference', '偏好', 'select', {
          required: true,
          options: [
            { value: 'a', label: 'A 更好' },
            { value: 'b', label: 'B 更好' },
            { value: 'tie', label: '相当' },
            { value: 'both_bad', label: '都不好' },
          ],
        }),
        field('quality_a', 'A 质量', 'rating', { min: 1, max: 5 }),
        field('quality_b', 'B 质量', 'rating', { min: 1, max: 5 }),
        field('dimensions', '评估维度', 'multiselect', {
          options: [
            { value: 'correctness', label: '正确性' },
            { value: 'helpfulness', label: '有用性' },
            { value: 'instruction', label: '指令遵循' },
            { value: 'safety', label: '安全性' },
            { value: 'style', label: '表达' },
          ],
        }),
        field('rationale', '理由', 'textarea', { required: true, placeholder: '具体指出 A/B 的差异，至少一条证据。' }),
        field('flags', '风险标记', 'multiselect', {
          options: [
            { value: 'hallucination', label: '幻觉' },
            { value: 'unsafe', label: '不安全' },
            { value: 'refusal', label: '不当拒答' },
            { value: 'format', label: '格式问题' },
          ],
        }),
      ],
    },
    guideline:
      '# LLM 偏好标注规范\n\n1. 先判断是否满足用户指令，再比较正确性、有用性、表达。\n2. 偏好理由必须引用具体差异，不能只写“更好”。\n3. 两个都不合格时选“都不好”，并标出主要风险。\n4. 不因长度、格式好看而忽略事实错误。\n',
  },
  custom: {
    id: 'custom',
    title: '自定义',
    description: '从空白 schema 开始，适合先导入再设计字段。',
    kind: 'text',
    schema: {
      fields: [
        field('label', '标签', 'text'),
        field('note', '备注', 'textarea'),
      ],
    },
    guideline: '# 项目规范\n\n请在这里写字段定义、边界案例和验收标准。\n',
  },
};

/** Stable template list for the UI. */
export function listTemplates() {
  return Object.values(TEMPLATES).map((template) => ({
    id: template.id,
    title: template.title,
    description: template.description,
    kind: template.kind,
    fieldCount: template.schema.fields.length,
  }));
}

/** Resolve a template id, falling back to custom. */
export function getTemplate(id) {
  return TEMPLATES[id] ?? TEMPLATES.custom;
}

/** Clone a schema so callers cannot mutate the template. */
export function templateSchema(id) {
  return JSON.parse(JSON.stringify(getTemplate(id).schema));
}

/** Default guideline for a template. */
export function templateGuideline(id) {
  return getTemplate(id).guideline;
}

/** Tiny SVG used by the image/bbox demo project. */
export const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#f4f1ea"/>
  <rect x="80" y="80" width="800" height="120" rx="16" fill="#1f4e79"/>
  <text x="120" y="155" font-family="Arial, sans-serif" font-size="54" fill="#ffffff">标注台 · DEMO</text>
  <rect x="80" y="250" width="360" height="200" rx="20" fill="#d9e2f3"/>
  <circle cx="260" cy="350" r="70" fill="#2e75b6"/>
  <rect x="500" y="250" width="380" height="200" rx="20" fill="#fff2cc"/>
  <text x="540" y="320" font-family="Arial, sans-serif" font-size="34" fill="#7f6000">示例图片</text>
  <text x="540" y="370" font-family="Arial, sans-serif" font-size="26" fill="#7f6000">用于框选与 OCR 演示</text>
</svg>`;

/**
 * Sample items for a newly created project. They intentionally cover three
 * modalities so the workbench is usable without importing anything.
 * @param {string} templateId
 * @param {{now?: string}} [options]
 */
export function demoItems(templateId, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const base = (id, kind, media, payload, meta = {}) => ({
    id,
    kind,
    media,
    payload,
    meta: { durationMs: null, width: null, height: null, fps: null, ...meta },
    batch: 'DEMO',
    tags: ['demo'],
    priority: 0,
    createdAt: now,
  });
  if (templateId === 'video_caption' || templateId === 'audio_transcript') {
    return [
      base('demo-audio-1', 'audio', [{ path: 'media/demo-audio.txt', mime: 'text/plain' }], {
        note: '演示条目没有真实音频；请导入自己的媒体，或直接体验分段表单。',
        segments: [
          { start: 0, end: 2.4, text: '这是第一段演示字幕。' },
          { start: 2.6, end: 5.1, text: '第二段用来体验时间码编辑。' },
        ],
      }),
    ];
  }
  if (templateId === 'image_bbox' || templateId === 'image_classification') {
    return [
      base('demo-image-1', 'image', [{ path: 'media/demo-image.svg', mime: 'image/svg+xml' }], {
        caption: '用于演示图像查看与框选。',
      }, { width: 960, height: 540 }),
    ];
  }
  if (templateId === 'llm_preference') {
    return [
      base('demo-llm-1', 'llm', [], {
        messages: [
          { role: 'user', content: '用三句话解释什么是数据标注。' },
        ],
        candidates: [
          {
            id: 'A',
            model: 'demo-a',
            text: '数据标注是给原始数据补充结构化标签的过程。常见任务有分类、框选和转写。标注质量直接影响模型效果。',
          },
          {
            id: 'B',
            model: 'demo-b',
            text: '数据标注就是让模型变聪明。只要标得多就好。',
          },
        ],
      }),
    ];
  }
  if (templateId === 'text_span') {
    return [
      base('demo-text-2', 'text', [], {
        text: '2026 年 10 月，张三在杭州加入标注台项目，负责视频字幕复核。',
      }),
    ];
  }
  return [
    base('demo-text-1', 'text', [], {
      text: '这款耳机的音质不错，但佩戴久了会夹耳朵，续航大约六小时。',
    }),
    base('demo-text-2', 'text', [], {
      text: '标注台把项目放在本机目录，数据只留在当前电脑，完成后可直接导出。',
    }),
  ];
}
