# 2026-09-02 · dsh-thread 纳入 desktop-owned 分发集合（七包 → 八包）

## 背景与决定

Thread 交接（`plugin/dsh-thread`，0.2.0-rc.2）从"按需 `plugin add`"升级为**桌面安装包自带**：壳首启/运行面切换的八包事务会把它幂等装进 web Profile。理由：Thread 是会话连续性的基础能力（与 bridge 同级），不该要求用户手动发现安装。

## 改动面（同一变更，四处联动）

1. **`src/constants.ts`**：新增 `THREAD_PACKAGE` 与 `THREAD_RUNTIME_PEERS`——后者是 dsh-thread host bundle 的 8 个外部 harness 值导入（cordis / schemastery / dsh-llm / dsh-session / dsh-settings / dsh-storage-domain / dsh-tools / dsh-typert-protocol）。cordis 与 typert-protocol 是模块身份承重（Service 注册表 / @Remote markers 分裂案，见 `docs/notes/2026-08-20-pnpm11-overrides-ignored.md`）。
2. **`src/plugins.ts`**：`findDesktopPlugins()` 追加第 8 项（env `DSH_DESKTOP_THREAD_PLUGIN` → `thread.tar.gz` → dev 兜底 `plugin/dsh-thread`）；`ensurePluginRuntimeLinks` 的 peer 映射接上 `THREAD_RUNTIME_PEERS`。
3. **`scripts/prepare-desktop-bundle.mjs`**：版本钉 `0.2.0-rc.2`（不吻合即 fail loud）、verify 模式逐包 typecheck/test/build 循环、`desktopPluginDirs` 构建循环、打 `src/resources/thread.tar.gz`（package.json + cordis.patch.yml + README.md + lib）、revision manifest 记 `threadVersion` / `threadTarball`。
4. **`src/surface-switch.ts`**：确认框文案由「bridge 等六个包」改为「bridge 等插件包」——该计数已是第二次滞后（七包时代就没跟上），去掉数字永不再错。
5. **`AGENTS.md`**：desktop-owned 集合七包 → 八包的全部表述（roster 集合枚举、发版时机、运行面切换、打包段）+ dsh-thread 条目。

## 发版

- dsh-thread 插件 tag `dsh-thread-v0.2.0-rc.2` 已先行发布（独立节奏）；纳入 desktop-owned 不改变其独立 tag 通道。
- 桌面版本 bump `0.3.0-rc.21 → 0.3.0-rc.22` + 新 `v*` tag，发版流水线把 thread.tar.gz 带入安装包；既有用户热更后由首启事务幂等补装。

## 回滚

从 `findDesktopPlugins` 去掉 thread 项并发新桌面版即可；已装入 profile 的 dsh-thread 由用户侧 settings 开关（`dsh-thread.enabled`）或 `dsh plugin remove` 卸载，壳不再触碰。

## 追加：v0.3.0-rc.22 发版失败复盘

首个 rc.22 流水线失败：Windows 构建报 `'tsdown' is not recognized`——`.github/workflows/release.yml` 的 `Prepare desktop plugin deps` 步骤里按包 install 清单漏了 dsh-thread，CI 上该包 devDeps 从未安装。**这是「新增桌面依赖插件」除 prepare / 壳安装链 / AGENTS.md 清单外的第四个联动点：release workflow 的逐包 install 清单**（macOS/Windows 两处对称）。已在 rc.23 补上。
