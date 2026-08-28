# 2026-08-28 更新下载弹窗（点击下载 + 进度条 + 取消 + 重启确认）

## 背景

标题带更新入口自 M3 起是「发现新版即后台自动下载，按钮原位旋转、不显示进度条，ready 后点击弹确认框」。目标交互（参照 Z.ai 桌面端）：有更新时出现下载小按钮 → **点击后**弹窗下载并展示进度条 → 完成后窗内提示「重启以更新」。

## 决策

### 发现不再自动下载，下载必须经用户点击

旧行为的后台自动下载在「每会话每版本一次」的克制下仍然违背「下载是用户意图」的语义，且没有进度出口。新流程：发现新版只出 22px 下载按钮；点击才发 `dsh_desktop_download_update` 并同时打开下载窗。安装依旧需要 ready 后的显式确认——下载与安装两级授权都比旧模型更清晰。

### 下载窗是 headless Modal，随相位切换内容

复用 ui-primitives 的 `Modal`（portal 到 body、Escape/遮罩 `onClose`），`headless` 模式自排卡片内容：

- `preparing`/`downloading`：图标块 +「正在下载 v{version}」+ 进度条（`dsh_desktop_update_status` 120ms 轮询 `downloaded/total` 字节；`total` 未知时退化为不定态滑动动画）+「取消下载」。
- `ready`：标题切「v{version} 已准备就绪」，保留既有更新说明面板（release notes 事实源不变），底部「稍后 / 重启以更新」。
- `failed`：窗内「关闭 / 重试」，重试先强制 `checkUpdate(true)` 再下载（壳的 `claimUpdateDownload` 只接受 `available` 相位）。
- 遮罩/Escape 只收起窗、下载继续，按钮原位旋转、再点重开；下载完成而窗被收起时，busy→ready 边自动重开窗（满足「完成以后提示重启更新」）。

### 取消走新 IPC `dsh_desktop_cancel_update`，壳取消 CancellationToken

electron-updater 的 `checkForUpdates()` 结果自带 `CancellationToken`（无需新增 builder-util-runtime 依赖；类型经 `ReturnType` 推导，不 import 传递依赖）。壳在 `downloadUpdate` 内持有该 token，`cancelUpdate()` 仅在 `preparing`/`downloading` 相位取消它；下载回卷后状态回到 `available`（保留 version 与 notes），`download_update` **正常返回而非报错**——用户取消不是失败。取消若落在下载前的 check 阶段，由 `cancelRequested` 标志在拿到 token 后兜底。

浏览器侧协调器的 `cancelUpdate` **不进序列化 tail**：它要取消的下载仍占着 tail，排队即死锁；壳本身是单飞权威，其他相位幂等 no-op。归档 0.2.x Tauri 壳无此命令，invoke 失败按「下载继续」软失败（弹窗已收起、按钮保持旋转可重开）。

### 兼容与边界

- 页面刷新途中遇到 in-flight 下载：挂载即见 busy 按钮（不二次触发 `downloadUpdate`），点击仅重开进度窗。
- 0.2.x Tauri cutover 路径不变：ready 且 notes 判定为换壳时，主按钮仍是「打开下载页」。

## 影响面

- 桥 `dsh-desktop-bridge` 0.2.0-rc.7 → 0.2.0-rc.8（desktop-owned，下次桌面发版随壳出）。
- IPC 命令表新增 `dsh_desktop_cancel_update`（先改表、两侧同 PR 落地）。
- 测试：`update-control.client.spec.tsx` 六个用例全量改写为弹窗流程；`update-coordinator.test.ts` 新增「取消越过队列」用例。
