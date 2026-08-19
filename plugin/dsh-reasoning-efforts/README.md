# dsh-reasoning-efforts

给 `llm-pi-ai` 手工声明模型的**推理档位自动补齐**插件（host-only）。

## 为什么需要它

自定义 OpenAI 兼容路由（如 sub2api 网关代理的 Grok）在 `settings.yaml` 里手工声明模型时，通常不带 `reasoningEfforts`——Web GUI 没有这个字段的编辑入口，网关的 `/models` 列表也不携带任何推理元数据（上游 [discussion #843](https://github.com/deepseek-ai/deepseek-harness/discussions/843)）。于是 llm-pi-ai 把这些模型解析为非推理模型，Composer 的模型选择器完全不出现「推理等级」面板。

本插件在挂载时、以及每次 `llm-pi-ai` 设置提交之后，给缺失声明的模型补上档位：

1. 用户层已显式声明 `reasoningEfforts`（含 `false`）→ **绝不覆盖**；
2. 按序匹配组合行 `config.rules`（first-match-wins）；
3. 当前适配器对该路由/模型**已提供档位**（目录继承，如 `openai` 路由的 `gpt-5.1`）→ 跳过。

写入走 `settings.mutate` 的路径寻址 set op（携带读时 revision，并发编辑会被 `SETTINGS_CONFLICT` 拒绝而不是被覆盖），只增不删——移除一个声明请手工编辑 `settings.yaml`。

## 安装

```sh
dsh plugin --profile <profile> add <this-repo>/plugin/dsh-reasoning-efforts
```

随包 `cordis.patch.yml` 自带 grok 路由的默认规则：先钉住 `*-non-reasoning`（`efforts: false`），再给 `grok` / `grok-latest` / `composer*` / `grok-composer*` / `grok-4*` 填 xAI 官方线缆档位 `low/medium/high`（与 pi-ai 内置 xai 目录一致）；`grok-imagine*`、`grok-build*` 不匹配任何规则、保持原样。

## 配置

规则在组合行的 `config` 里（编辑 profile 的 patch 层或 `dsh plugin add` 后的行）：

```yaml
- id: dsh-reasoning-efforts
  name: dsh-reasoning-efforts
  config:
    rules:
      - routes: [grok]           # 精确路由 id（settings providers 字典键）
        include: non-reasoning   # 模型 id 正则；命中即用本规则
        efforts: false           # 钉死非推理（选择器不出现）
      - routes: [grok]
        include: '^(grok$|grok-latest$|composer|grok-4|grok-composer)'
        exclude: fast            # 可选：exclude 胜过 include
        efforts:                 # 档位 -> 发给网关的线上值
          low: low
          medium: medium
          high: high             # 也可以 high: ultra 做网关映射
```

约束（挂载时 fail-loud 校验，镜像 llm-pi-ai 自己的解析规则）：

- 档位键只能是 `off/minimal/low/medium/high/xhigh/max`；
- 只有 `off` 可以留空（`off:` = 支持、不发参数）；其余档位必须给非空线上值；
- 至少声明一个 `off` 之外的档位；`efforts: false` 表示非推理模型。

## 行为边界

- 补齐后立即生效（llm-pi-ai 每次操作重读 profiles），无需重启；
- 插件自身的写入会再触发一轮空填充（已补的模型不再是候选），循环自然终止；
- 修改规则不会撤销已写入的声明——`reasoningEfforts` 一旦进了用户层就是显式声明，归门卫 1 保护；
- settings 提供方只读（无可写持久层）时警告一次并跳过。

## 开发

```sh
pnpm install && pnpm run setup   # 建 dsh -> $DSH_CHECKOUT 符号链接
pnpm run typecheck && pnpm run test && pnpm run build
```
