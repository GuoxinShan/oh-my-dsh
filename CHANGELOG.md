# Changelog

Oh My DSH 桌面端的面向用户变更。插件各自有包内 CHANGELOG 的，不在这里重复。发版时 `scripts/release-notes.mjs` 抽取对应 `## [version]`（没有则回退 `## [Unreleased]`）写入 GitHub Release 与 `latest-mac.yml` / `latest.yml` 的 `releaseNotes`。

## [Unreleased]

## [0.3.0-rc.21] - 2026-09-02

### Fixed

- 切运行面不再 `loadURL` 裸端口：窗口加载 sidecar 打印的 `?token=` URL，避免 0.1.2 的 `authentication required`。
- 旧 sidecar 只打印不带 token 的 `dsh web:` 行时仍能就绪；有 token 行时优先 token。
- runtime 里已经不存在的插件 peer（0.1.2 删掉的 `dsh-client-runtime`）跳过，不再整进程扔。
- Runtime 升到 `v0.1.2-alpha.3+zw.2`：`dsh-client-modules` 认出 `@crazx` 换 scope 再发布，HTML 能预加载 `client.js`。未改动的 fork 包按 zw 层向下找已发布版本。

## [0.3.0-rc.20] - 2026-09-02

### Fixed

- prepare-runtime 的 fork 名单对齐 0.1.2 发布面：卸已删除的 `dsh-host-apiproxy`，改钉已发布的 `dsh-api-session-controller`。rc.19 因此装不出 runtime。

## [0.3.0-rc.19] - 2026-09-02

### Changed

- Runtime 升到 `v0.1.2-alpha.3+zw.1`。0.1.2 起 `dsh web` 的 index 要一次性 `?token=` 兑换 cookie，壳改为解析 sidecar 打印的回环 URL，不再探 `GET /`。
- `dsh-web-search-toggle` 0.1.4，以及 mcp-settings / reasoning-efforts：对齐 0.1.2 删除的 `settingsNamespace()` / `installSettingsSection`。

## [0.3.0-rc.18] - 2026-09-01

### Fixed

- 模型设置行的按钮布局修复（dsh-model-image-input 0.1.1 / dsh-model-efforts-editor 0.1.1）：stock 模型行是固定 4 列 grid，两个插件各注入一个按钮后列模板竞争——展开钮溢出卡片右缘、删除钮被挤到隐式第二行换行。两插件统一改为给行加 flex 规则，按钮占固有宽度、输入框按 1.4:1 分剩余宽度并优先收缩，任意按钮数量共存都不再溢出/换行。

## [0.3.0-rc.17] - 2026-09-01

### Fixed

- 问题刻度尺（dsh-question-rail 0.5.1）：展开/收起动画丝滑化——刻度层与列表层常驻叠加、宽度只做「抽屉揭示」（内容不再瞬时切换、不在窄容器里挤压重排），两层交叉淡入淡出；展开后滚动位置跨悬停保持。

## [0.3.0-rc.16] - 2026-09-01

### Changed

- 问题刻度尺（dsh-question-rail 0.5.0）：刻度与展开条目一一对应——共用 32px 槽位网格，侧边第 i 个刻度和展开后第 i 个问题在同一个位置，鼠标悬停时面板原地加宽、条目就在刻度原位显字，零跳动；槽距变大更好点按；去掉了「我的问题」标题栏。面板里往上滑补载更早问题、点击跳转高亮均保持不变。

## [0.3.0-rc.15] - 2026-08-31

### Changed

- 问题刻度尺（dsh-question-rail 0.4.0）：侧边刻度保持最近 10 条；悬停展开的面板现在是完整问题列表——在面板里往上滑到顶部就自动补载更早的问题（逐页 50 条），直到历史全部就位，补载时阅读位置不动。打开会话本身不再触发任何历史加载，正文的「加载更多」节奏完全恢复原生；只有你在面板里主动往上滑，历史才会进来。点击刻度/条目跳转高亮不变。

## [0.3.0-rc.14] - 2026-08-31

### Changed

- 问题刻度尺（dsh-question-rail 0.3.0）：刻度与列表改为严格时间正序（此前补载历史后新旧问题会颠倒）；只展示**最近的 10 条提问**，正文恢复原生懒加载节奏——不再打开会话就把历史全部拉进来，仅当当前窗口不足 10 条时才在后台有界补页；点击刻度/条目时若目标还没加载，会自动补载到目标再平滑跳转高亮。

## [0.3.0-rc.13] - 2026-08-31

### Changed

- 问题刻度尺（dsh-question-rail 0.2.0）：打开长会话即刻度尺后台自动载入全部历史（每页 50 条，上限 2000 条），所有提问的刻度一两秒内全部就位，不再需要先往上滑点「加载更多」；每页落地时阅读位置不动。历史被完整载入后「加载更多」按钮自然消失，往上滑即纯滚动；超过上限的会话在面板标题提示「更早的未载入」。

## [0.3.0-rc.12] - 2026-08-31

### Added

- 新插件「问题刻度尺」（dsh-question-rail）随桌面分发：会话里你的提问（含回合中插话）达到 6 条时，对话左缘出现一把垂直居中、无背景的等距刻度尺；鼠标悬停展开可上下滑动的问题列表（原生菜单观感），点击刻度或条目平滑滚动跳转到对应消息并短暂高亮。刻度尺随正文/输入框一起参与布局运动，侧栏收起展开不割裂；终端 `dsh web` 与普通浏览器同一条路可用。

`v0.3.0-rc.11` 的打包流水线漏装新插件依赖而失败，没有 GitHub Release。

## [0.3.0-rc.10] - 2026-08-31

### Fixed

- macOS 热更新「重启以更新」不再静默失败：后台保留的关窗拦截此前挡住了更新退出序列，ShipIt 一直等不到进程退出、安装交换被搁置（实测 78 分钟），重启后看似更新失败。
- Mac 热更新在就绪前预置新版 runtime：此前 slim zip 的运行时留到重启后首启才下载，主进程阻塞且没有任何窗口与进度，慢网络下数分钟「装死」。现在下载阶段即把 runtime 拉取到本地并校验（进度在下载窗可见、可取消），重启后秒级回起；预置失败则留在旧版报「下载失败」可重试，绝不带着缺失运行时重启。
- 更新下载窗的图标块不再转圈，展示静态应用图标。

## [0.3.0-rc.9] - 2026-08-28

### Fixed

- 退出后台服务时等整棵进程树结束再继续，不再留下比主进程晚死几秒、占着固定端口的插件子进程（典型症状：切换运行面后新运行面一启动就报「端口被占用」退出）。
- 后台服务一启动就崩溃时立即回退并弹窗告知原因（含退出码/信号与端口占用排查提示），不再空等两分钟、窗口看起来像死了。

## [0.3.0-rc.8] - 2026-08-28

### Fixed

- macOS sidecar 的 `DSH Node.app` 复制后改为 ad-hoc 重签。此前 Developer ID + Hardened Runtime 的 stub 换了 Info.plist 会被系统 SIGKILL，日志空白，启动空等 120 秒。

## [0.3.0-rc.6] - 2026-08-28

### Changed

- Mac 热更新 zip 不再重复携带未变的 runtime tarball；DMG 仍可离线安装。已热更过一次后走 zip 差分，日志在 `~/.dsh-desktop/logs/updater.log`。
- 自动更新走系统代理 / `HTTPS_PROXY`；可选 `DSH_UPDATE_MIRROR` 加速 GitHub 大文件下载，失败回落官方 Release。

`v0.3.0-rc.5` 在瘦 zip 重打 blockmap 时失败，没有 GitHub Release。

## [0.3.0-rc.7] - 2026-08-28

### Added

- 运行面切换：右键点击侧栏 Oh My DSH 图标 / 字标 →「切换运行面…」，选择 `$DSH_HOME/profiles` 下的运行面目录（需含 Web 界面层；首次切换会自动装入桌面组件），确认后后台服务自动重启、窗口自动重载。会话、设置与凭据全部保留，下次启动沿用所选运行面；目标运行面异常时自动回退默认运行面。
- 更新下载窗：点击更新按钮弹出下载窗，实时进度条（未知大小时为不定态动画），支持「取消下载」；下载完成窗内切「稍后 / 重启以更新」并展示更新说明，收起窗后下载继续、完成时自动重开。

### Changed

- 发现新版本不再自动后台下载：更新按钮出现后需点击才开始下载，安装仍需就绪后的显式确认——下载与安装各自单飞、两级授权。

## [0.3.0-rc.5] - 2026-08-28

### Changed

- Mac 热更新 zip 不再重复携带未变的 runtime tarball；DMG 仍可离线安装。已热更过一次后走 zip 差分，日志在 `~/.dsh-desktop/logs/updater.log`。
- 自动更新走系统代理 / `HTTPS_PROXY`；可选 `DSH_UPDATE_MIRROR` 加速 GitHub 大文件下载，失败回落官方 Release。

## [0.3.0-rc.4] - 2026-08-28

### Fixed

- macOS sidecar 改为 LSUIElement helper 子进程，同事机没有 clang 时也不再出现两颗 Dock 图标。

## [0.3.0-rc.3] - 2026-08-28

### Fixed

- macOS 打开应用时 Dock 不再闪一颗马上消失的图标（sidecar 不再 `setsid` 成第二份 `.app`）。
- 更新说明按 GitHub HTML 收成标题/列表；标题带已下载勾可点，不再被拖窗条抢走点击。
- 自动更新只认 GitHub `releases/latest`，不再因空的 `-rc` tag 刮 atom 而静默失败。
- 测试与 `desktop:dev` 不再把共享 `node-shim` 写成死路径（云之家登录 ENOENT）。

### Changed

- 新增模型档位编辑器插件：设置 → 模型的每条自定义模型行内可直接编辑推理档位组合、各档线上值与 Z.ai 线缆格式，改档位不再需要手工编辑 settings.yaml 或重新发版。

## [0.3.0-rc.2] - 2026-08-27

### Fixed

- 新建会话时 agent 附着的短暂 running 脉冲不再发「回合已完成」。
- 启动或切工作区灌入会话列表时，不再把历史会话刷进通知中心。
- macOS 上 Bash 等工具不再在 Dock 冒出通用 exec 图标。

### Changed

- 新增模型档位编辑器插件：设置 → 模型的每条自定义模型行内可直接编辑推理档位组合、各档线上值与 Z.ai 线缆格式，改档位不再需要手工编辑 settings.yaml 或重新发版。

- Tauri 壳从仓库删除；Electron 升为正职 `src/`。图标与 DMG 背景随壳走。

## [0.3.0-rc.1] - 2026-08-25

### Changed

- 桌面壳换成 Electron（Chromium）。macOS 用 `hiddenInset` 标题栏；通知带应用身份，点击回到窗口。
- 自动更新改为 `electron-updater`。0.2.x Tauri 用户须手动下载。
- macOS 关窗后壳与 sidecar 留在后台（通知仍会响），Dock 点回来；Cmd+Q 才退出。
- 0.3.x Release 仍放一份 `latest.json`，让 0.2.x 看到换壳说明而不是端点 404；不能热更新，须手动下载。

### Added

- 标题带通知中心。切到其他应用或非当前会话时发系统通知，点击打开对应会话。

### Fixed

- macOS DMG 安装窗按 660×400 出，不再被 2x 背景像素撑成 1320×800。


## [0.2.0-rc.23] - 2026-08-24

### Fixed

- Overlay 标题栏下，带内控件相对红绿灯上漂（WKWebView 根滚动器的自动 content inset）。

## [0.2.0-rc.22] - 2026-08-22

### Changed

- 运行中发送按钮的 Stop 态改为主题柔和红，与蓝色 Send 区分。

### Fixed

- 规范化更新包资源名，避免 updater URL 对不上附件。
