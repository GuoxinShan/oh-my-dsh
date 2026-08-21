# dsh-model-image-input：自定义供应商的图片输入声明页（2026-08-21）

## 需求

设置页「新增供应商」没有暴露「模型是否支持图片」：pi-ai 的 settings schema
本就接受每模型 `input: ['text','image']` 声明（`llm-pi-ai/src/config.ts` 的
`modelFields.input`），API 代理也按它拦截图片附件（"does not support image
input"），但 curated 的 Models 卡片只编辑 id/name/contextWindow/maxTokens。
系统里没有预置的供应商要开图，只能手改 `settings.yaml`。

## 决策：出树插件，不动 harness 源码

曾尝试直接改 harness 的 `ui-settings-models`（给 ModelListEditor 行展开区加
三态 select），已回滚——harness fork 的改动要走「fork 发 zw 层 → bump
revision → 重组装 runtime → 发 desktop 版」整条链，且污染上游面。而缺的只是
编辑 UI，能力管道全在 runtime 里现成。`dsh-mcp-settings` 已证明插件可以经
`settings.section` 槽位给设置面板加自己的页，并用 `settingsScope` /
`settings.mutate` 读写任意命名空间——于是这成为纯插件方案：

- **client face**（空 host apply + `exports["./client"]`，脚手架 `--face client`
  生成）：`ctx.slots.inject('settings.section', ...)` 注册 `model-image-input`
  页（order 13）；`ctx.settingsScope.bind({ namespace: 'llm-pi-ai' })` 拿响应式
  快照；写走 `connection.api.settings.mutate` 的整组数组 path op（与 stock
  Models 编辑器同一路径、同一种 op）。成功写触发 Host 的
  `settings/document-updated` → 共享 describe mirror 重载 → 本节快照自动刷新，
  pi-ai adapter 同步重解析路由——**修改即时生效，无需重启**。
- **编辑面只列用户层拥有 `models` 数组的路由**：正是自定义供应商（「系统里
  没有预置的」）。目录服务的预置路由不出现——它们的行属于内置目录，不属于
  settings；若日后要覆盖目录模态，正确姿势是 `modelOverrides`，不是这页。
- **三态选择器**：跟随提供方默认（不写 `input`；自定义路由默认仅文本）/
  仅文本（`['text']`，可纠正端点不认的目录图片声明）/ 文本和图片
  （`['text','image']`）。
- **编辑态是稀疏覆盖（route→行索引→choice），基面永远是当前快照**：外部改动
  即时可见，保存时把覆盖折叠到最新存储数组上（`collectOps`），与存储值相等
  的覆盖不产生写；每条变更路由一个整组 op，批量一次 mutate、revision 栅栏。

## 边界与取舍

- **不引 ui-primitives 值导入**：published lib 顶层 import `.module.css`，
  node:test（脚手架基线测试器）无法加载。save 按钮用原生 `<button>` +
  `.mii-save` 镜像 Button 原子 sm/primary 形态的同名 token 家族
  （`--dsw-alias-button-primary-fill` 等）。client 半因此回到「零
  @deepseek-ai 值导入」，bundle 只 require react——纯度门恒过，node:test 可
  直接 import client 入口做 smoke。
- **样式走 dsh-desktop-bridge 的 `railCss()` 形态**（CSS 字符串 + 一次性
  `<style>` 注入，`mii-` 前缀防撞），不用 CSS modules——本包 tsdown 无 CSS
  管线，脚手架蓝本（branding）用内联样式，桥用注入式样式表；本页有
  focus/disabled 伪类态，选后者。
- **写入粒度**：整组 `models` 数组一个 set op（不用数组下标路径 op）——这是
  stock 编辑器已验证的粒度，schema 对路径深度的接受面以它为准。
- `dsh.client.inject` 列 runtime/ui-settings/locale/connection 四个平台模块
  （对齐 dsh-mcp-settings：settingsScope/locale/connection 服务的提供方先于
  本插件加载）；devDeps 额外钉 `dsh-api-remotes`/`dsh-client-locale`/
  `dsh-client-ui-settings`（全部 type-only，0.1.1-rc.1 registry 姿态）。

## 验证

`pnpm run typecheck` / `pnpm test`（node:test 9 例：三态映射、行重建、ops
折叠、字典键集、样式 token 纯度）/ `pnpm run build`（0.44 kB host + 19.1 kB
client closure）/ 实机 scratch-home 挂载（boot graph 含行、`/plugins/
dsh-model-image-input/client.js` 200）。
