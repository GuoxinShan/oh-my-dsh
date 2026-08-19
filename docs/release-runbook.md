# 发布 Runbook（GitHub Actions + GitHub Releases）

面向「推一个 tag 就出公证版安装包并接入自动更新」的完整操作手册。构建细节见 `packaging-playbook.md`，本文件只管发布。

## 0. 一次性配置：Secrets（Settings → Secrets and variables → Actions）

| Secret | 内容 | 生成方式 |
|---|---|---|
| `MACOS_CERTIFICATE` | Developer ID Application 证书的 p12（base64） | 在钥匙串里选中身份右键导出 p12 → `base64 -i export.p12 \| pbcopy` |
| `MACOS_CERTIFICATE_PWD` | 导出 p12 时设的密码 | 同上 |
| `KEYCHAIN_PASSWORD` | CI 临时 keychain 的密码 | 随机一串（`openssl rand -hex 16`），只是 CI 容器里的临时值 |
| `APPLE_SIGNING_IDENTITY` | 完整身份字符串 | 本地跑 `security find-identity -v -p codesigning` 照抄（形如 `Developer ID Application: <名> (TEAMID)`） |
| `APPLE_ID` | 用于公证的 Apple ID 邮箱 | — |
| `APPLE_PASSWORD` | 该 Apple ID 的 **App 专用密码** | appleid.apple.com → 登录与安全 → App 专用密码（⚠️ ASC 个人 API 密钥**不能**用于 notarytool，别走弯路） |
| `APPLE_TEAM_ID` | 10 位 Team ID | developer.apple.com → Membership Details |
| `TAURI_SIGNING_PRIVATE_KEY` | updater 签名私钥（整文件内容） | `tauri signer generate -w tauri-keys/dsh-desktop.key`（本地已生成，`tauri-keys/` 已 gitignore，**别提交**） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码 | 我们生成时为空，填一个空格或留空字符串 |

公钥已硬编码在 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`——**私钥丢失=自动更新链断**，需重新生成并换公钥发版。

## 1. 发布（正常路径）

```sh
# 1. 版本号两处同步：src-tauri/tauri.conf.json 的 version 与 src-tauri/Cargo.toml 的 version
# 2. （可选）runtime 升级：fork 打 desktop/v* 标签 + 更新 runtime/revision.json
git tag v0.1.2 && git push origin v0.1.2
```

推 tag 即触发 `.github/workflows/release.yml`：组装 runtime（缓存命中秒级）→ 构建 → Developer ID 签名（app + runtime 内 16 个 Mach-O）→ Apple 公证 → DMG 单独公证 → 上传 Release 附件（`dsh-desktop_<ver>_aarch64.dmg`、`dsh-desktop.app.tar.gz(+ .sig)`、`latest.json`）。

验证：Actions 页面全绿 → Releases 页有该 tag 的附件 → 本地 `spctl -a -vv` 下载的 dmg 应答 `Notarized Developer ID`。

## 2. 自动更新的接线（已内置，无需操作）

- 壳内 `tauri-plugin-updater` 端点：`releases/latest/download/latest.json`（随包配置）；更新包是 `dsh-desktop.app.tar.gz`，签名校验用上面的 tauri 私钥对应的公钥；
- 用户侧：**启动后约 3s 自动检查一次**——有新版时右下角「桌面版」pill 亮小圆点；点开弹层即见「更新到 vX.Y.Z」，一键下载+校验+安装+自动重启。也可手动点「检查更新」。dev 构建/离线时静默不打扰；
- **GitHub 的 latest 指向**：`action-gh-release` 每次发布同 tag 附件即更新 latest 指针；删旧 Release 不影响 latest 指向最新版。

## 3. 手动发布路径（CI 不可用时的备胎）

```sh
export PATH="$HOME/.cargo/bin:$PATH"
export DSH_CODESIGN_IDENTITY="Developer ID Application: … (TEAMID)"
export APPLE_SIGNING_IDENTITY="$DSH_CODESIGN_IDENTITY"
export APPLE_ID="…" APPLE_PASSWORD="…" APPLE_TEAM_ID="…"
export TAURI_SIGNING_PRIVATE_KEY="$(cat tauri-keys/dsh-desktop.key)"
pnpm desktop:build
xcrun notarytool submit src-tauri/target/release/bundle/dmg/dsh-desktop_*_aarch64.dmg \
  --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
# 上传：Releases 页手动拖 dmg + app.tar.gz + .sig + latest.json
# （latest.json 用 CI 步骤里那段 node 脚本本地生成）
```

## 4. 故障排查

| 症状 | 查法 |
|---|---|
| 公证失败 | `xcrun notarytool log <submission-id> --apple-id … --password … --team-id …`（submission-id 在 build 日志或 `notarytool history` 里）；`path` 字段直接点名是哪个文件 |
| 401 Unauthenticated | 凭据错：App 专用密码 ≠ 账号密码 ≠ ASC API 密钥（个人密钥不可用） |
| `errSecInternalComponent` | keychain 授权丢了：重跑 `security set-key-partition-list -S apple-tool:,apple:` |
| About 弹层「检查失败」 | 正常软失败路径：dev 构建无端点 / 离线 / Release 还没发过 latest.json |
| 更新下载后校验失败 | tauri 私钥与包内公钥不匹配——重发版并确认 `TAURI_SIGNING_PRIVATE_KEY` 是当前这对 |

## 5. 开源注意事项

- 本流水线在 public 仓库跑是安全的：secrets 不会暴露给 fork 的 PR（`pull_request` 不触发本 workflow，只有 tag/手动）；
- `runtime/revision.json` 指向公有 fork，runtime 组装无需凭据；
- 发布物（dmg）160MB 上下，GitHub Release 附件上限 2GB，无压力。
