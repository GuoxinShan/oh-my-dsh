# 2026-08-27 — dsh-model-efforts-editor：模型设置页的档位编辑器（0.1.0）与桌面 0.3.0-rc.2

## 背景

上一案（`2026-08-27-reasoning-efforts-compat-fill.md`）解决了「补齐」的问题，但用户点破了痛点：改一个模型的 effort 还是要手工编辑 `settings.yaml` 或者发插件版。核实 harness 上游后发现这是**刻意留白**：`ui-settings-models` 的 ProviderEditor / CustomProviderCard 都注释了「There is deliberately no reasoning-effort control」（effort 是 per-model 能力，provider 级控件必然打中不支持它的模型），但替代面——composer 的 per-model 选择器——只在声明里已有档位时才出现。手写模型陷入死循环。

## 决策

**做编辑器、不做 provider 级控件**——跟上游同一条理由，落点却放在每条模型行上：

1. **形态复刻 dsh-model-image-input**：MutationObserver 在 stock 模型行的第五列注入按钮，固定定位弹层编辑，`settingsScope.bind` + revision-fenced `settings.mutate` 写整组 models 数组。DOM 失配 fail-invisible。
2. **三态 = llm-pi-ai 解析规则的可视化**：undeclared / false / levels；levels 里 `off` 特殊（可留空 = 发送参数缺省）。验证前置在弹层内（非空线值校验），写入校验交给 llm-pi-ai 自己 fail loud。
3. **Z.ai compat 是勾选项不是独立控件**：GLM-5.3 案暴露的第二个字段，绝大多数路由不需要它常驻 UI。
4. **独立插件而不是扩 dsh-model-image-input**：一个管请求能力（input），一个管理由声明（reasoningEfforts）；行内列位（五列 grid 前缀类名）、字典命名空间、按钮 glyph 都按各自身份分治，避免把两个正交关注点搅进一个 fiber。
5. **进桌面打包链并随即发 desktop 版**（用户新要求）：prepare 六包清单 + `findDesktopPlugins` 安装链 + 接管确认框文案同步 + root CHANGELOG。版本走 rc 线：`0.3.0-rc.2`。

## 边界

- 弹层不提供 xhigh/max 之外的白名单约束——档位集就是 THINKING_LEVELS 全集，值合法性归 llm-pi-ai；
- 未保存草稿、目录路由、DeepSeek 卡不可编辑（锚定失败静默）；
- 不做 modelOverrides 的行内编辑（那张卡上游没有行列表，先不做）。
