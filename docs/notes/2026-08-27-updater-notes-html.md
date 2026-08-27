# 更新确认框消化 GitHub 的 HTML notes

日期：2026-08-27

## 决策

`parseUpdateNotes` 在 Keep a Changelog markdown 之外，把 GitHub atom / `electron-updater` 送来的 HTML 子集收成同一套 heading/list/paragraph 块。只剥标签、不 `innerHTML`。确认框卡片加 `max-height`，说明区 `min-height:0` + 内部滚动，页脚「稍后 / 安装并重启」钉在卡片底，不跟说明一起滚出窗口。

## 理由

确认框渲染器刻意不拉聊天 Markdown 栈，只认 `###` / `- `。壳的 GitHub provider 在 yml 没有 `releaseNotes` 时用 atom 的 `<content type="html">`，于是用户看到字面量 `<h3>` / `<ul>` / `<code>`——2026-08-27 安装 v0.3.0-rc.2 的框就是这样。发版已经把 CHANGELOG markdown 写进 Release body，但 updater 仍可能把 HTML 填进 `info.releaseNotes`。

同一框里说明区虽写了 `max-height: 280px`，但它是 Modal `.body` 的 flex 子项，默认 `min-height: auto`（内容高度）会盖过 `max-height`，长 HTML 把整张卡片撑出视口，按钮被顶到要往下滚才点得到。

## 行为

- 探测到 `h1-6` / `ul` / `li` / `p` / `br` / `code` 时先转成 `###` / `- ` 再走原解析。
- `&lt;h3&gt;` 这种二次转义先 decode 再转。
- `<code>src/</code>` 变成纯文本 `src/`，框内列表项仍是纯文本节点。
- `.dsh-desktop-update-dialog` 限制在 `100dvh - 48px`；说明 pane `min-height:0`、内部 `overflow:auto`；footer 仍是卡片 flex 的最后一行，不进滚动区。
- 更新勾的 inline `all:unset` 会清掉 rail 的 `-webkit-app-region:no-drag`，28px 拖窗条吃掉点击，只剩图标最下沿约 2px 能点。`[data-desktop-update-button]` 与 rail 按钮改为 `no-drag !important`。

## 验收

- `plugin/dsh-desktop-bridge/tests/update-notes.test.ts` 覆盖 rc.2 同款 HTML 与 entity-escaped 变体。
- 下一版桌面打进新 bridge 之后，确认框不再露出标签，安装按钮在视口内可直接点。当前已弹出的 rc.1 对话框救不了，点安装即可。
