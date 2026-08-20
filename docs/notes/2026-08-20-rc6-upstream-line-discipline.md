# 2026-08-20 · rc.6：上游线纪律（基线锁定）与 rc.5 混装案复盘

## rc.5 混装案（`undefined (reading 'prepare')` / credentials 404）

装机 rc.5 的 runtime 是 rc.7 骨架 + rc.8 末梢的混装树：fork CLI（rc.7.zw.2）组织 rc.7 组合，但 18 个非 fork 包的 `^0.1.0-rc.7` range 在上游发布 rc.8 后匹配到 rc.8——assemble 期间静默漂移。机理：`TOOL_RUNTIME_SCHEDULER` 等 registry key 是 **`unique symbol`，身份 = 模块实例身份**；rc.8 末梢包自带另一份 rc.8 的 `dsh-tools` 副本，其 symbol 与 rc.7 侧永不相等 → `registry[symbol] === undefined` → `.prepare` 炸。MCP "no credentials service mounted" 同理（双模块实例的 Service 注册表隔离）。源码 `dsh web` 正常恰因整树单一版本、symbol 全局唯一。

诊断要点：**装机版坏了而源码正常 → 第一件事查 runtime 树的上游线纯度**（`ls node_modules/.pnpm | grep -oE 'rc\.[0-9]+' | sort | uniq -c`）；RPC 面 404 用 curl 直接打 `/api/<method>` 区分 host 侧还是 client 侧。

## 用户决策：上游线纪律

> 不要随便拉官方包，应该协同上游依赖的版本来更新官方包。

落地为 **基线锁定**：`prepare-runtime.mjs` 把每个非 fork 的 `@deepseek-ai/*` 包 override 到 **fork 树自己 manifest 声明的版本**（按各自真实版本线：dsh 系 rc 节奏、schemastery 3.x、landlock 0.1.1），skipped natives 同样钉死。上游线的移动只经一条路径：**fork 合并 upstream → 聚焦测试 → 发新 zw 层 → desktop bump revision 重组装**——fork 有适配兼容期，绝不 `^range` 自由漂移。

fail-loud 扫描扩为两项：fork 包无官方 registry 副本 + 树内无偏离 fork manifest 的第二上游线。验证：新树 178 包全部 rc.8 单线、`session.list`/`credentials.describe` RPC 恢复、`prepare` 报错 0 次。

## 实现踩坑

- 基线 pin 不能写死 `forkBaseVersion`：vendored 线（schemastery）与原生包（landlock 0.1.1）版本节奏不同，钉错直接 `NO_MATCHING_VERSION` → 改为 pin **各包 fork manifest 的 version 字段**。
- 扫描正则 `(.+)@([^_]+)` 贪婪：`.pnpm` 目录名内嵌 peer 后缀（`pkg@ver_peer@ver`），贪婪组吞掉真实版本 → `(.+?)` 非贪婪。
- `SCRIPT_REV` 必须随组装逻辑 bump（2→3），否则 SHA 缓存继续出货旧混装树。

## 已知残留（另案）

- MCP 双 cordis：profile link: 插件在装配 runtime 下 cordis 双实例（见 AGENTS.md「已知残留」）——不阻塞本版。
- 上游 Discussion（frontend-static content-length）仍未提。

## 追加踩坑（基线锁定的三个实现坑，SCRIPT_REV 3→4→5）

1. **override 合并顺序**：`Object.assign(overrides, BASELINE_PIN)` 让裸版本 pin **覆盖**了 pack 循环的 `file:` tarball pin——裸 pin 静默从官方 registry 拉包，fork 对该包的全部修改丢失（zw.4 首组装的 dsh-web-app 即此：官方 rc.8 的 web-app 把 frontend-static peer 解析回官方无修复副本，index 复发 chunked）。**file: pin 必须赢**：`{ ...BASELINE_PIN, ...overrides }`。
2. **pnpm 无锁增量安装的静默残树**：只删 `pnpm-lock.yaml` 不删 `node_modules` 时，`pnpm install --no-frozen-lockfile` 按现存 node_modules 增量解析——新 overrides 指向 tarball 的包**保留 registry 旧副本**（半组装态：overrides 全对、树全旧）。**两个都删**。
3. **SCRIPT_REV 缓存掩盖半组装**：`.script-rev` 写在成功尾端没错，但调试中途手改 overrides 不 bump REV 的话，缓存判定仍会出货旧树。改组装逻辑必 bump。
