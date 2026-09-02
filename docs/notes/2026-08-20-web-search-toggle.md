# 2026-08-20 · dsh-web-search-toggle：原生 web_search 的通用设置开关

## 背景

用户观察到「预置模式都有 search 工具，但配置非 DeepSeek 模型就没法用」。查源码纠正了前提：内置 `web_search`（`packages/web/web-search-deepseek`）与**聊天模型完全无关**——它是对 DeepSeek 官方搜索 API（Anthropic 兼容 Messages 端点，`deepseek-v4-flash` + 服务端 `web_search` 工具）的一次独立辅助请求，只复用 Models 页管理的 `DEEPSEEK_API_KEY` 凭据。真实痛点是：

1. 没配 DeepSeek key 时 `web_search` 仍对模型可见（tool-web 刻意设计 "enabled tool remains visible when its provider is unavailable"），模型调用即 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`——假工具；
2. `tool-web` 行的 `search` 开关是组合层 config，GUI 无入口；改用 MCP 搜索（web-search-prime）的用户无法关闭原生工具，提示也不存在。

## 方案（B：出树插件，不动 harness 本体）

`plugin/dsh-web-search-toggle/`，双面：

- **Host 网关行**（`dsh-web-search-toggle/gateway`）：Typert Remote 服务 `webSearchToggle`，`get`/`set` 两个直连方法。`get` 投影开关状态 + `DEEPSEEK_API_KEY`（或 `web-search-deepseek` 设置的 `apiKeyEnv`）凭据解析状态（字面 `apiKey` > credentials 服务 > 缺省 ref，镜像 provider 自己的解析顺序）；`set` 重写 home patch 文件的受管块。
- **浏览器设置行**（`dsh-web-search-toggle`）：`settings.general.item` 加性槽（order 15，AppearanceRow 同款注入模式）注册「Web Search」设置行——左侧展示说明与不含凭据引用名的密钥状态/缺失提示（指向 设置→插件→Web Search），右侧按通用设置 Setting-Cell 布局放置开关，并保留保存后的「等待热更新」过渡态。Remote 走 `$mount` 自挂贡献（mcp-settings 同款，防 shell 未选命名空间）。

**开关机制**：home patch 层（`$DSH_HOME/cordis.patch.yml`）的受管块 `- id: tool-web / disabled: true`，用标记注释（`# BEGIN/END dsh-web-search-toggle`）包裹、**纯文本拼接**——不 YAML 重排，用户手写的条目和注释逐字节保留。`disabled: true` 是 loader 的文档化行开关（DSH_TELEMETRY_DISABLED 同款）；home patch 被 `watchUserPatches` 实时监听，保存即热重组，无需重启。模型工具迁入 Agent Preset scope 后，0.1.3 另在 Host 侧过滤最终 prompt assembly 并增加执行 guard；补充决策见 `2026-08-21-web-search-toggle-preset-scope.md`。

## 踩坑记录

1. **`[]` + 块 = YAML 双文档解析错误**：harness 新建的 home patch 就是 `[]\n`，天真 append 会产出 loader 拒收的文件（"Unexpected seq-item-ind at node end"）。`appendBlock` 在列表为空（只剩注释）时先摘掉 `[]` 行再拼块；re-enable 后回落到 harness 原生 `[]\n` 形态。单测用真实 `yaml` 包断言产物可解析。
2. **tsdown 0.22 的 `external` 与 `deps.neverBundle` 互斥**（"`external` is deprecated. Cannot be used with `deps.neverBundle`"）——client 构建只写 `deps`（mcp-settings 的配置就是对的）。
3. `@Remote` 标准装饰器与 `erasableSyntaxOnly` 冲突：tsconfig 去掉该 flag，tsdown 用 mcp-settings 的 `standardDecoratorPlugin` 预转译。
4. `SettingsNamespace` 是 branded type。0.1.2 起不再导出 `settingsNamespace()`，用 `'web-search-deepseek' as SettingsNamespace`（0.1.4）。
5. typert Remote 的 HTTP 不可 curl 直达（unary 路由是固定白名单，Remote 走流式通道）——端到端验证用文件级 + host 存活性判定。

## 验证

- 单元测试 14 个全过：11 个 Host/文案/patch 回归，以及 3 个组件测试覆盖快速提交不闪「应用中」、慢提交延迟反馈与错误收敛。
- scratch home 实机：`plugin add` → boot 200 → 通过构建产物执行 disable（写出的块 `parse` 为 `[{id:'tool-web',disabled:true}]`）→ HMR 重组后 host 存活零错误 → re-enable 回 `[]\n` → host 存活。

## 已知边界

- 开关只管理自己的受管块；用户手写 `tool-web` 覆盖（若有）同为 home patch 层条目，二者互不感知——文档建议别混用。
- key 状态是建议性提示，不是开关门卫；关闭永远合法。
- `settings.general.item` 槽依赖 ui-settings-general 的声明（root scope 加性 list），harness 结构变更需同步。
