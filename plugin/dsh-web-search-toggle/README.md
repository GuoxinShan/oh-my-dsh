# dsh-web-search-toggle

通用设置页的「原生网页搜索」开关（双面插件）。

## 它解决什么

内置 `web_search` 工具与**当前对话模型无关**——它由 DeepSeek 官方搜索 API（`deepseek-v4-flash` + 服务端搜索工具）提供服务，只依赖 Models 页管理的同一个 `DEEPSEEK_API_KEY` 凭据。但存在两个实际痛点：

1. 没配 DeepSeek key 时，`web_search` 仍然对模型可见（上游刻意设计），模型调用即报 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`——一个会踩的假工具；
2. `tool-web` 行的 `search` 开关是组合层 config，GUI 没有入口；改用 MCP 搜索（web-search-prime 等）的用户无处关闭原生工具。

本插件在 **设置 → 通用** 页注入一行：

- 显示 `DEEPSEEK_API_KEY`（或 `web-search-deepseek` 设置指定的 `apiKeyEnv`）是否已配置；
- 未配置时提示去「设置 → 插件 → Web Search」配置，或建议关闭本开关；
- 开关**关闭**＝在 home patch 层（`$DSH_HOME/cordis.patch.yml`）写入受管块 `- id: tool-web / disabled: true`（loader 的文档化行开关，telemetry 同款；文件被 harness 实时监听，保存即热生效）；**开启**＝移除受管块。

受管块用标记注释包裹、纯文本拼接——绝不重排文件里用户手写的其他条目与注释。

## 安装

```sh
dsh plugin --profile <profile> add <this-repo>/plugin/dsh-web-search-toggle
```

## 行为边界

- 开关只增删自己的受管块；用户手写的 `tool-web` 覆盖（若有）优先级相同但互不感知，避免混用；
- 凭据状态是建议性提示，不是开关的门卫——关闭开关永远合法；
- 组合热更新异步生效，UI 保存后短暂显示「等待生效」；
- Host 网关行 + 浏览器设置行各一（`cordis.patch.yml`），Remote 走 Typert 直连（mcp-settings 同款模式）。

## 开发

```sh
pnpm install && pnpm run typecheck && pnpm run test && pnpm run build
```
