/**
 * Bilingual copy for the web_search toggle settings row.
 *
 * @module dsh-web-search-toggle/client/locales
 */

export const zh = {
  'row.title': 'Web Search',
  'row.desc': '由 DeepSeek 官方搜索 API 提供，与当前对话使用的模型无关。',
  'key.configured': '密钥已配置',
  'key.missing': '密钥未配置',
  'key.hint': '请在「插件 → Web Search」中配置 DeepSeek API Key；使用 MCP 搜索时可关闭此项。',
  'toggle.label': '启用 Web Search',
  'toggle.on': '已开启',
  'toggle.off': '已关闭',
  'state.loading': '读取状态…',
  'state.error': '读取失败：{message}',
  'state.pending': '正在生效…',
} as const

export const en = {
  'row.title': 'Web Search',
  'row.desc': 'Provided by the official DeepSeek search API, independently of the model used for this conversation.',
  'key.configured': 'Key configured',
  'key.missing': 'Key not configured',
  'key.hint': 'Configure a DeepSeek API key under Plugins → Web Search, or turn this off when using MCP search.',
  'toggle.label': 'Enable Web Search',
  'toggle.on': 'On',
  'toggle.off': 'Off',
  'state.loading': 'Reading state…',
  'state.error': 'Failed: {message}',
  'state.pending': 'Applying…',
} as const

/** Every dictionary key. */
export type WebSearchLocaleKey = keyof typeof zh
