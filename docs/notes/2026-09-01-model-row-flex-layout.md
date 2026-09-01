# 模型行布局：注入按钮共存时 grid 列数失控 → 行内改 flex

日期：2026-09-01。涉及插件：`dsh-model-image-input` 0.1.1、`dsh-model-efforts-editor` 0.1.1（均为 desktop-owned 七包成员）。

## 症状

stock「设置→模型→供应商→自定义设置」的已保存 pi-ai 模型行在两个插件同时挂载时：

1. 展开钮（chevron）的边框/聚焦环溢出卡片右缘；
2. 删除钮（trash）掉出主行，孤零零落在卡片第二行左下角，近乎不可见；
3. 两个模型名称输入框被拉得过长。

## 根因

stock 行是固定 4 列 grid（`minmax(0,1.4fr) minmax(0,1fr) auto auto`），子元素为 [id 输入框, name 输入框, chevron, trash]。两个插件各自行内注入一个按钮，子元素变 6 个：

- `dsh-model-efforts-editor` 的 `.mee-grid` 把行改成 `1fr 1fr 16px 16px 16px !important`——按钮列只有 16px，而 stock 图标钮宽 28px，chevron 溢出其格子直到超出卡片右缘（症状 1）；`1fr 1fr` 又让输入框吃满剩余宽度（症状 3）。
- 两条 `!important` 覆盖同级竞争，无论谁生效都只声明 5 列，第 6 个子元素（trash）被 grid 自动摆到隐式第二行（症状 2）。

核心教训：**任何"数清楚当前有几个按钮再写死列数"的做法在多插件共同装饰同一行时必然破产**——列数取决于对方是否在场，CSS 无法表达。

## 决策

两个插件的 `styles.ts` 不再覆盖 `grid-template-columns`，改为把装饰过的行整体切到 flex（各自只给行加自己的类，规则声明完全一致，无级联顺序问题；单插件在场同样成立）：

```css
.mii-grid { display: flex !important; align-items: center; gap: 6px; }
.mii-grid > input { flex: 1 1 0; min-width: 0; }
.mii-grid > input:first-child { flex-grow: 1.4; }
```

（`.mee-grid` 同文。）按钮保持各自固有宽度（22/26/28px），两个输入框按 stock 的 1.4:1 比例分剩余宽度并优先收缩（`min-width: 0`），于是任意数量的注入按钮都不会溢出卡片、trash 永不换行、输入框自然变短——三个症状同一个修法。展开区的容量字段不在行内（`.modelAdvanced` 子树），不受影响。

## 验证与分发

- 两包 `pnpm run build` + `pnpm run test` 全绿（12 + 10）。
- 实时预览：构建产物拷入 `~/.dsh-desktop/plugins/<name>/lib/`（web profile 以 `link:` 指向该目录，`/plugins/<name>/client.js` 为 `no-cache`，刷新即生效），目检通过。
- 版本 0.1.0 → 0.1.1（纯修复 patch 段）。两包在 desktop-owned 清单内，正式发布随下一次桌面 `v*` 的七包事务带出；`~/.dsh-desktop/plugins/` 的手工覆盖届时被新 tarball 顶替属预期。
