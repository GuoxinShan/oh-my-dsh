# 运行面切换（右键品牌区 → 换 sidecar profile）

2026-08-28 · 壳 + bridge 同 PR

## 需求与结论

用户要在桌面运行时切换 sidecar 的整套运行面（profile）。结论：**进程内热切不可能也不必做**——harness 的 profile 是 boot 时的组合根（`runProfile` 一次成型，只有两个用户 patch 层热重载），切 profile 的真实形态是「带状态重启 sidecar」。sessions/settings/credentials 都在 `$DSH_HOME` 根下、跨 profile 共享，所以重启只丢运行中的回合和页面内存态，其余全保留。

## 交互形态：藏在品牌区右键

否决了「设置页新增 section」的第一稿（太显眼、且设置面板本身由当前 profile 渲染），按用户意图做成隐藏入口：右键点侧栏品牌区（whale 图标 / Oh My DSH 字标）→ 原生右键菜单「切换运行面…」→ 原生目录选择器 → 校验 → 原生确认框 → 切换。bridge 侧只是一个 document 捕获阶段的 `contextmenu` 监听（与外链路由、下载桥同一模式），不占用新 slot、不扩 slot 白名单；锚点是 `[data-slot="sidebar.brand.mark"]`/`[data-slot="sidebar.brand.name"]` 两个槽包装（mark 槽即使无 branding 插件也有 stock fallback 渲染，手势始终可用）。

**渲染端零入参**：`dsh_desktop_switch_surface` 不接受路径参数，目录只能由壳侧选择器给出——webview 内容无法把任意路径塞进切换流。自动化走 `DSH_DESKTOP_E2E_SURFACE`（沿用 `dialog.ts` 的 automation 门：仅 debug/e2e 生效）。

## 目录校验（`src/surface.ts`，纯函数）

picker 可以落到任何路径，所以校验必须硬：① 必须是 `$DSH_HOME/profiles` 的**直接子目录**（harness 的 `--profile <name>` 只从这里解析；想放别处的目录，`profiles/` 下建软链接即可，校验跟随软链）；② 名称过 harness `resolveProfileDir` 同款规则（排 `node_modules`——那是模块 fallback 目录）；③ 存在且是目录；④ `package.json` 可解析且 `dsh.profile.bundles` 含 `@deepseek-ai/dsh-web-app`（没有 web bundle 就没有 HTTP 面，切过去窗口无从加载）；⑤ 可读写（首切要往里装包）。每条拒绝理由都是面向用户的中文文案。

## 切换流（`src/surface-switch.ts`）

确认框 → 首次切换先对目标 profile 跑**与 boot 完全相同的六包 shadow-CAS 事务**（`runDesktopPluginInstall` 泛化出 profile 参数；journal 仍是 home 级单飞，profile-repair 恢复从事故 journal 的 `realProfile` 反推目标 profile，无 journal 时扫所有 profile 的 marker）→ 准备期间旧 sidecar 不停、会话可用，**但事务是主进程同步 `spawnSync`，窗口与桌面集成会暂停响应**（确认框文案如实说明；M2 改进项：把事务挪进子进程）→ kill → `--profile <name>` respawn（`web` 子命令只是 `--profile web` 的别名，统一走 flag 形态）→ waitReady → 窗口 `loadURL(waitReady 返回的 token URL)`。0.1.2 起裸 `http://127.0.0.1:<port>` 是 401（`authentication required`），不能再自己拼端口。

**状态落盘时机是安全关键**：活动面只在新 sidecar 就绪**之后**写。未就绪 → respawn 旧运行面 + loadURL 回退 + 原生报错；进程此时崩溃，下次启动仍是旧运行面。boot 时活动运行面被终端删/改坏 → 原生提示并回退 web。六包（含 bridge）进每个被切到的运行面，保证新面上右键入口还在、切得回来。

**状态按 home 键控**：`~/.dsh-desktop/active-profiles/<home-hash>.json`（与 adoption 记录同思路）。首版写成全局单文件 `active-profile.json` 时 e2e 立刻抓到一个真实泄漏：scratch home 的切换把 `active: work` 写进了真实 `~/.dsh-desktop`，量产壳下次 boot 会误读。键控后每个 DSH_HOME 一份，终端/隔离 home 互不感知。

## 边界（刻意不做）

- adoption 的授权/备份/恢复机器保持 web-only：它保护的是「首次共享既有 Home」那一刻；切换流的确认框自带授权语义，CAS 事务本身保证目标 profile 不留半成品。
- 不做 profile 新建 UI（终端 `dsh plugin --profile <name> add` 创建后补 web bundle 即可）；不做切换进度遮罩（确认框文案已设预期）；不做原生菜单列出已有 profile（picker 一条路，M2 再说）。
- 终端 `dsh web` 永远 boot web profile，与桌面的 `active-profile.json` 互不感知——同一个 Home 两个面各自选择。

## 验证

- 纯函数单测：`src/surface.test.ts`（名校验、状态读写/损坏回退、目录校验六路含软链）；`shell.test.ts` 的 `planSidecarSpawn` 断言改为 `--profile` 形态并加 work 用例；bridge 侧 `tests/surface-menu.test.ts`（命中/未命中/拒收/dispose）。
- profile-repair 既有 37 个测试全过（签名泛化后行为不变）；壳全量 88 过 87，唯一失败是 HEAD 预存的 one-node shim 用例（与本改动无关，留待 shim 所有者修）。
- e2e：`DSH_DESKTOP_E2E_PROBE=1 DSH_DESKTOP_E2E_SURFACE=<profile 目录> DSH_DESKTOP_DIALOG_DEFAULT=primary DSH_DESKTOP_E2E_EXIT=1 pnpm desktop:dev`——探针在 badge 就绪后触发切换，壳在新 sidecar 就绪后自报 verdict 退出。

## 发版备注

本改动与树内另一笔未提交工作（更新下载弹窗，bridge 0.2.0-rc.8）同树并进；版本号与 CHANGELOG 留给发版者一次 bump（壳 + bridge 都动了，按纪律下次桌面 release 必须 bump 仓根 package.json）。
