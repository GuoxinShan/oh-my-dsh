# stock 层次压缩接管与兼容 Provider 保留（2026-08-22）

## 问题

Oh My DSH 的 shipped Agent Preset 在各自隔离的 `compaction` realm 内挂载 `@deepseek-ai/dsh-compaction-basic`。Desktop 虽然随包安装 `dsh-compaction-hierarchical`，但其根 patch 刻意为空；因此用户不复制并修改 preset 时，长历史仍交给 stock 的单次摘要请求。一次摘要输入本身超过摘要模型窗口时，Provider 返回 `CONTEXT_WINDOW_EXCEEDED`，basic 的自动监听只记录失败并保留原表层，下一轮会重放同一超预算输入。

## 决策

有界层次 fallback 并入 Harness fork 的 `dsh-compaction-basic`，不修改 shipped preset，也不扫描或重写用户 `.agent-presets`。这是默认行为缺陷而不是 Desktop 组合差异：fix PR 为 [fork #9](https://github.com/aka-danielZhang/deepseek-harness/pull/9)，上游反馈为 [Discussion #3948](https://github.com/deepseek-ai/deepseek-harness/discussions/3948)。fork 发 `v0.1.1-rc.1+zw.2` / npm `0.1.1-rc.1.zw.2`，Desktop 的 `FORK_MODIFIED` 增加 `@deepseek-ai/dsh-compaction-basic`。

standalone `dsh-compaction-hierarchical` 不 tombstone、不从 Desktop 安装事务移除，升为 0.1.3 后继续承担两个兼容场景：

- 官方 upstream 尚未合入 fork 修复的安装，仍可显式替换 preset Provider；
- 已有用户 preset 可能直接引用包名，保留安装可避免 Loader 解析失败。

新 Oh My DSH preset 不再需要替换 Provider。Desktop 继续安装兼容包，但这不代表默认 preset 使用它；默认能力来自 stock basic。完整移除只能在有事务化 preset 引用迁移时另行决定，不能以删除包的方式让用户配置突然失效。

## 行为边界

fork basic 保留能放入窗口的原单次摘要请求和 KV cache 路径；只有静态预算不能容纳，或该请求收到 canonical Provider 超窗时，才进入 tool-balanced map/reduce。整个 hierarchy 完成前不写 durable replacement，任一非容量失败、截断、结构错误、取消、无进展或深度耗尽都 fail closed。

兼容插件 0.1.3 同步修正输出预留：map 前只要求 map cap 可放入窗口；只有 map 产生多个 partial、确实要 reduce 时才校验 reduce cap。较小窗口下单 map 已可完成的请求不再被未执行的 reduce 上限提前拒绝。兼容包还按 stock Config schema 做能力检测：新版 basic 声明全部五个 hierarchy 字段时完整透传现有 preset 的调优值，避免 `super.summarize()` 内部 fallback 偷换成 stock 默认值；旧 official basic 不认识这些字段时仍先剥离，再交给其严格 resolver。

## 分发

- fork 发布集从 committed HEAD 的 `node scripts/publish-fork.mjs --list` 推导，共 11 包，必须包含 `dsh-compaction-basic`；Desktop 名单与其逐项一致。
- `scripts/prepare-runtime.mjs` 的 assembly revision 升到 8，防同一 runtime SHA 复用旧的 10 包闭包。
- Desktop 先等待 11 个 `@crazx/*@0.1.1-rc.1.zw.2` 全部可见，再更新 `runtime/revision.json`；缺任一包时 prepare 继续 fail loud。
- 插件 tag `dsh-compaction-hierarchical-v0.1.3` 保持 `make_latest: false`；Desktop tag `v0.2.0-rc.17` 保持非 prerelease 且 `make_latest: true`。

## 验证要求

fork 侧聚焦套件、100% source coverage、完整 typecheck/build 和 npm dry-run 通过后才打 tag。Desktop 侧至少通过兼容插件 typecheck/test/build、全插件检查、runtime 组装、Rust test/check、bundle prepare 与安装态 smoke；macOS/Windows Release 两侧成功后才更新 latest。