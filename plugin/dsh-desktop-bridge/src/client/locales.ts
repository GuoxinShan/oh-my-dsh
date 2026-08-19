/** `desktop-bridge` namespace dictionaries (badge + About settings copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.text': 'web端',
  'badge.openBrowser': '在系统浏览器打开 web 端',
  'about.nav': '关于',
  'about.desktopVersion': 'Desktop 版本',
  'about.harnessVersion': 'DeepSeek Harness 版本',
  'about.runtime': '运行时',
  'about.updates': '更新',
  'about.check': '检查更新',
  'about.checking': '正在检查…',
  'about.current': '已是最新版本',
  'about.apply': '更新到',
  'about.applying': '正在下载并安装，应用将自动重启…',
  'about.failed': '检查失败（悬停查看详情）',
  'rail.toggle': '切换侧边栏',
  'rail.newSession': '新会话',
} satisfies Record<string, string>

/** The namespace key union. */
export type DesktopBridgeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'badge.text': 'Web',
  'badge.openBrowser': 'Open the web end in the system browser',
  'about.nav': 'About',
  'about.desktopVersion': 'Desktop version',
  'about.harnessVersion': 'DeepSeek Harness version',
  'about.runtime': 'Runtime',
  'about.updates': 'Updates',
  'about.check': 'Check for updates',
  'about.checking': 'Checking…',
  'about.current': 'Up to date',
  'about.apply': 'Update to',
  'about.applying': 'Downloading & installing, the app will restart…',
  'about.failed': 'Check failed (hover for details)',
  'rail.toggle': 'Toggle sidebar',
  'rail.newSession': 'New session',
} satisfies Record<DesktopBridgeKey, string>

/** The locale namespace id this plugin registers. */
export const NS = 'desktop-bridge'
