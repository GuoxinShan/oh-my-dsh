/** `desktop-bridge` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.text': 'web端',
  'badge.openBrowser': '在系统浏览器打开 web 端',
  'notify.turnDone': '回合已完成',
  'notify.awaitInput': '等待你的输入',
  'notify.center': '通知',
  'notify.empty': '暂无通知',
  'notify.clear': '清空',
  'notify.justNow': '刚刚',
  'notify.minutesAgo': '{n} 分钟前',
  'notify.hoursAgo': '{n} 小时前',
  'rail.toggle': '切换侧边栏',
  'rail.newSession': '新会话',
  'update.available': '下载 v{version}',
  'update.progress': '正在下载更新：{percent}%',
  'update.preparing': '正在准备更新',
  'update.ready': 'v{version} 已下载',
  'update.failed': '更新下载失败，点击重试',
  'update.installing': '正在安装更新，完成后自动重启',
  'update.confirm.title': '安装 v{version}',
  'update.confirm.description': '已完成签名校验。安装后应用会重启。',
  'update.confirm.notes': '更新说明',
  'update.confirm.empty': '此版本没有附带更新说明。',
  'update.confirm.later': '稍后',
  'update.confirm.install': '安装并重启',
  'update.confirm.download': '打开下载页',
  'update.confirm.downloadTitle': '下载 v{version}',
  'update.confirm.downloadDescription': '新版无法自动热更新。确认后将打开 GitHub Releases 下载页。',
} satisfies Record<string, string>

/** The namespace key union. */
export type DesktopBridgeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'badge.text': 'Web',
  'badge.openBrowser': 'Open the web end in the system browser',
  'notify.turnDone': 'Turn finished',
  'notify.awaitInput': 'Waiting for your input',
  'notify.center': 'Notifications',
  'notify.empty': 'No notifications',
  'notify.clear': 'Clear',
  'notify.justNow': 'Just now',
  'notify.minutesAgo': '{n}m ago',
  'notify.hoursAgo': '{n}h ago',
  'rail.toggle': 'Toggle sidebar',
  'rail.newSession': 'New session',
  'update.available': 'Download v{version}',
  'update.progress': 'Downloading update: {percent}%',
  'update.preparing': 'Preparing update',
  'update.ready': 'v{version} downloaded',
  'update.failed': 'Update download failed; click to retry',
  'update.installing': 'Installing update; the app will restart',
  'update.confirm.title': 'Install v{version}',
  'update.confirm.description': 'Signature verified. Installing will restart the app.',
  'update.confirm.notes': 'Release notes',
  'update.confirm.empty': 'This release has no notes.',
  'update.confirm.later': 'Later',
  'update.confirm.install': 'Install and restart',
  'update.confirm.download': 'Open download page',
  'update.confirm.downloadTitle': 'Download v{version}',
  'update.confirm.downloadDescription': 'This release cannot be installed in place. Confirm to open the GitHub Releases page.',
} satisfies Record<DesktopBridgeKey, string>

/** The locale namespace id this plugin registers. */
export const NS = 'desktop-bridge'
