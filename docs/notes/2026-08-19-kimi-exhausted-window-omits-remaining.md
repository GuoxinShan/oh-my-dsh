# Kimi 耗尽窗口省略 `remaining`：余额插件把耗尽显示成 100%（0.4.2）

日期：2026-08-19 · 包：`plugin/dsh-provider-balance`

## 现象

Kimi Code（`kimi-coding`）5 小时额度实际耗尽，输入框胶囊却显示「剩余 100%」；周窗口显示正常（43%）。

## 取证（live harness，2026-08-19）

- `GET /provider-balance/quota?events=1&provider=kimi-coding`：近 30 次刷新全部 `ok:true`，`via:credentials`——不是网络/鉴权失败，是**成功读取后解析错误**。
- 直连 `https://api.kimi.com/coding/v1/usages`（凭据库里的 `sk-kimi-` key，HTTP 200）：

  ```json
  "usage":   { "limit": "100", "used": "57", "remaining": "43", "resetTime": "…" },
  "limits": [ { "window": { "duration": 300, "timeUnit": "TIME_UNIT_MINUTE" },
                "detail": { "limit": "100", "used": "100", "resetTime": "…" } } ]
  ```

  **耗尽的 5h 窗口没有 `remaining` 键**，只剩 `limit`/`used`/`resetTime`；未耗尽的周窗口三字段齐全。

## 根因

`kimiWindow()`（src/index.ts）对缺失 `remaining` 的处理是 `Number(undefined) = NaN → 回退为 limit（满额）`，于是 `usedPercent = 0`、`remainingPercent = 100`。上游 API 的「省略即耗尽」语义与插件的「省略即默认满额」假设正面冲突。

## 修复（0.4.2）

- `remaining` 缺失时改用 `limit - used` 反推（`used` 字段进 `KimiDetail` 类型）；
- `used`/`remaining` 皆缺 → 窗口按不可读整体丢弃（不捏造数值）；
- `remaining` 存在时行为不变（周窗口回归验证 43% 不变）。

验证：mock fetch 用实测响应体驱动 `apply()` 全链路——session `{usedPercent:100, remainingPercent:0}`，weekly 43%，不可读窗口被省略。

## 顺带澄清的两个报错语义（同日实测）

- **invalid key ≠ 余额不足**。坏 key 打 usages 接口：HTTP 401 `unauthenticated / REASON_INVALID_AUTH_TOKEN`；额度耗尽打 chat 接口（`/coding/v1/chat/completions`）：HTTP 403 `access_terminated_error`（"You've reached your usage limit…"）。用户侧看到 "invalid key" 时是 key 本身被拒（错 key / 跨产品 key），不是额度问题。
- `/coding/v1/messages`（Anthropic 兼容端点）在 usages 报耗尽的状态下仍放行小请求——Kimi 两端点限流执法不一致，以 usages 数据为准。

## 安装面重指

live profile 仍从旧源仓 `~/workspace/dsh-provider-balance`（subtree 迁入前的位置）加载本插件。本次把 `~/.dsh/profiles/web/package.json` 依赖与 `node_modules/dsh-provider-balance` 软链重指到本仓 `plugin/dsh-provider-balance`。`dsh-mcp-settings` 的依赖同样还指旧仓——同类迁移收尾，留待后续。
