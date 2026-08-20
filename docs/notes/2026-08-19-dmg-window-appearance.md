# DMG 安装窗口外观（背景图 + 图标布局）

日期：2026-08-19

## 背景

默认 tauri DMG 只有裸窗口 + app 图标 + Applications 链接，无背景图、无引导文案，观感粗糙（用户反馈截图）。目标：对齐主流 mac 应用的「拖入 Applications」引导式安装窗口。

## 决策

1. **背景图程序化生成**，非手绘资产：`scripts/generate-dmg-background.py`（PIL）按 point 画布（660×400，等于窗口尺寸）2x 渲染到 `src-tauri/dmg/background.png`，内容 = 浅色纵向渐变 + 图标位柔光 + 品牌蓝（#2A5AC9）拖拽箭头 + 中文引导文案（Hiragino Sans GB W6/W3——构建机无 PingFang 文件，该字体是系统常驻 CJK sans）。生成脚本入仓、PNG 入仓，保证任何构建机（含 CI）不依赖本机美术资产重新生成。

2. **Retina 靠 DPI 元数据而非 @2x 文件**：create-dmg（tauri-bundler 内嵌 fork）只收单张背景，Finder 按图片 DPI 元数据把像素映射回 point（144dpi ⇒ 2x 像素 = 1x point），与 DropDMG 文档的 72/144dpi 约定一致。PNG 存 144 DPI，Retina 清晰、1x 屏自动降采样。

3. **图标坐标与箭头两端硬对齐**：`tauri.conf.json` `bundle.macOS.dmg` 显式钉 `windowSize 660×400`、`appPosition (180,196)`、`applicationFolderPosition (480,196)`；图标尺寸用脚本默认 128。背景脚本顶部的锚点常量与之一一对应，改布局必须两侧同步（playbook §1 已写纪律）。

4. **`.VolumeIcon.icns` 不修**：它是 create-dmg 放的卷图标 dotfile，默认隐藏；用户截图里可见是因为其 Finder 开了显示隐藏文件。所有 create-dmg 系安装包（含未定制背景的 tauri 默认包）都有此文件，非缺陷。

## 验证

- 生成脚本本机跑通，`sips` 确认 1320×800 @ 144dpi。
- mock 合成（背景 + 真实 app 图标 + Applications 图标 + 标签）目检对齐。
- `pnpm desktop:build` 出真实 DMG 后挂载目检窗口效果。
