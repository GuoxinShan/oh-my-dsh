# CI DMG layout must opt out of Tauri's CI shortcut

日期：2026-08-21。

## 现象

本机生成的 `v0.2.0-rc.2` DMG 能显示定制背景、660x400 窗口和两枚对齐图标；GitHub Release 的 `v0.2.0-rc.9` 却退化为 Finder 默认裸窗口。

直接下载并只读挂载两个真实产物后，差异不在 PNG：两边的 `.background/background.png` 都与仓库源文件同为 `89f5e74d...`。本地产物卷根有非空 `.DS_Store`，Release 产物完全没有该文件。Finder 的背景选择、窗口尺寸和图标坐标都存于 `.DS_Store`，所以「PNG 已入包」不能证明安装页布局已入包。

## 根因

Tauri 2.11.4 的 `tauri-bundler` 在环境变量 `CI=true` 时默认给内嵌 create-dmg 脚本增加 `--skip-jenkins`。该分支仍复制背景文件和 Applications 链接，但明确跳过负责生成 `.DS_Store` 的 Finder AppleScript。GitHub Actions 因而稳定地产生“构建成功、资源存在、布局缺失”的 DMG；本机没有 `CI=true`，所以目检一直正常。

Tauri 提供了窄开关 `TAURI_BUNDLER_DMG_IGNORE_CI=true`，只取消 DMG 的 CI shortcut，不篡改 GitHub Actions 的全局 `CI` 语义。GitHub 托管的 macOS runner 有完整桌面会话，适合走该路径。

## 修复与门禁

1. `desktop-macos` 的 bundle step 固定设置 `TAURI_BUNDLER_DMG_IGNORE_CI=true`，让 create-dmg 在 CI 中运行 Finder AppleScript。
2. 公证前安装固定版本的 `ds-store` 解析器并运行 `scripts/verify-dmg-layout.sh`，挂载最终 DMG 后读取 `bwsp` / `icvp` / `Iloc` 记录，核对窗口尺寸、背景图模式、图标尺寸和两枚图标坐标，同时验证背景内容 hash、app 目录及 `/Applications` 链接。
3. 校验失败即中止 macOS job；`desktop-publish` 依赖双平台成功，因此坏 DMG 不会再推进 latest 指针。

验证脚本既能用于 CI，也能对下载回来的 Release 附件复核，避免只检查公证前的中间路径。
