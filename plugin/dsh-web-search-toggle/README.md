# dsh-web-search-toggle

通用设置页的「Web Search」开关（双面插件）。

## 它解决什么

内置 `web_search` 工具与**当前对话模型无关**——它由 DeepSeek 官方搜索 API（`deepseek-v4-flash` + 服务端搜索工具）提供服务，只依赖 Models 页管理的同一个 `DEEPSEEK_API_KEY` 凭据。但存在两个实际痛点：

1. 没配 DeepSeek key 时，`web_search` 仍然对模型可见（上游刻意设计），模型调用即报 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`——一个会踩的假工具；
2. `tool-web` 行的 `search` 开关是组合层 config，GUI 没有入口；改用 MCP 搜索（web-search-prime 等）的用户无处关闭原生工具。

本插件在 **设置 → 通用** 页注入一行：

- 显示 `DEEPSEEK_API_KEY`（或 `web-search-deepseek` 设置指定的 `apiKeyEnv`）是否已配置；
- 未配置时提示去「设置 → 插件 → Web Search」配置，或建议关闭本开关；
- 开关**关闭**＝在 home patch 层（`$DSH_HOME/cordis.patch.yml`）写入受管块 `- id: tool-web / disabled: true`，并在 Host 侧从每个 Agent Preset 的最终 prompt assembly 中过滤 `web_search` schema 与 `tool:web_search` 指引；执行 guard 同时拒绝旧历史或 Code Mode 的间接调用；**开启**＝移除受管块并停止过滤/拒绝。

受管块用标记注释包裹、纯文本拼接——绝不重排文件里用户手写的其他条目与注释。它是开关唯一的持久化事实源；Host 策略在每次模型 step 和 `web_search` 执行时读取，因此现有 Agent、新建 Agent、子 Agent 以及所有 preset 都使用同一状态，无需复制或修改 shipped preset。

## 安装

```sh
dsh plugin --profile <profile> add <this-repo>/plugin/dsh-web-search-toggle
```

## 行为边界

- 开关只增删自己的受管块；用户手写的 `tool-web` 覆盖（若有）优先级相同但互不感知，避免混用；
- 关闭发生在下一次模型 step；已经发给模型的请求不会被追溯修改，但其返回的迟到 `web_search` 调用会被 guard 拒绝；
- 只过滤原生工具的精确名称 `web_search` 和提示段 `tool:web_search`，`web_fetch` 及 `mcp__*` 搜索工具不受影响；
- 凭据状态是建议性提示，不是开关的门卫——关闭开关永远合法；
- Host 网关行 + 浏览器设置行各一（`cordis.patch.yml`），Remote 走 Typert 直连（mcp-settings 同款模式）。

## 开发

```sh
pnpm install && pnpm run typecheck && pnpm run test && pnpm run build
```
