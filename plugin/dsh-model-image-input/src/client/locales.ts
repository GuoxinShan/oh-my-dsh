/** Copy dictionaries for the model image-input settings-card injection. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  tooltip: 'Image input: {state}',
  optionInherit: 'Provider default (text only)',
  optionText: 'Text only',
  optionImage: 'Text and images',
  stateInherit: 'provider default',
  stateText: 'text only',
  stateImage: 'text and images',
  notEditable: 'This row is not in a saved custom catalog yet; save or reopen the card first.',
  writing: 'Writing…',
  writeFailed: 'Saving failed: {message}',
  unavailable: 'The llm-pi-ai settings namespace is unavailable.',
} as const

/** The settings.modelImage namespace key union. */
export type ModelImageLocaleKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in ModelImageLocaleKey]: string } = {
  tooltip: '图片输入：{state}',
  optionInherit: '跟随提供方默认（仅文本）',
  optionText: '仅文本',
  optionImage: '文本和图片',
  stateInherit: '跟随提供方默认',
  stateText: '仅文本',
  stateImage: '文本和图片',
  notEditable: '该行还不属于已保存的自定义目录，请先保存或重新打开卡片。',
  writing: '写入中…',
  writeFailed: '保存失败：{message}',
  unavailable: 'llm-pi-ai 设置命名空间不可用。',
}
