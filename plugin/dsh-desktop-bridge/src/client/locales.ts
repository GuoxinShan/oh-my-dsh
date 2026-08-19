/** `desktop-bridge` namespace dictionaries (badge copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.text': 'web端',
  'badge.openBrowser': '在系统浏览器打开 web 端',
  'rail.toggle': '切换侧边栏',
  'rail.newSession': '新会话',
} satisfies Record<string, string>

/** The namespace key union. */
export type DesktopBridgeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'badge.text': 'Web',
  'badge.openBrowser': 'Open the web end in the system browser',
  'rail.toggle': 'Toggle sidebar',
  'rail.newSession': 'New session',
} satisfies Record<DesktopBridgeKey, string>

/** The locale namespace id this plugin registers. */
export const NS = 'desktop-bridge'
