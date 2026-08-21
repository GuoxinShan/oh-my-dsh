# 发布 Runbook（GitHub Actions + GitHub Releases）

面向「推一个 tag 就出发布物」的完整操作手册。构建细节见 `packaging-playbook.md`，本文件只管发布。

## 0. tag 约定（增量发布，桌面与插件互不锁步）

| 发什么 | tag | Release 产物 | latest 指针 |
|---|---|---|---|
| 桌面公证版 | `v<semver>`（如 `v0.2.0-rc.2`） | dmg + app.tar.gz + Windows NSIS setup.exe + .sig + latest.json（含 darwin-aarch64 与 windows-x86_64） | **独占**（`make_latest: true`） |
| 插件 | `<包名>-v<semver>`（如 `dsh-mcp-settings-v0.2.3`） | git archive 的插件源码 tarball + 安装说明 | **永不**（`make_latest: false`） |
| runtime fork | `v<基线>+zw.<补丁>`（如 `v0.1.0-rc.7+zw.1`，在 fork 仓库） | 无 Release，仅 git tag 供 revision.json 钉 | — |

**版本号策略**（学 harness 的 rc 节奏）：桌面大功能走 `0.N.0-rc.x`，稳定摘 `-rc` 出 `0.N.0`，纯修复走 `0.N.M+1`；插件各自 semver 同样允许 `-rc.N`。两个红线：① **GitHub Release 不勾 prerelease**（`releases/latest` 端点排除 prerelease，勾了自动更新即 404）；② tag 版本必须与代码版本一致——release.yml 已内置防呆校验，不一致直接 fail。

⚠️ **latest 指针纪律**：桌面自动更新端点是 `releases/latest/download/latest.json`——插件 Release 抢走 latest 会让桌面自动更新即刻 404。流水线已内置 `make_latest: false`；若手动在网页上发插件 Release，务必不勾 "Set as the latest release"。桌面版本号 = `tauri.conf.json` 与 `Cargo.toml` 两处同步；插件版本号 = 各包 `package.json`。runtime fork 标签用 `v<基线>+zw.<补丁>`（semver build metadata，行业标准的 fork 标识法）。

**独立版本不等于独立交付面**：插件 tag 只发布可手动安装的插件 archive，不会更新已安装 desktop。若该插件属于 AGENTS.md 声明的 desktop-owned 资源集合，首次发布或版本升级必须同一轮更新 prepare/resources/壳安装链、提升 desktop 版本并再推 `v<semver>`；只有 desktop Release 才会把它交付给桌面用户。

## 0.5 一次性配置：Secrets（Settings → Secrets and variables → Actions）

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
| `WINDOWS_CERTIFICATE` | Authenticode 证书的 pfx（base64） | 有代码签名 PFX 才填；空则 Windows 安装包不签（SmartScreen 警告）。生成：`[Convert]::ToBase64String([IO.File]::ReadAllBytes('cert.pfx'))` |
| `WINDOWS_CERTIFICATE_PASSWORD` | 导出该 pfx 时的密码 | 与上一行成对；买证与流程见 packaging-playbook §9 |

公钥已硬编码在 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`——**私钥丢失=自动更新链断**，需重新生成并换公钥发版。

## 1. 发布（正常路径）

**桌面**：

```sh
# 1. 版本号两处同步：src-tauri/tauri.conf.json 的 version 与 src-tauri/Cargo.toml 的 version
# 2. （可选）runtime 升级：fork 打 v<基线>+zw.<补丁> 标签 + 更新 runtime/revision.json
git tag v0.2.0-rc.2 && git push origin v0.2.0-rc.2
```

推 tag 即触发 release.yml：`desktop-macos`（组装 runtime → 构建 → 校验 DMG Finder 布局 → Developer ID 签名 → Apple 公证 → DMG 单独公证）与 `desktop-windows`（同套 prepare，出 NSIS `*-setup.exe`）并行，`desktop-publish` 合并两份 updater fragment 为 `latest.json`（`darwin-aarch64` + `windows-x86_64`）后上传 Release（自动生成 Release Notes；dmg、app.tar.gz(+ .sig)、setup.exe(+ .sig)、latest.json；`prerelease: false`、`make_latest: true`）。任一侧失败则不发版，避免 latest.json 缺平台把该平台的自动更新打穿。macOS job 必须保留 `TAURI_BUNDLER_DMG_IGNORE_CI=true`：否则 Tauri 因 `CI=true` 跳过 Finder AppleScript，发布 DMG 会有背景文件却没有启用背景/布局的 `.DS_Store`。

验证：Actions 页面全绿 → Releases 页该 tag 为 latest → 本地 `spctl -a -vv` 下载的 dmg 应答 `Notarized Developer ID`。需要复核安装页时用临时 venv 安装 `ds-store==1.3.1`，再把该 venv 的 `bin` 放到 `PATH` 后执行 `bash scripts/verify-dmg-layout.sh <下载的.dmg>`；脚本会解析发布件的 Finder 记录，而不是只看构建目录。

**插件**：

```sh
cd plugin/dsh-provider-balance
# bump package.json version，提交后：
git tag dsh-provider-balance-v0.4.2 && git push origin dsh-provider-balance-v0.4.2
```

触发 plugin job（ubuntu，秒级）：`git archive` 打插件子树 tarball → Release 附件 + 安装说明（`dsh plugin add <repo>#plugin/<name>:<tag>`），`make_latest: false`。测试仍在 ci.yml 的 push/PR 里跑；插件 Release 不重复跑测试（快照已由 tag 锚定）。

## 2. 自动更新的接线（已内置，无需操作）

- 壳内 `tauri-plugin-updater` 端点：`releases/latest/download/latest.json`（随包配置）；更新包是 macOS `dsh-desktop.app.tar.gz` 与 Windows `*-setup.exe`，签名校验用上面的 tauri 私钥对应的公钥；`latest.json` 的 `platforms` 必须同时带上已发布的每一个 OS，缺一项该平台的检查会失败；
- 用户侧：**后台定时检查**（启动 3s 首查，之后每 2h）——macOS 有新版时左上角侧栏开关旁亮出下载图标（收起态 `+` 仍在其右侧），其他平台用右上角 fallback；点击后原位旋转并完成下载与签名校验，再弹确认框，只有确认才安装并自动重启；离线/无端点时入口不出现、完全静默；
- **GitHub 的 latest 指向**：desktop Release `make_latest: true` 独占 latest；插件 Release 一律 `make_latest: false`（见 §0 的指针纪律）。

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
| 后台没有出现更新入口 | dev 构建无端点 / 离线 / Release 还没发过 latest.json 都走静默软失败；先确认 `latest.json` 可达且其版本高于当前包 |
| 更新下载后校验失败 | 标题带入口保留目标版本并进入可重试失败态；tauri 私钥与包内公钥不匹配时需重发版，并确认 `TAURI_SIGNING_PRIVATE_KEY` 是当前这对 |
| DMG 安装页退化成默认布局 | `bash scripts/verify-dmg-layout.sh <dmg>`；若报 `.DS_Store` 缺失，检查 macOS build 是否保留 `TAURI_BUNDLER_DMG_IGNORE_CI=true` |

## 5. 开源注意事项

- 本流水线在 public 仓库跑是安全的：secrets 不会暴露给 fork 的 PR（`pull_request` 不触发本 workflow，只有 tag/手动）；
- `runtime/revision.json` 指向公有 fork，runtime 组装无需凭据；
- 发布物（dmg）160MB 上下，GitHub Release 附件上限 2GB，无压力。
