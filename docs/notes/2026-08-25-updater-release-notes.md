# 更新确认框展示 CHANGELOG，发版不再写占位 notes

日期：2026-08-25

## 决策

安装确认框要能读到**本版更新说明**，发版清单的 `notes` 必须是 `CHANGELOG.md` 里对应版本的正文，而不是 GitHub 自动生成的 compare 链接或 `"See the release page for notes."`。

## 理由

用户看到的「更新有点丑而且没有更新日志」是两层叠在一起：

1. **没有文案可看。** `compose-latest-json.mjs` 把 `latest.json.notes` 写成占位句；GitHub Release 开着 `generate_release_notes: true`，本仓几乎全是直接 push/tag，自动 notes 只剩一行 Full Changelog 链接。壳把 `update.body` 放进 `available.notes` 之后，`ready` 又丢掉这个字段，确认框只剩「已下载并完成签名验证」。
2. **框本身没有内容区。** Modal 只有 title + 一句 description，没有滚动的说明区域，即使 notes 有内容也无处放。

Zed / VS Code 的共识是：后台下载保持安静，**点安装时**才给出版本号 + 本版说明 + 重启后果。说明走 Keep a Changelog 的标题/列表，不把聊天用的 Markdown 栈（KaTeX / streaming parser）拉进确认框。

## 行为

- `ready` 快照带 `notes`（下载完成时从 updater `body` 拷入）。浏览器在 `available` → `preparing` / `downloading` 期间用 ref 保住上一份可见 notes，避免中间态把文案冲掉。
- 确认框标题为「安装 v{version}」，短描述只说签名与重启；下方滚动区渲染 CHANGELOG 条目。占位句与空 notes 显示「此版本没有附带更新说明」，不把占位句原文摊给用户。
- 发版：`scripts/release-notes.mjs` 抽取 `## [version]`，没有则回退非空的 `## [Unreleased]`（stderr 警告）；`compose-latest-json.mjs` 强制 `--notes-file`，空文件即失败。GitHub Release 用同一份 `body_path`，关掉 `generate_release_notes`。

## 验收

- 组件测试：ready 带 CHANGELOG 时确认框出现标题与列表项；占位句走 empty 文案。
- `decodeUpdateStatus` 保留 ready.notes；Rust Ready 变体带 notes 且 claim/install 仍只认 version。
- `scripts/release-notes.test.mjs` 覆盖精确抽取与 Unreleased 回退。
- 契约：AGENTS「标题带更新入口」+ 本 note；下一次 desktop tag 才能把新框和真实 notes 送到已经在跑的安装（运行中的 app 渲染确认框）。
