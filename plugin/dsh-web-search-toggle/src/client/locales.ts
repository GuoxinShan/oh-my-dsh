/**
 * Bilingual copy for the web_search toggle settings row.
 *
 * @module dsh-web-search-toggle/client/locales
 */

export const zh = {
  'row.title': '原生网页搜索（web_search）',
  'row.desc': '内置 web_search 工具经 DeepSeek 官方搜索 API 提供服务，与当前对话模型无关。',
  'key.configured': 'DeepSeek API Key（{ref}）已配置，工具可用。',
  'key.missing': '未检测到 {ref}。请在「设置 → 插件 → Web Search」配置 DeepSeek 官网 API Key；若改用 MCP 搜索（如 web-search-prime），建议关闭本开关，避免模型调用报错。',
  'toggle.on': '已开启：向模型注册 web_search 工具',
  'toggle.off': '已关闭：不再向模型注册 web_search 工具',
  'toggle.action.on': '开启',
  'toggle.action.off': '关闭',
  'state.loading': '读取状态中…',
  'state.error': '状态读取失败：{message}',
  'state.pending': '已保存，等待组合热更新生效…',
} as const

export const en = {
  'row.title': 'Native web search (web_search)',
  'row.desc': 'The built-in web_search tool is served by the official DeepSeek search API, independent of the chat model in use.',
  'key.configured': 'DeepSeek API key ({ref}) is configured; the tool is usable.',
  'key.missing': 'No {ref} found. Configure a DeepSeek API key under "Settings → Plugins → Web Search", or turn this toggle off when searching through MCP servers (e.g. web-search-prime) so the model never calls a broken tool.',
  'toggle.on': 'On: the web_search tool is registered for the model',
  'toggle.off': 'Off: the web_search tool is not registered',
  'toggle.action.on': 'Enable',
  'toggle.action.off': 'Disable',
  'state.loading': 'Reading state…',
  'state.error': 'Failed to read state: {message}',
  'state.pending': 'Saved; waiting for the live composition to apply it…',
} as const

/** Every dictionary key. */
export type WebSearchLocaleKey = keyof typeof zh
