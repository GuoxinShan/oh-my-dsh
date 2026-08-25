# OpenCode Go 用量 404：quotaBase 被裁成 origin

日期：2026-08-25

## 症状

面板 OpenCode Go 行显示「上游接口返回错误: upstream HTTP 404」。

## 根因

`resolveConfig` 为防路径注入，把每个 source 的 `quotaBase` 一律压成 `scheme://host`（`originOf`）。OpenCode 适配器原先声明：

- `base: https://opencode.ai/zen/go`
- `getJson('/v1/usage')`

压 origin 后实际请求变成 `https://opencode.ai/v1/usage`（HTML 404）。正确端点是 `https://opencode.ai/zen/go/v1/usage`（无 key 时 401，路径仍存在）。

CHAT_PATH_SUFFIXES 里 `opencode-go: []` 的旧注释假设「保留 /zen/go 前缀」，与后续强制 origin 折叠矛盾。

## 修法

适配器改为与其它厂商一致：base 只留 host，路径写全：

- `base: https://opencode.ai`
- `getJson('/zen/go/v1/usage')`

发 `dsh-provider-balance@0.4.3`。
