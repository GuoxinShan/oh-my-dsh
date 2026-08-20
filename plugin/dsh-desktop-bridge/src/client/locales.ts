/** `desktop-bridge` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.text': 'web端',
  'badge.openBrowser': '在系统浏览器打开 web 端',
  'rail.toggle': '切换侧边栏',
  'rail.newSession': '新会话',
  'about.nav': '关于',
  'about.desktopVersion': 'Desktop 版本',
  'about.runtimeVersion': 'Harness 运行时',
  'about.runtimeCommit': '运行时提交',
  'about.updates': '软件更新',
  'about.check': '检查更新',
  'about.checking': '正在检查',
  'about.retry': '重试',
  'about.updateRestart': '更新并重启',
  'about.releaseNotes': '更新说明',
  'about.status.idle': '尚未检查更新',
  'about.status.checking': '正在检查更新…',
  'about.status.current': '已是最新版本',
  'about.status.available': '可以更新到 v{version}',
  'about.status.preparing': '正在准备更新…',
  'about.status.downloading': '正在下载 v{version}',
  'about.status.installing': '下载完成，正在校验并安装…',
  'about.status.restarting': '安装完成，正在重启…',
  'about.status.failed': '更新失败',
  'update.indicator.available': '更新到 v{version}',
  'update.indicator.progress': '正在下载更新：{percent}%',
  'update.indicator.applying': '正在安装更新，完成后自动重启',
} satisfies Record<string, string>

/** The namespace key union. */
export type DesktopBridgeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'badge.text': 'Web',
  'badge.openBrowser': 'Open the web end in the system browser',
  'rail.toggle': 'Toggle sidebar',
  'rail.newSession': 'New session',
  'about.nav': 'About',
  'about.desktopVersion': 'Desktop version',
  'about.runtimeVersion': 'Harness runtime',
  'about.runtimeCommit': 'Runtime commit',
  'about.updates': 'Software update',
  'about.check': 'Check for updates',
  'about.checking': 'Checking',
  'about.retry': 'Retry',
  'about.updateRestart': 'Update and restart',
  'about.releaseNotes': 'Release notes',
  'about.status.idle': 'Updates have not been checked',
  'about.status.checking': 'Checking for updates…',
  'about.status.current': 'Up to date',
  'about.status.available': 'Version v{version} is available',
  'about.status.preparing': 'Preparing the update…',
  'about.status.downloading': 'Downloading v{version}',
  'about.status.installing': 'Download complete, verifying and installing…',
  'about.status.restarting': 'Installed, restarting…',
  'about.status.failed': 'Update failed',
  'update.indicator.available': 'Update to v{version}',
  'update.indicator.progress': 'Downloading update: {percent}%',
  'update.indicator.applying': 'Installing update; the app will restart',
} satisfies Record<DesktopBridgeKey, string>

/** The locale namespace id this plugin registers. */
export const NS = 'desktop-bridge'
