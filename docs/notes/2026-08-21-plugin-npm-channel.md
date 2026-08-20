# 2026-08-21 插件 npm 双通道（dsh-mcp-settings / dsh-provider-balance）

## 决策

插件发版从「仅 git tag tarball」扩为**双通道**：allowlist 插件（`dsh-mcp-settings`、`dsh-provider-balance`）随 `dsh-<name>-v<semver>` tag 额外发 npm，其余插件不变。用户明确要求这两个包上 npm；token 用 fork 仓（deepseek-harness）`NPM_TOKEN` 同一枚（npm 账号 danielzhang688）。

## 为什么是 allowlist 而不是全量

- **安装面**：`dsh plugin --profile web add <args>` 原样转发 pnpm（fork `apps/cli/src/args.ts` 的 plugin 命令），registry 包天然可装——npm 通道是真实的安装面升级（裸包名替代长 git URL），不只是下载渠道。
- 但本仓插件形态不一（有的 private、有的依赖桌面壳语义），逐个放开比一刀切稳。allowlist 的**唯一事实源是 release.yml plugin job 的 npm channel gate**，AGENTS.md 只记契约。

## 实现要点

- **幂等**：publish 前 `npm view <name>@<version>`，已存在即跳过——重跑 workflow 安全（git archive 附件可重复发，npm 版本不可）。
- **顺序**：npm publish 在 GitHub Release **之前**；npm 失败即 job 失败，不出「tarball 有、npm 无」的半发布态。
- **构建**：gate 同时探测 `scripts.build`——mcp-settings 有（tsc -b + tsdown，要 harness checkout、锚、install、build，与 CI plugin job 同链），provider-balance 无（裸源码分发，pack 即完整）。pnpm 版本从**插件自己的 package.json** 读（`package_json_file`），mcp-settings 锁 pnpm 11、仓根锁 10.28，交叉会毁 lockfile。
- **包清单**：两包去 `private: true`，补 `repository`（指回 monorepo + directory）、`license`、`keywords`、`files`（provider-balance 显式收 `src`/`client`/`cordis*.yml`/README，防止 pack 卷入无关文件）。npm 无 scope 包默认私有，publish 显式 `--access public`。
- **secret 迁移**：GitHub secrets 按仓隔离不可读，token 经 fork 仓临时 workflow → artifact → libsodium sealed box → PUT 到本仓 `NPM_TOKEN`（一次性，分支与 run 随后删除，本机临时文件清理）。

## 已知边界

- **`dsh-provider-balance` 包名归属**：npm 上同名包由 CalvinQin（subtree 迁入前的原作者）注册，仅其本人有写权限（`{"calvinqin":"write"}`），danielzhang688 publish 会 403。属预期 fail loud；正解是 CalvinQin 侧 `npm owner add danielzhang688 dsh-provider-balance`（或转移包），补齐后重跑 tag 的 workflow 即可，无需改代码。首次发版版本线 0.4.2 > 其 0.2.0，无冲突。
- mcp-settings 的 `exports` types 字段指 `./src/*.ts`（源码即类型），npm 消费方 tsx 场景与 runtime 契约一致；纯 tsc 消费需要 allowArbitrary? 不——`./src/*` 子路径导出已兜底。
- provider-balance 主入口是 `.ts`（`main: ./src/index.ts`）：DSH runtime 带 tsx（bundled runtime 同样 `--import tsx/esm`，AGENTS.md「打包」节），这是 DSH 插件生态的既定形态，非缺陷。
