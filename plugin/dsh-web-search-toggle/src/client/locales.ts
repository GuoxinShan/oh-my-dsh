/**
 * Bilingual copy for the web_search toggle settings row.
 *
 * @module dsh-web-search-toggle/client/locales
 */

export const zh = {
  'row.title': '原生网页搜索',
  'row.desc': '内置 web_search 工具由 DeepSeek 官方搜索 API 提供，与当前对话模型无关。',
  'key.configured': '密钥已配置（{ref}）',
  'key.missing': '未配置 {ref}',
  'key.hint': '在「插件 → Web Search」页配置 DeepSeek 官网 API Key 即可启用；若通过 MCP 服务器搜索，可关闭此开关以移除模型的原生搜索工具。',
  'toggle.on': '已开启',
  'toggle.off': '已关闭',
  'state.loading': '读取状态…',
  'state.error': '读取失败：{message}',
  'state.pending': '正在生效…',
} as const

export const en = {
  'row.title': 'Native web search',
  'row.desc': 'The built-in web_search tool is served by the official DeepSeek search API, independent of the chat model in use.',
  'key.configured': 'Key configured ({ref})',
  'key.missing': '{ref} not set',
  'key.hint': 'Configure a DeepSeek API key on the Plugins → Web Search page to enable it; if you search through MCP servers instead, turn this off to remove the native tool from the model.',
  'toggle.on': 'On',
  'toggle.off': 'Off',
  'state.loading': 'Reading state…',
  'state.error': 'Failed: {message}',
  'state.pending': 'Applying…',
} as const

/** Every dictionary key. */
export type WebSearchLocaleKey = keyof typeof zh
