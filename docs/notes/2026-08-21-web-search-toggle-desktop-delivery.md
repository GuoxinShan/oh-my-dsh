# Web Search toggle 的 Desktop 交付边界

日期：2026-08-21

## 背景

`dsh-web-search-toggle` 0.1.3 修复了关闭 Web Search 后，Agent Preset 自有 `web_search` 工具仍可见、可执行的问题。插件已能独立通过 `dsh-web-search-toggle-v0.1.3` Release 分发，但现有 Desktop 安装不会因此自动取得新插件，也不会自动改写其 Web Profile。

## 决策

从 Desktop `0.2.0-rc.14` 起，把 `dsh-web-search-toggle` 0.1.3 纳入 desktop-owned 资源集合，与 bridge、hierarchical compaction 一起交付：

- prepare 对插件执行 typecheck、test、build，并强制校验 package name/version 恰为 `dsh-web-search-toggle` 0.1.3；
- 归档为 `resources/web-search-toggle.tar.gz`，版本与 tarball sha256 写入 `runtime-revision.json`；
- 壳按内容哈希原子解压到 `~/.dsh-desktop/plugins/dsh-web-search-toggle/`；
- bridge、compaction、Web Search toggle 在同一个 Web Profile CAS 事务中执行 `plugin add`，不允许出现只安装其中一部分的状态；
- archive 不携带 `node_modules`。安装后把插件所需 Host/Client Harness peers 链接到组装 runtime 的同一物理模块实例，避免 Cordis、Service 与 Typert 注册表因模块副本分裂；
- macOS 与 Windows Desktop 构建都必须生成并携带该资源。

## 为什么必须发新的 Desktop

插件 Release 和 Desktop Release 是两个独立交付面。插件 tag 只提供手动安装用 archive；Desktop 自动更新只下载新的 Desktop 安装包及其内置资源。既有 Desktop 不会追踪插件 Release，也不会从插件 tag 更新 Web Profile。

因此 desktop-owned 插件首次加入或版本升级时，必须同步提升 Desktop 版本并发布新 Desktop。0.1.3 的交付版本定为 `v0.2.0-rc.14`；该 GitHub Release 保持 `prerelease: false` 和 `make_latest: true`，以维持 `releases/latest/download/latest.json` 自动更新链。

## 非目标

- 不把 `dsh-web-search-toggle` 发布到 npm；它不在 npm allowlist。
- 不修改 shipped Agent Preset。
- 不关闭或移除 DeepSeek Web provider；开关只控制 native Web Search 工具的装配与执行策略。
- 不改变用户当前 Web Search 状态；Desktop 只交付实现，既有 home patch 状态保持不变。
