/**
 * Dictionary namespace owned by this plugin: the rail's accessible name, the
 * expanded panel's header, and the fallback text for attachment-only
 * messages. Both locales ship together (M2 bilingual posture).
 */
export const zh = {
  'rail.ariaLabel': '我的问题刻度尺',
  'message.nonText': '[图片或附件]',
} as const

export const en = {
  'rail.ariaLabel': 'My questions ruler',
  'message.nonText': '[image or attachment]',
} as const

export type QuestionRailKey = keyof typeof zh
