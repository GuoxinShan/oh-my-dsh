/**
 * Dictionary namespace owned by this plugin: the send button's accessible
 * label, mirroring ui-conversation's 'input.send' copy in both locales.
 */
export const zh = {
  'send.label': '发送消息',
} as const

export const en = {
  'send.label': 'Send message',
} as const

export type SendWhileRunningKey = keyof typeof zh
