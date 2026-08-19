# 2026-08-19 log-sink 符号链接竞争 + 迁入插件的 peer 解析失明

## 事故

`pnpm dsh web` 以 `EEXIST: file already exists, symlink logger-<ts>.log -> logger-latest.log` 崩溃（plugin tree failed to load）；桌面 app 同日崩溃重启循环——`~/.dsh/logs/` 里 08-18 起 67 个 `desktop-*.log` 全部只有 169 字节（boot 即死）。两件事互为放大器：桌面不停重启 = 不停制造并发 boot，去和终端抢同一个 `logger-latest.log`。

## 根因

**1. log-sink 建指针非原子（本 bug，与迁移无关）。** `createLogFile()` 先 `rmSync` 再 `symlinkSync`，两个进程并发启动时交错成 A 删、B 删、A 建、B 建 → B 撞 EEXIST。异常从 apply 抛出，被 loader 升级为整棵 plugin tree 失败 → 整个 boot 死。桌面 sidecar 与终端 `dsh web` 共用 `$DSH_HOME/logs`，这是设计内场景而非意外并发。

**2. 迁移后 mcp-settings 在桌面 runtime 下解析不了 harness 包（迁移欠账）。** 决定性实验：同一份 `lib/manager.js`，在 checkout 的 tsx 4.22.4 下 import 成功、在 runtime 的 tsx 4.23.12 下 `ERR_MODULE_NOT_FOUND`。原因是终端一直「碰巧」能跑：

- checkout `tsconfig.base.json` 的 `paths` 把 `@deepseek-ai/*` 映射到源码；tsx 4.22.4 对 `lib/*.js`（在 tsconfig `include: ["src"]` 之外）也套用该映射，所以终端 `dsh web` 从老仓、新位置都能解析。
- 桌面 runtime 的 tsx 4.23.12 不对 include 外的文件套用 paths → bare specifier 走纯 Node 上溯：新位置 node_modules 里只有 `schemastery`（peers 声明了但 `autoInstallPeers: false`，从未安装）、各级祖先目录也无 `@deepseek-ai/*` → 失败。
- 值依赖清单（构建产物 lib 中保留的值 import）：cordis、dsh-credentials、dsh-mcp-client、dsh-settings、dsh-timeout、dsh-typert-protocol（schemastery 是真依赖）。provider-balance 无 node 半值依赖（host 半刻意零 `@deepseek-ai/*` import），不受影响。

## 修复

1. **log-sink（`plugin/dsh-desktop-bridge/src/log-sink.ts`）**：指针换成原子换——`linkLatest()` 以 pid 私有名 staging `symlinkSync` 后 `renameSync` 覆盖（rename 原子替换任何非目录目标），并发 boot 各自 staging 不相交，最后 rename 者胜出；指针失败只报一次 stderr，不禁用文件 sink。`stateForProcess()` 兜住 `createLogFile()` 的一切失败：sink disabled（报一次 stderr 后自闭），与写盘失败同一契约——**日志汇永远不再有能力杀死 boot**。
2. **mcp-settings peer 物化**：六个 harness 值依赖以 devDependencies `link:../deepseek-harness/<pkg>` 声明（桥/reasoning-efforts 同款模式，锚复用根 `plugin:setup` 的 `plugin/deepseek-harness`），`pnpm install` 后包内 node_modules 可解析，不再依赖任何 tsx/tsconfig 行为。
3. **部署**：修好的 `lib/log-sink.js` 拷贝到 `~/.dsh-desktop/bridge/lib/`（部署前后 diff 确认其余 lib 文件与 repo 构建逐字节一致；`node_modules/@deepseek-ai/cordis` → runtime 软链未动）。profile 的 bridge link 指向 `~/.dsh-desktop/bridge` 是桌面部署模型的设计态（壳每次启动幂等 `plugin add` 该路径），不是迁移欠账，保持不动。

## 验证

- bridge：typecheck + 46 tests（含新增 `linkLatest` 回归测试：悬空指针被换掉、同 pid 重跑不留 staging 残骸）。
- mcp-settings：typecheck + 57 tests；runtime 自带 node 24.9.0 + tsx 4.23.12 下 import `manager/inventory/index/typert.host` 四个入口全部 OK。
- **并发 boot 复现原事故场景**（checkout `pnpm dsh web --port 3987` 与 runtime `tools/node --import tsx/esm …/dsh/lib/bin.js web --port 3988` 同时起）：双双 200；boot graph 三插件齐全；`/plugins/*/client.js` 双宿主 200；两个 logger 文件各自落盘、`logger-latest.log` 指针有效、零 EEXIST / ERR_MODULE_NOT_FOUND / AggregateError。
- 悬空 `logger-latest.log`（指向已不存在的 `logger-20260819-184405.log`）已清除。

## 边界与后续

- 桌面 runtime 下 mcp-settings 的 cordis 解析到 checkout 的 vendor 源码，与宿主的 runtime cordis 是两个模块实例（终端宿主跑 checkout 源码，天然同源单实例）。mcp-settings 对 cordis 的值用法（`Service` 基类等）不做跨实例身份检查，当前无碍；若未来出现身份敏感问题，正路是既定的打包链后续 PR（prepare 脚本对 `plugin/*` 循环打包 + 壳补 cordis 软链，同桥的部署模型），不在本次范围。
- 桌面 app 无需重装：下次启动 sidecar 即走修复后的 profile 与部署目录。
