/** Copy dictionaries for the model image-input settings section. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  nav: 'Image input',
  title: 'Image input',
  intro: 'Declare which custom models accept image attachments. Changes are written to the provider\'s model catalog and take effect immediately.',
  empty: 'No editable model catalog yet. Add models to a custom provider on the Models page first, then declare image support here.',
  loading: 'Loading settings…',
  unavailable: 'Settings are unavailable in this window.',
  inputLabel: 'Image input',
  optionInherit: 'Provider default',
  optionText: 'Text only',
  optionImage: 'Text and images',
  save: 'Save changes',
  saving: 'Saving…',
  saved: 'Saved.',
  saveFailed: 'Saving failed.',
  readOnly: 'The settings document is read-only in this deployment.',
  hint: '"Provider default" leaves a model as configured — a custom provider\'s default accepts text only. "Text only" can also correct a preset catalog entry whose images your endpoint refuses.',
} as const

/** The settings.modelImage namespace key union. */
export type ModelImageLocaleKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in ModelImageLocaleKey]: string } = {
  nav: '图片输入',
  title: '图片输入',
  intro: '为自定义模型声明是否接收图片附件。修改会写入该提供方的模型目录，并立即生效。',
  empty: '还没有可编辑的模型目录。请先在「模型」页给自定义提供方添加模型，再在这里声明图片支持。',
  loading: '正在加载设置…',
  unavailable: '此窗口中设置不可用。',
  inputLabel: '图片输入',
  optionInherit: '跟随提供方默认',
  optionText: '仅文本',
  optionImage: '文本和图片',
  save: '保存修改',
  saving: '保存中…',
  saved: '已保存。',
  saveFailed: '保存失败。',
  readOnly: '当前部署的设置文档为只读。',
  hint: '「跟随提供方默认」不改动模型声明——自定义提供方的默认只接收文本；选择「仅文本」也可以纠正预置目录里端点并不支持的图片声明。',
}
