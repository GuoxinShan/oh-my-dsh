# 发布 Runbook（GitHub Actions + GitHub Releases）

面向「推一个 tag 就出发布物」的完整操作手册。构建细节见 `packaging-playbook.md`，本文件只管发布。

## 0. tag 约定（增量发布，桌面与插件互不锁步）

| 发什么 | tag | Release 产物 | latest 指针 |
|---|---|---|---|
| 桌面公证版 | `v<semver>`（如 `v0.3.0-rc.1`） | dmg + zip + Windows NSIS setup.exe + latest-mac.yml + latest.yml | **独占**（`make_latest: true`） |
| 插件 | `<包名>-v<semver>`（如 `dsh-mcp-settings-v0.2.3`） | git archive 的插件源码 tarball + 安装说明 | **永不**（`make_latest: false`） |
| runtime fork | `v<基线>+zw.<补丁>`（如 `v0.1.0-rc.7+zw.1`，在 fork 仓库） | 无 Release，仅 git tag 供 revision.json 钉 | — |

**版本号策略**（学 harness 的 rc 节奏）：桌面大功能走 `0.N.0-rc.x`，稳定摘 `-rc` 出 `0.N.0`，纯修复走 `0.N.M+1`；插件各自 semver 同样允许 `-rc.N`。两个红线：① **GitHub Release 不勾 prerelease**（`releases/latest` 端点排除 prerelease，勾了自动更新即 404）；② tag 版本必须与代码版本一致——release.yml 已内置防呆校验，不一致直接 fail。

⚠️ **latest 指针纪律**：桌面自动更新端点是 `releases/latest/download/latest-mac.yml`（mac）与 `latest.yml`（win）——插件 Release 抢走 latest 会让桌面自动更新即刻 404。流水线已内置 `make_latest: false`；若手动在网页上发插件 Release，务必不勾 "Set as the latest release"。桌面版本号 = 仓根 `package.json`；插件版本号 = 各包 `package.json`。runtime fork 标签用 `v<基线>+zw.<补丁>`。

⚠️ **0.2.x → 0.3.x 断链**：0.2.x 走 Tauri `latest.json` + minisign。0.3.x 走 electron-updater。0.3.x Release 仍附带一份 cutover `latest.json`（版本号 + 换壳说明，平台 URL 是占位），避免 0.2.x 检查 404 后完全静默；不能把 Electron 包当 Tauri 更新安装。已装 0.2.x 须从 Releases 手动下载。

**独立版本不等于独立交付面**：插件 tag 只发布可手动安装的插件 archive，不会更新已安装 desktop。若该插件属于 AGENTS.md 声明的 desktop-owned 资源集合，首次发布或版本升级必须同一轮更新 prepare/resources/壳安装链、提升 desktop 版本并再推 `v<semver>`；只有 desktop Release 才会把它交付给桌面用户。具体到本次交付，`dsh-web-search-toggle` 0.1.3 必须由 Desktop `v0.2.0-rc.14` 携带，不能以插件 `dsh-web-search-toggle-v0.1.3` Release 替代。

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
| `WINDOWS_CERTIFICATE` | Authenticode 证书的 pfx（base64） | 有代码签名 PFX 才填；空则 Windows 安装包不签（SmartScreen 警告） |
| `WINDOWS_CERTIFICATE_PASSWORD` | 导出该 pfx 时的密码 | 与上一行成对 |

## 1. 发布（正常路径）

**桌面**：

```sh
# 1. 版本号：仓根 package.json 的 version（当前 0.3.0-rc.2）
# 2. （可选）runtime 升级：fork 打 v<基线>+zw.<补丁> 标签 + 更新 runtime/revision.json
git tag v0.3.0-rc.2 && git push origin v0.3.0-rc.2
```

推 tag 即触发 release.yml：`desktop-macos`（组装 runtime → electron-rebuild → electron-builder 只签名打 dmg/zip → `scripts/notarize-mac-artifacts.sh` 并行公证 zip 与 DMG，再 staple DMG）与 `desktop-windows`（同套 prepare，出 NSIS）并行，`desktop-publish` 从 `CHANGELOG.md` 抽取该版本说明后上传 Release（dmg、zip、setup.exe、latest-mac.yml、latest.yml；`prerelease: false`、`make_latest: true`）。任一侧失败则不发版。发版 prepare 走 `DSH_DESKTOP_PREPARE_MODE=build`（跳过已在 CI 跑过的 typecheck/test）。

验证：Actions 页面全绿 → Releases 页该 tag 为 latest → 本地 `spctl -a -vv` 下载的 dmg 应答 `Notarized Developer ID`。需要复核安装页时用临时 venv 安装 `ds-store==1.3.1`，再把该 venv 的 `bin` 放到 `PATH` 后执行 `bash scripts/verify-dmg-layout.sh <下载的.dmg>`；脚本会解析发布件的 Finder 记录，而不是只看构建目录。

**插件**：

```sh
cd plugin/dsh-provider-balance
# bump package.json version，提交后：
git tag dsh-provider-balance-v0.4.2 && git push origin dsh-provider-balance-v0.4.2
```

触发 plugin job（ubuntu，秒级）：`git archive` 打插件子树 tarball → Release 附件 + 安装说明（`dsh plugin add <repo>#plugin/<name>:<tag>`），`make_latest: false`。测试仍在 ci.yml 的 push/PR 里跑；插件 Release 不重复跑测试（快照已由 tag 锚定）。

## 2. 自动更新的接线（已内置，无需操作）

- 壳内 `electron-updater` 读 GitHub Releases 的 `latest-mac.yml` / `latest.yml`；更新包是 macOS zip 与 Windows NSIS setup.exe；
- 用户侧：**后台定时检查**（启动 3s 首查，之后每 2h）——macOS 有新版时左上角侧栏开关旁亮出下载图标，其他平台用右上角 fallback；发现即后台下载，点已下载图标才开确认框，只有确认才安装并自动重启；
- **GitHub 的 latest 指向**：desktop Release `make_latest: true` 独占 latest；插件 Release 一律 `make_latest: false`；
- **0.2.x Tauri 用户**：旧 `latest.json` 端点不再更新。必须卸载或并行安装 0.3.x，不能自动热替换。

## 3. 手动发布路径（CI 不可用时的备胎）

```sh
export DSH_CODESIGN_IDENTITY="Developer ID Application: … (TEAMID)"
export CSC_NAME="$DSH_CODESIGN_IDENTITY"
export APPLE_ID="…" APPLE_APP_SPECIFIC_PASSWORD="…" APPLE_TEAM_ID="…"
pnpm desktop:build -- --mac
bash scripts/notarize-mac-artifacts.sh release/*.dmg release/*.zip
# 上传：Releases 页手动拖 dmg + zip + latest-mac.yml
```

## 4. 故障排查

| 症状 | 查法 |
|---|---|
| 公证失败 | `xcrun notarytool log <submission-id> --apple-id … --password … --team-id …`（submission-id 在 build 日志或 `notarytool history` 里）；`path` 字段直接点名是哪个文件 |
| 401 Unauthenticated | 凭据错：App 专用密码 ≠ 账号密码 ≠ ASC API 密钥（个人密钥不可用） |
| `errSecInternalComponent` | keychain 授权丢了：重跑 `security set-key-partition-list -S apple-tool:,apple:` |
| 后台没有出现更新入口 | 未打包构建会跳过检查；离线 / Release 还没发过 latest-mac.yml 都走静默软失败 |
| 更新下载后校验失败 | 标题带入口保留目标版本并进入可重试失败态；核对 electron-builder 签名与 GitHub 附件是否同一次构建 |
| DMG 安装页退化成默认布局 | `bash scripts/verify-dmg-layout.sh <dmg>` |

## 5. 开源注意事项

- 本流水线在 public 仓库跑是安全的：secrets 不会暴露给 fork 的 PR（`pull_request` 不触发本 workflow，只有 tag/手动）；
- `runtime/revision.json` 指向公有 fork，runtime 组装无需凭据；
- 发布物（dmg）160MB 上下，GitHub Release 附件上限 2GB，无压力。
