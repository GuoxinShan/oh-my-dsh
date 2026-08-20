# 2026-08-20 · zw.4 发布包双症状：pnpm 11 静默忽略 package.json overrides，全树官方副本混装

## 症状（发布包 / runtime v0.1.0-rc.8+zw.4）

1. 通用设置的 web_search 开关报 `webSearchToggle/get failed: transport failure for /api/webSearchToggle/get: HTTP 404`。
2. 会话内调 bash 工具，回合直接失败：`Cannot read properties of undefined (reading 'prepare')`（UNKNOWN）。

「dev 正常、发布包坏」是幸存者偏差：**09:35 重组装的 dev 构建树同样带病**（`runtime/build/1de422d` 与发布解压树逐目录一致），只是 dev 桌面没打开过通用设置、没跑过 bash 回合。

## 根因（三层递进，最后一层是真凶）

1. **真凶：pnpm 11 删除了 package.json `pnpm.overrides` 字段支持**（pnpm 10 迁移到 pnpm-workspace.yaml、10 仍兼容读取，11 移除）。runtime manifest 的 overrides 一直写在 package.json 里；本地默认 pnpm 升到 11.7.0 后（mcp-settings 需要 pnpm 11），组装 install 在 11.7.0 下运行，**整个 overrides 表被静默忽略**——所有 `^0.1.0-rc.8` 普通依赖边全部解析到官方 registry 构建。树上 186 个 `@deepseek-ai/*` 实例是官方副本，fork tarball 只有 crazx 名下的 10 个（它们靠**直接依赖**保护，与 overrides 无关——所以历次扫描没炸）。
2. **扫描盲区**：fail-loud 扫描的 `offBaseline` 桶按「registry 版本 === fork manifest 版本」放行——上游恰好发布了同版本 rc.8，官方副本版本号完全相等，扫描天然看不见。同版本 ≠ 同构建 ≠ 同模块实例。
3. **双模块实例的杀伤机理**（ cordis 服务用 unique symbol 跨 fiber 相认，模块实例分裂即注册表分裂）：
   - bash 报错 = `packages/core/agent-loop/src/tool-calls.ts` 的 `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(...)`；`TOOL_RUNTIME_SCHEDULER` 是各 `dsh-tools` 模块实例自己的 `Symbol()`，查表得 undefined → 在 undefined 上读 `prepare`（与 rc.5 混装案同签名）。
   - 404 = api-gateway 双实例（dsh-base 边走 tarball 副本、api-remotes 边走 registry 副本）。`/api/<ns>/<method>` 由 typertGateway 的 `/api` interceptor 认领；示踪（对解压树副本打点）显示 `claimsEndpoint` 根本没被调用——interceptor 没挂上，请求落到 apiproxy 的静态 UNARY_ROUTES 表 → 404。client bundle 照常 200（webserver 只按路径发文件），所以设置行 UI 在、远端调用死。

### 复现与对照（scratch home，勿污染真实 `~/.dsh`）

同一插件、同 sha 的三个 runtime 打 `/api/webSearchToggle/get`：源码 checkout **200**；`runtime/build/1de422d`（dev）**404**；`~/.dsh-desktop/runtime/1de422d`（发布解压树）**404**。

## 修（scripts/prepare-runtime.mjs，SCRIPT_REV 5→6）

1. **overrides 搬进 pnpm-workspace.yaml**（pnpm 10/11 双兼容形态），package.json 不再带 `pnpm` 字段。tarball spec 统一**相对路径**（`file:../../../tarballs/<sha>/...`），依赖边、锁文件、allowBuilds 键三处一致。
2. **全部打包 tarball 进直接依赖**：overrides 只管普通边——host 包的 seam 多为 peerDependencies（dsh-workflow-worker-thread peer 于 dsh-tools/dsh-session/dsh-agent），file:/alias overrides 都够不着 peer 边。直接依赖给 peer 解析提供 root 级 tarball 实例。
3. **`autoInstallPeers: false`**：peer 只从祖先解析，杜绝「未决 peer 按 range 从 registry 自动装」这条旁路。
4. **`packageManager: pnpm@10.28.0`** 钉进 runtime package.json：pnpm shim 按 cwd 最近 pin 选版本，组装不再随 shell 默认 pnpm 漂移。
5. **allowBuilds 对 buildable tarball 直依赖显式表态**：pnpm 在 CI 下对未决 build 硬错误（`ERR_PNPM_IGNORED_BUILDS`），且 file: 依赖的键必须用全限定 `name@file:...` 形态（裸名只匹配 registry 依赖）。打包循环从 manifest scripts 检测 install 钩子，只有 `dsh-subprocess-local`（spawn helper）放行 true，其余（dsh-root 的 husky 等）false。
6. **`minimumReleaseAge: 0`**：本组装输入全是 fork tarball + 钉版 registry 依赖，关掉本地供应链 age 守卫，免得 pnpm 自动往生成的 yaml 里追加 exclude 名单。
7. **扫描补第三桶 `duplicated`**：同一 `@deepseek-ai/*` 包在 `.pnpm` 里同时存在 `file+` 实例与 registry-semver 实例即中止（**不看版本号**——同版本混装正是本案）；pack-skip 原生包（landlock/schemastery）registry-only 单例仍合法。

## 遗留：webSearchToggle 404 在「干净树」上仍复现（第二根因，独立于混装）——已修（插件侧，0.1.1）

组装修复后（232 tarball 实例 / 0 registry 副本 / 0 双实例），`/api/webSearchToggle/get` 在装配 runtime 上**仍是 404**，而源码 runtime 是 200。示踪（对单实例 gateway 打点）定案：

- `claims(webSearchToggle/get): local=false`；`collectSrcClaims` 里 `receiver=object`、`binding={ns:"webSearchToggle"}` 都可见，**唯独 `remoteMethods(original) = []`**。
- 机理：`@Remote` 装饰器把方法 markers 写进 **typert-protocol 模块实例自己的模块级 WeakMap**。插件 gateway.js 的 `@deepseek-ai/dsh-typert-protocol` 按 Node 上溯解析命中**插件自带 node_modules 的 rc.7 副本**，而 runtime gateway 用的是树内 rc.8 实例——不同模块实例的 WeakMap 互不可见。binding 字段挂在实例对象上所以跨实例可见（这是 src-claims 设计的用意），但方法枚举不行。
- 源码上为何 200：checkout 跑 tsx **4.22**，其 resolver 把插件文件的 bare specifier 统一解析到运行项目（checkout）的 node_modules——单一模块世界。runtime 是 tsx **4.23**，bare specifier 走纯 Node 上溯（AGENTS「tsx 4.23+ 只对 tsconfig include 内文件生效」笔记的另一面）。
- 属 AGENTS「已知残留（插件自带 `@deepseek-ai/*` 模块副本）」同类：**link:/git 安装的插件自带 `@deepseek-ai/*` 模块副本，模块级注册表（unique symbol / WeakMap）跨实例分裂**。本例是 WeakMap（markers）；rc.5 案是 unique symbol。字符串键服务注册（`ctx.get('webSearchToggle')`）不受影响，所以插件行能挂载、binding 能读到，症状更隐蔽。插件侧把 devDeps 升 rc.8 **不能**修——不同物理路径仍是不同模块实例。

**修（0.1.1，插件侧；实测装配 runtime get/set 全 200、set 真实写 patch 层、源码 runtime 无回归）**：Host 主行 apply 里把**浏览器端已在用的 `TYPERT_REMOTE.descriptors`**（带 strict zod codec 的完整 `InvocationDescriptor`）经 `ctx.typert.register()` 注册成 Host strict contribution（`src/typert.host.ts` 单一事实源复用 client descriptors）。strict 路径直接命中 `typert.local`——路由认领与分发都不再走 marker 发现，跨实例问题整个绕开。关键合规点：registry 的 `validateCodec` 是 **duck check**（只验 `schema.parse` 是函数，不验 zod 实例身份），插件自带 zod 副本构建的 schema 能过 runtime registry 校验。配套细节：

- `inject = ['typert']`（字符串键，跨实例安全）等 registry 就绪；`ctx.get('typert')` 拿 runtime 实例，结构化形状（`{ register }`），不 import runtime 侧类型的运行时值。
- apply 返回 disposer：registry 的 `register()` 内部 effect 绑在 registry 自己的 ctx 上，**调用方必须持有 disposer 并随 fiber 卸载回收**，否则插件卸载后 descriptors 残留。
- host bundle 内联 zod（tsdown `deps.onlyBundle: ['zod']`）：git 安装形态消费者没有 devDeps；duck check 下内联副本合法。
- `files` 用 `lib/*.js` glob：tsdown chunk 带内容 hash（`typert.remote-client-DSHTvq5p.js`），逐一列举必漏。

**fork 侧要不要修**：本插件已不需要；但任何未来 out-of-tree Remote 插件仍会踩同一坑。正解方向（harness PR）：`bindTypertRemote()` 让 binding 携带「从声明它的模块实例读取 markers」的闭包——binding 对象跨实例可见，gateway 改读 `binding.methods()` 而非自己模块的 WeakMap；旧装饰器的数据封死在旧模块 WeakMap 里，无法单边兼容，升级协议后插件同步重发。次选：把本插件的修法上升为官方文档模式（「out-of-tree Remote 插件应自带 strict host contribution 注册」）。

## 教训

- **pnpm 大版本升级会静默改变 manifest 语义**：overrides 失效不报错、不警告，唯一症状是树上多了「版本号完全相同」的第二构建。凡「版本相等即放行」的扫描对此天然失明——**按实例来源（file+/registry/alias）分桶，不按版本号**。
- 组装脚本应钉 `packageManager`，与被组装树共存亡；否则 shell 里随手 `pnpm` 一次升级就改变下一次组装的语义。
- 双模块实例的 canary 探针：开关插件的 `/api/webSearchToggle/get`——unique-symbol 注册表一分裂它先死（404），比「跑一个 bash 回合」便宜。

## 验证口径

```sh
node scripts/prepare-runtime.mjs        # 重组装 + 三桶扫描
# 树内不得有双实例（file+ 与 registry 并存）
# scratch home 功能对照：
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:<port>/api/webSearchToggle/get \
  -H 'content-type: application/json' -d '{}'    # 期望 200（bad-request envelope 也证明路由在）
```

发布链收尾：重组装后 `pnpm desktop:build` 重出 resources；删 `~/.dsh-desktop/runtime/<sha>` 强制重解压（`.ok` 不感知同 sha 重组装）。e2e 矩阵加「typert 远端路由探针」（上述 canary）。

## 顺带：cordis-exa preset

发布包日志刷屏的 `Host Cordis inspect provider "Service" is already registered` 来自已删除的 `~/.dsh/.agent-presets/cordis-exa`——它把 tool-cordis 等行 link 到 workspace checkout，与 runtime 副本撞注册表。preset 与插件同纪律：**不得 link: 到 checkout**。
