# 2026-08-20 · dsh-reasoning-efforts：手写 llm-pi-ai 模型的推理档位自动补齐

## 背景

自定义 OpenAI 兼容路由（sub2api 代理 Grok）在 `settings.yaml` 手写 models 列表时缺 `reasoningEfforts` 声明，llm-pi-ai 把这些模型解析为非推理（catalog.ts `resolveModelReasoning`：route 键 `grok` 不在 pi-ai 内置目录 → `base === undefined` → `reasoning: false`），Composer 的推理等级面板完全消失。上游 discussion #843 确认这是「GUI 无编辑入口 + 网关模型列表无推理元数据」的已知缺口；官方建议的 workaround 是手改 YAML，社区插件 `@hytime/dsh-thinking-effort` 做了自动补齐。

## 为什么不直接用 hytime 的插件

读其源码（host 176 行 + client 919 行）后发现三个设计问题：

1. **无差别填充**：给所有缺声明的模型盖 `{off: null, high: high, max: max}`，包括 `*-non-reasoning` 这种真非推理模型——产出一个控制不了任何东西的假开关（`off` = 省略参数 = 和不选一样），网关还可能回 `UNSUPPORTED_REASONING_EFFORT`。
2. **覆盖目录继承**：catalog 路由（如 `openai`）的目录内模型本会继承目录的档位能力，无差别填充会把正确的目录档位压成它的固定预设。
3. **预设写死** DeepSeek 风格 `off/high/max`，对 Grok 不合适（xAI 官方是 `low/medium/high`，即 pi-ai xai 目录的 `thinkingLevelMap`）。

## 我们的方案（本仓 `plugin/dsh-reasoning-efforts`，host-only ~300 行）

三重门卫，只填「真空白」：

1. **显式声明优先**：用户层已有 `reasoningEfforts`（含 `false`）→ 绝不覆盖。读 **raw user 层**（`describe().user`），不读 schema-resolved view——把物化的默认值持久化会把组合 base 烤进 `settings.yaml`。
2. **有序规则匹配**：组合行 `config.rules`，first-match-wins——收窄规则（non-reasoning → `false`）排在宽规则前面。规则校验 fail-loud，镜像 llm-pi-ai 自己的解析约束（档位 ∈ 7 个 pi-ai level、仅 `off` 可空值、至少一个非 off 档）。
3. **活适配器探测**：`ctx.llm.resolveModelInfo(route, model).reasoning.efforts` 非空 → 跳过（目录继承不碰）。这条是关键改进——目录无关地回答「这条路由现在到底有没有档位」，绕开「不能值 import llm-pi-ai catalog」的跨包纪律。

写入走 `settings.mutate` 路径寻址 set op + **读时 revision**：并发编辑以 `SETTINGS_CONFLICT` 拒绝而非静默覆盖，输掉的填充等下一次 `settings/updated` 重跑。`models` 数组按路由整组 set（`applyPathOp` 只走 plain object，数组下标路径会腐蚀结构）；`modelOverrides` 逐模型精准 set。自触发循环自然终止：已填充的模型不再是候选。

触发时机：挂载时重试 10 次×1s（llm-pi-ai namespace 注册晚于本插件 fiber），之后监听 `settings/updated`。只读 provider 警告一次跳过。**只增不删**：移除声明永远手工编辑。

## 踩坑记录（对后续插件有用）

- **`ctx.timeout` 需要 `inject: ['timer']`**：host 侧 timer 是 `@deepseek-ai/cordis-plugin-timer` 服务（vendor/timer），mixin 到 ctx；类型 augment 靠 `import type {} from '@deepseek-ai/cordis-plugin-timer'`（devDep link 到 `dsh/vendor/timer`）。
- **测试脚手架的 YAML 1.1 陷阱**：用 PyYAML `safe_dump` round-trip 含 `off:` 空值键的 settings 会把 `off` 变 `false`（YAML 1.1 bool），`false:` 不是合法档位 → llm-pi-ai section 校验拒绝 → namespace 不注册 → 填充静默失败。诊断手法：`console.error` 打点各退出分支。**scratch 验证脚本要么用 dsh 自己的 yaml，要么避免 round-trip。**
- **`--patch` 不是 `dsh web` 的选项**；临时挂载行写 profile 的 `cordis.patch.yml`（用户 patch 层，bundle 层之上）。bundle 层（包内 `cordis.patch.yml`）经 `plugin add` 自动进组合，用户层再写同 id 行会 **duplicate entry id** 拒绝整个树。
- `SettingsNamespace` 是 branded type，需要 `settingsNamespace('llm-pi-ai')` 构造。

## 验证

- 单测 9 个全过（`node --import tsx --test`）：三重门卫、ordered rules、efforts 校验镜像、models 数组整组 op、override 精准 op、数据 detach。
- scratch home 实机：grok 28 模型 → 18 填充（16 推理模型 `low/medium/high` + 2 个 non-reasoning 钉 `false`）、10 个 imagine/build 系列正确不动、zai/openai 路由零触碰；`settings/updated` 触发的第二轮 no-candidates 确认循环终止。
