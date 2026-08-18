/** `desktop-bridge` namespace dictionaries (the badge copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.text': '桌面版',
  'badge.openBrowser': '在系统浏览器中打开当前界面',
} satisfies Record<string, string>

/** The namespace key union. */
export type DesktopBridgeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'badge.text': 'Desktop',
  'badge.openBrowser': 'Open the current view in the system browser',
} satisfies Record<DesktopBridgeKey, string>

/** The locale namespace id this plugin registers. */
export const NS = 'desktop-bridge'
