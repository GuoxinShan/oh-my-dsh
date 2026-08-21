# 2026-08-21 · Web Search 开关覆盖 Agent Preset scope

## 问题

`dsh-web-search-toggle` 0.1.2 只在 `$DSH_HOME/cordis.patch.yml` 写入根层 `tool-web disabled: true`。自工具行迁入 Agent Preset 后，`standard`、`code`、`cordis` 等 preset 会在各自 scope 内再次注册 `@deepseek-ai/dsh-tool-web`。根行已禁用并不影响这些 scoped registration，因此 UI 显示关闭而下一次 Agent assembly 仍包含原生 `web_search`。

这不是 provider 注册问题。搜索 provider 属于 Host seam，应保持挂载；开关只控制模型能力的可见性与可执行性。

## 决策

0.1.3 保留 home patch 受管块作为唯一持久化事实源，同时在 Host gateway fiber 内增加两层全局策略：

1. 以 `{ global: true }` 监听最终 `system-prompt/assemble` waterfall。该事件按 Agent scope 过滤，Host 根 context 的普通 listener 只收到无 scope 的 assembly；显式 global listener 才覆盖所有 Agent Preset。关闭时结构化过滤 tool schema `web_search` 与配套 section `tool:web_search`；不修改 shipped preset，也不枚举 Agent。
2. 注册 `ctx.tools.guard()`。关闭时精确拒绝 `web_search`，覆盖已经发给模型的旧请求、历史重放与 Code Mode 间接分派；`web_fetch` 和 `mcp__*` 搜索工具不受影响。

两层都在使用时读取 home patch。设置写入后的下一次模型 step 即采用新状态，不依赖 loader 是否已经完成根行重组。guard 是同步 API，只在命中精确工具名时同步读一次小文件；其他工具零文件 I/O。

`tools.restrict()` 不适合这里：restriction 只过滤调用 scope 继承的工具，不会删除该 scope 自己注册的 preset 工具。assembly waterfall 是最终模型输入的权威扩展点，guard 则是执行侧的单调拒绝边界。

## 回归契约

- off：assembly 不含 `web_search` / `tool:web_search`，执行 guard 返回通用设置关闭原因；
- on：assembly 与执行均保持原行为；
- `web_fetch`、MCP 搜索、contexts、variables 与其他 prompt sections 保持不变；
- 无原生搜索贡献时过滤函数保持对象 identity，避免无意义 churn。
