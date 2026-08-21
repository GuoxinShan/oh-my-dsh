# dsh-compaction-hierarchical

DSH 的 host-only 分块压缩 Provider，用较小上下文模型接管较大模型积累的长会话。

## 行为

插件继承 `@deepseek-ai/dsh-compaction-basic`，保留其 token 压力策略、近期尾部保留、工具结果剪枝、持久锁、表层替换、失败回滚、`/compact` 和 `CONTEXT_WINDOW_EXCEEDED` 自动恢复。唯一变化是摘要阶段：完整输入能放进摘要模型预算时仍走 basic 的一次调用；超出预算时按完整消息和工具调用/结果边界切块，依次生成结构化局部检查点，再递归归并为一个最终检查点。Provider 若仍判定某个 map/reduce span 超窗，插件会只二分失败 span 并保留已成功的兄弟结果，直到调用成功或定位到一个不可再拆的原子单元。

除可自适应恢复的 Provider 超窗外，任一 map/reduce 调用失败、输出截断、缺少固定章节、无法组合局部摘要或超过递归深度时，摘要事务失败关闭，原会话表层保持不变。reduce 二分若不能减少 partial 数量也会立即失败，避免无进展重试。可选的 stock tool-result pruner 若已在摘要前落地，其持久替换仍按 basic 的既有语义保留。

## 安装与激活

源码路径安装先生成 host bundle，再把包装进使用该 preset 的 Profile，使 Loader 可以解析包名：

```sh
cd <this-repo>/plugin/dsh-compaction-hierarchical
pnpm install
pnpm run build
dsh plugin --profile web add "$PWD"
```

发布 tarball 已包含 `lib/index.js`，不需要在目标机器重建。

`cordis.patch.yml` 刻意为空。rc.8 的 compaction Provider 属于每个 agent preset 的隔离 `compaction` realm；在 Profile 根层注册另一个 `ctx.compaction` 会造成跨会话服务冲突，也无法替换 preset 内的实例。

复制一个 shipped preset 到用户 preset 目录，再在副本现有的 `compaction` group 内仅替换 Provider 行。不要编辑部署自带的 preset，也不要移走同组的 `command-compact` 和 `tool-result-pruner`：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: dsh-compaction-hierarchical
      config:
        thresholdRatio: 0.8
        retainRatio: 0.16
        chunkInputRatio: 0.6
        mapMaxTokens: 4096
        reduceMaxTokens: 8192
        maxDepth: 4
        replayTools: false

    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'

    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
```

`preset-snippet.yml` 包含 Provider 行的可复制片段。新会话必须选择这个用户 preset；已有会话仍使用创建时选定的 preset。

## 配置

插件接受 `BasicCompactionConfig` 的全部字段，并增加：

| 字段 | 默认值 | 语义 |
|---|---:|---|
| `chunkInputRatio` | `0.6` | 每次辅助调用允许输入占摘要模型 context window 的比例，范围 `0.1..0.9`；剩余空间留给输出和 provider 误差。 |
| `mapMaxTokens` | `4096` | 每个局部摘要调用的生成上限。 |
| `reduceMaxTokens` | `8192` | 每个归并调用的生成上限。 |
| `maxDepth` | `4` | map 之后最多递归归并轮数，范围 `1..8`。 |
| `replayTools` | `false` | 是否在每个分块调用中重复发送原工具 schema；默认不发送以释放预算，消息中的历史 tool call/result 仍原样保留。 |

`summarizationProvider` 和 `summarizationModel` 建议显式指向接管会话的模型或专用摘要模型。插件会查询该模型声明的 `contextWindow`；缺失容量时 fail loud。`chunkInputRatio × contextWindow + max(mapMaxTokens, reduceMaxTokens)` 不得超过 context window。

## 模型与 Token 影响

一次性输入走 stock basic 路径，并保留其 provider prefix cache 行为。分块路径会产生多个 `purpose: compaction` 私有调用；map 调用读取按时间排序的原始片段，reduce 调用只读取带范围标记的局部检查点。最终模型只看到一个 stock compaction checkpoint 和未压缩的近期尾部，不看到中间调用。

分块路径牺牲完整前缀 KV cache 复用来换取可行性。预算内的 stock 单次调用若仍被 Provider 明确判定为上下文溢出，会在同一未提交事务中转入分块；map/reduce span 的 Provider 超窗会按稳定的原始 source-unit 范围继续二分，已成功 span 不会重放。持久 `compaction/summary` 记录最终输出、最终 Provider/模型；仅当整个成功路径的每个调用都上报 usage 且没有失败尝试时才记录完整聚合 usage。只有恰好一个成功 map 调用且此前没有失败尝试时才设置 `llmStreamCall: true`；所有多调用或自适应退避路径均不设置。

## 已知限制

- 单个不可拆分的普通消息、闭合工具单元或 partial checkpoint 若超过静态预算，或在自适应二分后仍被 Provider 判定超窗，插件会报告具体 source-unit 范围；工具结果应先由同组 pruner 缩减。
- Web 端切换模型后，新路由要等第一条请求构建时才落入 durable header，所以切换后的第一个 pre-step 仍按旧模型的容量做压力判断；该请求若超窗，stock overflow 恢复会在 durable header 已更新的情况下走本插件的自适应分块。要让压缩在切换后的第一条请求之前主动触发，需要 harness 在 `agent/pre-step` 暴露 assembled selection（上游变更，不属于本插件范围）。
- reduce 最终只剩两个 partial 且合并调用被 Provider 判定超窗时，插件按无进展立即失败（不做 singleton 重写再合并的试探）：singleton 重写没有可证明的尺寸下降保证，可能无限重复。遇到此边界应调低 `mapMaxTokens` 或提高 `chunkInputRatio` 后重试。
- 多阶段进度尚未独立持久化；进程退出或中间调用失败后，下次压缩从 map 阶段重新开始。
- 摘要 token 计量沿用 `ctx.tokenMeter` 的固定密度估算，不是 Provider 的精确 tokenizer。
- `replayTools: false` 适用于不要求历史工具结果必须伴随 schema 的 Provider；遇到严格 Provider 时改为 `true`，并相应降低历史消息预算。
- tsdown 将 Harness API 保持为 external，但这本身不保证 pnpm peer 的物理 realpath 相同。rc.8 路径只通过 string-keyed Service 和普通消息值交互，并已做 scratch Profile 挂载验证；本地源码联调先在仓根运行 `pnpm run link:source dsh-compaction-hierarchical`，基线或 fork 变更后必须重跑安装态挂载与引擎测试。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```
