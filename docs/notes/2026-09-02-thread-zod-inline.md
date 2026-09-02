# dsh-thread host bundle 内联 zod（rc.25 修复 rc.23/rc.24 无法启动）

日期：2026-09-02
关联版本：`dsh-thread` 0.2.0-rc.3 / 桌面 0.3.0-rc.25
背景决策：`2026-09-02-thread-desktop-owned.md`（thread 进 desktop-owned 八包）

## 症状

装上 0.3.0-rc.23 / rc.24 后桌面无法启动：sidecar 在打出 `dsh web` launch URL 前 exit 1，
`~/.dsh/logs/desktop-<时间戳>.log` 里是 loader 双 entry 失败：

```
Error: failed to import loader entry dsh-thread-gateway (dsh-thread/gateway):
Cannot find package 'zod' imported from ~/.dsh-desktop/plugins/dsh-thread/lib/thread-types.js
Error: failed to import loader entry dsh-thread (dsh-thread): …同上
```

loader entries 整组失败 → web profile boot 中止 → 窗口起不来。终端 `dsh web`（同一共享
home、同一插件注册路径）同样挂。

## 根因链

1. `plugin/dsh-thread/package.json` 把 `zod` 声明在 **`dependencies`**，host 侧 tsdown 配置
   无任何打包覆盖；tsdown 默认 externalize `dependencies` → 产物 `lib/thread-types.js`
   保留裸 `import { z } from 'zod'`。
2. 桌面安装姿态解包 `thread.tar.gz` 到 `~/.dsh-desktop/plugins/dsh-thread/` **不带
   node_modules**，只有壳的 `THREAD_RUNTIME_PEERS`（`src/constants.ts`）链 8 个
   `@deepseek-ai/*` peer——zod 不在表里（按约定本不该在，见下）。
3. loader entry 从插件原始物理路径 import，Node 解析沿目录树上溯，profile 闭包里的 zod
   不在路径上；`~/.dsh-desktop/plugins/dsh-thread/node_modules` 里只有 8 个 peer 链接 →
   `ERR_MODULE_NOT_FOUND`。

为什么此前没暴露：终端 / git tag / file: 安装姿态由 pnpm 物化插件依赖闭包，zod 一直在。
桌面 tarball 是唯一「零依赖解包 + 显式链接表」的姿态；thread 是第一个带第三方 runtime
`dependencies` 的 desktop-owned 插件，rc.23（进包）首次踩中。rc.23 的 CI 修复（release
workflow 里给 thread `pnpm install`）只解决「能不能构建」，不改变产物外置 zod 的形态。

## 为什么选内联而不是把 zod 加进 THREAD_RUNTIME_PEERS

仓内已有成文先例与理由（web-search-toggle，`docs/notes/2026-08-20-pnpm11-overrides-ignored.md`
「遗留」节 + AGENTS.md「已知残留」）：**out-of-tree 插件的 host bundle 内联 zod**——

- typert registry 的 `validateCodec` 是 duck check（只验 `schema.parse`），zod 实例身份
  不参与校验，内联副本合法；
- 内联让插件在**所有**姿态自洽（git 安装无 devDeps、桌面解包、组装 runtime），不依赖
  「runtime 树里恰好有 zod 且 `.pnpm` 版本满足 range」这种会随基线漂移的耦合
  （runtime 树顶层并不 hoist zod，只在 `.pnpm` 虚拟店）；
- 若走第 9 个 peer 链接，未来基线把 zod 移出依赖闭包时 `ensureRuntimePackageLink`
  只 warn + skip，又是一次静默 boot 全挂。

## 修法

- `package.json`：`zod` 从 `dependencies` 挪到 `devDependencies`（版本 `^4.4.3` 不变，
  锁文件仅 section 迁移）；版本 bump 0.2.0-rc.3。
- `tsdown.config.ts` host 配置加 `deps: { onlyBundle: ['zod'] }`（wst 同款注释与语义），
  zod 内联进共享 chunk `thread-types.js`（约 6 kB → 140 kB），无新增 chunk 文件。
- `scripts/prepare-desktop-bundle.mjs` 版本守卫同步 0.2.0-rc.3；桌面 bump 0.3.0-rc.25。

## 验证

- host lib 的裸 import 全集 = `THREAD_RUNTIME_PEERS` 8 包 + `node:crypto`，与链接表
  一一对应，zod 消失；
- 把 `lib/ + package.json + cordis.patch.yml` 拷进无 node_modules 的隔离目录，
  `thread-types.js` 可正常 import（桌面解包姿态的忠实模拟）；
- 包内 typecheck 干净、35/35 测试通过。

## 影响面与恢复路径

- Release 资产下载量核查（2026-09-02 下午）：rc.24 zip 1 次（作者本机自动更新）、
  DMG/NSIS 0 次、rc.23 全资产 0 次——实际中招面 ≈ 1 台。
- rc.24 期间是 latest、updater yml 正常服务：任何旧版客户端接受更新即中招，rc.25
  越早占 latest 越好。
- 中招机器 UI 起不来 → 应用内更新入口（bridge 插件 web UI）不可达，**无法自救**，
  只能手动下载 rc.25 / 打 zod 软链 / 装回 rc.22。作者本机以
  `~/.dsh-desktop/plugins/dsh-thread/node_modules/zod -> runtime 树 .pnpm/zod@4.5.4`
  软链临时解锁（rc.25 的新 threadTarball hash 会整目录重解压，软链随之消亡）。
