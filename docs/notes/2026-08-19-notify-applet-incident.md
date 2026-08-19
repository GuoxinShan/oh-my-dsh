# 通知图标 applet 事故记录（2026-08-19）

## 目标与尝试

用户想让桌面壳的系统通知横幅携带 app 图标（osascript 通知恒显示 Script Editor 图标）。尝试了 osacompile applet 方案：在 `~/.dsh-desktop/DshNotify.app` 预制一个两行 AppleScript applet（`on run argv` → `display notification`），换掉它的 `applet.icns`，每次通知时 `open -g <app> --args title body`。方案在排查中被完整放弃并回退，`dsh_desktop_notify` 恢复为纯 osascript。

## 失败级联（每一步都是新坑）

1. **直接 exec applet 二进制**：macOS 不投递 run AppleEvent，applet 永远空转不退出（产生挂起进程）。
2. **改走 `open`**：args 以 raw utf8 传入 run handler，不强转 `as text` 直接 -1700 类型错误，且错误弹窗是模态框，`open -W` 随之挂死。
3. **applet 默认是普通 app**：无 LSUIElement 时每个实例进 Dock；挂起实例堆积 → Dock 被同一图标刷屏。
4. **最严重**：`open` 在 bundle 无法被 LaunchServices 识别时（每次通知都触发 provision 检查、与 `remove_dir_all`+osacompile 重建存在竞态），把可执行文件路径 fallback 给默认处理器 **Terminal.app**——每次通知开一个新终端窗口，累计 63 个。
5. 放大器：触发源正是本 agent 会话自己的回合完成事件——每轮工具调用结束就发一条通知，事故期间持续供弹。

## 处置

全部 applet 进程 pkill；删除 `~/.dsh-desktop/DshNotify.app` 与 stamp、/tmp 副本；`killall Dock`；63 个终端窗口经 AppleScript 逐一来关（`close (first window whose name contains "applet")` 循环——批量 `close every window whose ...` 静默无效）；`lib.rs` 回退至纯 osascript（strings 验证运行中的二进制无 DshNotify 残留）。Dock 图标改版（824 白砖 + 71% 蓝鲸）不受波及。

## 教训（给后来的自己）

- **osascript 通知在原理上无法携带自定义图标**，横幅归属 Script Editor；要图标必须有真实 .app bundle 身份。唯一正路是 M3 的 UNUserNotificationCenter（顺带解锁通知点击回跳，见 AGENTS.md 受阻条目）；过渡期若必须做，只能是**编译型** CLI helper .app（普通二进制、发完即退、生命周期确定），且先在 /tmp 把「进程必退出、不进 Dock、图标正确」三条验证完再接线。
- **fire-and-forget 路径上绝不 per-call provision GUI helper**：预制只能启动时一次完成（原子 rename + stamp），或干脆内嵌进构建。
- 会 spawn GUI 进程的实验：先跑 1 个实例验证生命周期，再接入自动路径；触发源是自身会话时要意识到反馈回路。
- 排查期间动用户桌面环境（Dock、Terminal）前，先想清理脚本长什么样。
