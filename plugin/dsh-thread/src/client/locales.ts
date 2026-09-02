/**
 * Bilingual copy for the Thread settings row.
 *
 * @module dsh-thread/client/locales
 */

export const zh = {
  'row.title': 'Thread',
  'row.desc': '开启后，每个会话都会注入 thread_handoff 工具，并显示会话头部的 Thread 按钮与面板；关闭后全部隐藏。',
  'toggle.label': '启用 Thread',
  'toggle.on': '已开启',
  'toggle.off': '已关闭',
  'state.pending': '应用中…',
} as const

export const en = {
  'row.title': 'Thread',
  'row.desc': 'When on, every session gets the thread_handoff tool plus the Thread header button and panel; when off, all of them are hidden.',
  'toggle.label': 'Enable Thread',
  'toggle.on': 'On',
  'toggle.off': 'Off',
  'state.pending': 'Applying…',
} as const

/** Every dictionary key. */
export type ThreadLocaleKey = keyof typeof zh
