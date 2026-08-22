# dsh-model-image-input：自定义模型行内图片输入声明（2026-08-21）

## 需求

设置页「新增供应商」没有暴露「模型是否支持图片」：pi-ai 的 settings schema
本就接受每模型 `input: ['text','image']` 声明，API 代理也按它拦截图片附件，
但 curated Models 卡片只编辑 id/name/contextWindow/maxTokens。系统里没有预置的
供应商要开图，只能手改 `settings.yaml`。

用户明确要求最终入口在：**设置 → 模型 → 供应商 → 自定义设置 → 模型列表行**，
不能新增一个独立设置页，也不要原生 `<select>`。

## 决策：browser-only DOM 注入插件

`ui-settings-models` 的 ProviderEditor / ModelListEditor 是 stock 包手写的
curated 卡片，折叠区内部没有 Slot。精确落在该位置只有两条路：把
ui-settings-models 加进 fork 修改面，或像既有 `dsh-provider-balance` 一样做纯
DOM 注入。用户选择后者：零 harness 改动、`plugin add` 即用，接受 stock DOM
变更时要同步锚点的维护成本。

`dsh-model-image-input` 是脚手架 `--face client` 生成的 client 插件（空 host
apply）：

- 用 MutationObserver 识别 pi-ai ModelListEditor 的已保存模型行；
- 每行在名称输入与 disclosure 之间插一个 26px 图片按钮；
- 点击打开自绘菜单：跟随默认 / 仅文本 / 文本 + 图片；
- `settingsScope` 读 user 层与 revision，`connection.api.settings.mutate` 写整组
  `providers.<route>.models` 数组 op；settings/document-updated 刷新 scope 后重画
  图标，立即生效、无需重启。

## DOM 锚点与边界

DOM 注入必须 fail-invisible：锚点失配时不注入、不写入，不猜路由。

- 行锚点：stock 中英文 aria label `Model ID <n>` / `模型 ID <n>`；
- pi-ai 卡片判别：`Fetch available models` / `获取可用模型` 按钮；DeepSeek
  编辑器没有该按钮，且其 schema 不支持 `input`，因此天然排除；
- 路由判别：屏幕模型 ID 序列与 user 层各 route 的已存 `models[].id` 序列做
  唯一精确匹配；零匹配（未保存/已改草稿/预置目录）或多匹配均只读；尾部空白
  新行过滤后不影响已保存行。

Stock 卡片另有自己的 React draft。插件写入立即生效，但若用户随后继续在同一
已打开卡片改其他字段并点 Apply，旧 draft 可能覆盖刚写的 `input`；正确工作流是
先重开卡片，让 stock draft 读到新声明。该限制记录在 README，不在紧凑弹窗内放
长说明（会撑大 UI）。

## 弹窗规格

用户实机迭代否决了 264px/220px：桌面 settings 面板靠右，向右下展开会撞壳边界。
最终规格：

- 固定 **196px**，选项 12px/16px、4px 外 padding、9px 圆角；
- 右边缘与行按钮右边缘对齐，默认向左生长；
- append 到 document.body 后读取真实高度，下方放不下则向上翻转；
- 标题/副标题单行省略；不放底部长说明；
- 阴影用 `--dsw-shadow-lv3`，颜色只用 `--dsw-*` token；
- 非原生 select：按钮行 + SVG check + hover/disabled 状态。

## 包边界

- client bundle 零 `@deepseek-ai/*` 值导入；Harness imports 全是 type-only；
- locale 字典注册、样式、observer、document listeners、injected buttons、popup、
  settings scope subscription 全绑定当前 fiber disposer；
- npm registry 姿态：额外 type-only devDeps
  dsh-api-remotes/dsh-client-locale/dsh-client-ui-settings 均钉 0.1.1-rc.1；
- `dsh.client.inject` 列 runtime/ui-settings/locale/connection 四个提供方。

## 动态原型记录

会话插件 `mii-1` 验证了几个方向：

1. pkg-1 独立 settings 页（用户否决位置）；
2. pkg-2/3 composer 模型选择器旁控件（用户再次澄清位置）；
3. pkg-4 DOM 行内注入（方向确认）；
4. pkg-5 264px、pkg-6 220px、pkg-7 196px + 向左/上下自适应（宽度定版）；
5. pkg-8 弹窗滚动跟随（fixed 元素在面板内容滚动时"飘走"的修复）；
6. pkg-9 双图标状态 + 第五列网格（垃圾桶归位）。

pkg-1 还暴露一个 lifecycle 教训：直接丢弃 `locale.register` disposer 会在 update 后
留下命名空间，下一版本报 already has locale。后续动态包改为
`ctx.effect(() => locale.register(...))`；正式包同样全量绑定 fiber。

## 冻结事故：observer 下的非守卫 DOM 写入（pkg-9 实测）

pkg-9 为切换图标在 repaint 里**无条件**重写按钮 `innerHTML`。注入引擎的
MutationObserver 监听整个 body 子树的 childList——重写 innerHTML 就是
childList 变更 → observer 再次触发 decorate → decorate 尾部再次 repaint →
再写 innerHTML……自激发死循环把主线程打满，整个页面点不动（用户实测"点击
直接卡住"）。pkg-4~8 只写属性（attribute 变更不在 childList 观察范围内）故
无此问题；双图标一上就爆。

**铁律：凡在 body 级 MutationObserver 回调链里写 DOM，必须守卫式写入——值
未变化绝不碰 DOM。** 修复后 repaint 对 data-on / dataset.miiIcon+innerHTML /
aria-label 三处逐一比较后再写；`row.classList.add` 与 `input.dataset.mii`
标记天然幂等安全。正式包同款守卫。

## 验证

正式包：typecheck、node:test（锚点、模态映射、路由指纹/歧义、整组 op、字典
键集、样式 token 纯度）、tsdown host/client closure、node --check、scratch-home
plugin add + boot graph/client.js 200。
