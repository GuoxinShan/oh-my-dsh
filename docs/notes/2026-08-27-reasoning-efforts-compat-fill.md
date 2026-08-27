# 2026-08-27 — dsh-reasoning-efforts 补齐 dispatch compat（0.2.0）

## 背景

用户报告 `glm-5.3-flash` 在 Composer 里不出现推理等级选择器。排查链：

1. **官方契约**：GLM-5.3 / GLM-5.3-Flash 恒开思考，`reasoning_effort` 只有 **low / high / max** 三档（默认 `max`），且**不再接受 `thinking.type: "disabled"`**（发了直接失败）。来源：z.ai/blog/glm-5.3、docs.bigmodel.cn。
2. **选择器来源**：llm-pi-ai 把无 `reasoningEfforts` 声明的手写模型解析为非推理模型，composer 整个隐藏档位面板。live `settings.yaml` 里 `glm-5.3` 手写了 `{off, high, max}` + compat，`glm-5.3-flash` 什么都没有——后者因此不可见。
3. **只有声明不够**：pi-ai 的 openai-completions 分发对 zai 系路由（provider id `zai-coding-cn` 命中 `detectCompat`）自动探测出 `supportsReasoningEffort: false`；显式不发 effort 时更会发送 `thinking: {type: "disabled"}`——对 5.3 是硬错误。

## 决策

### 1. live settings.yaml 手工修（立即可用）

- `glm-5.3-flash` 补 `reasoningEfforts {low,high,max}` + `compat {supportsReasoningEffort: true, thinkingFormat: zai}`；
- `glm-5.3` 的 `off: null` 删除、补 `low`——off 在 5.3 上是请求失败而不是「关闭思考」。

### 2. 插件扩展（本 PR 的仓库改动）：

- **规则新增可选 `compat`**（`supportsReasoningEffort` 布尔 / `thinkingFormat` 枚举），配置期 fail-loud 校验；未知字段拒绝——llm-pi-ai 对未知 compat 开关本身 fail-loud，写进去会打挂整条路由。
- **候选拆两片独立判定**：「缺什么补什么」。efforts 片走原三道门卫（整键 gate 1 + 规则匹配 + adapter 目录继承 gate 3）；compat 片逐字段判 gate 1（已声明的拼法永不覆盖）。目录继承只跳过 efforts 片，compat 照常补。
- **写法**：models 数组路由仍是一次性整组 set（efforts 与合并后的 compat dict 都折进字面量）；modelOverrides 保持 per-model surgical op，compat 写单个整 dict set 而非逐字段路径——不赌 settings path op 是否创建缺失父对象。
- **格式列表本地镜像** `SUPPORTED_THINKING_FORMATS`：host bundle 不为值链接 harness 包（tsdown 纯度门），漂移靠注释指认事实源。

## 为什么不改 harness 母仓库

`compat` 与 `reasoningEfforts` 同在 llm-pi-ai 设置用户层，插件已握有唯一需要的写入通道（`settings.mutate` path ops）；本仓跨包纪律恰好允许（harness 包 type-only import）。真正需要母仓库链路的是「zai 分发未选档位时默认发 disabled」这类平台行为修复——那属于 pi-ai/dsh-llm-pi-ai 修改面，正规路径 fork → zw 版 → desktop bump revision，眼下被「声明不含 off + 档位显式选择」绕开，不值得现在做。

## 默认规则

bundled patch 新增 GLM-5.3 线规则：`^glm-5\.3($|-)` 且排除 `turbo`——三档 low/high/max + zai compat 双开关。旧线（glm-4*、glm-5/5.1/5.2 等）协议不同（支持关闭思考、effort 集不同），刻意不匹配。grok 规则不动。

## 边界与遗留

- 插件暂未装进用户 live home（glm 声明一直是手写形态）；本次手工修即达成目标，装不装插件由用户决定。
- glm-4.7 / glm-5.x-turbo / glm-5v-turbo 等旧线模型的 efforts 对齐是另一件事，本轮不做。
