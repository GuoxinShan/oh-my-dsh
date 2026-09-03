# 首次启动缺失 Web Profile 的安装修复

2026-09-03

## 事故

从未创建过 `$DSH_HOME/profiles/web` 的用户首次启动 Desktop 时，安装事务在 sidecar 启动前报错：

```text
ENOENT: no such file or directory, open '<shadow-home>/profiles/web/cordis.patch.yml'
```

触发条件不是“未安装过 Desktop”本身，而是目标 Profile 目录不存在，同时至少有一个 desktop-owned 包需要安装。已有 DSH Home 但只有 sessions、settings 或 Agent Presets、没有 Web Profile 的用户同样受影响。

## 根因

`mutateProfileExpected()` 在真实 Profile 不存在时将 `hadOriginal` 设为 false，因此不会执行 `copyProfileTree()`。安装回调随后无条件调用 `ensureProfileScaffold(shadowProfile)`；该 helper 直接写 `cordis.patch.yml` 和 `pnpm-workspace.yaml`，却没有创建 `shadowProfile` 父目录。

这发生在第一条 `dsh plugin add` 之前，所以与网络、pnpm store、插件内容和文件权限无关。异常仍由 shadow-CAS 事务捕获并回滚，真实 Profile 没有被部分覆盖；但旧版本里的“重试”会确定性地再次失败。

## 决策

由 `ensureProfileScaffold()` 自己递归创建 Profile 目录，再幂等补齐两个 scaffold 文件。目录只存在于本次唯一的 shadow home，后续仍按原事务执行插件安装、配置校验和原子提交；任何失败继续删除 shadow 和 journal。

不把目录创建下沉到通用 `mutateProfileExpected()`：该事务允许不同 mutator 自己构造或替换 Profile，scaffold 是 Desktop 安装器的责任。

## 防回归

新增安装器级测试，以完全不存在的临时 DSH Home 启动真实 `runDesktopPluginInstall()` 流程，并用最小伪 CLI 驱动 add/install/dump-config：

- 全空 Home 路径断言 `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml`、`node_modules` 和插件 realpath 全部提交，且 journal/shadow 清理完成。
- 已有 Home 但无 Web Profile 的路径断言新 Profile 成功提交，同时 home patch、settings 和 sessions 逐字节不变。
- 失败路径让 CLI 返回非零退出码，断言真实 Profile 仍不存在，journal/shadow 同样清理完成。

现有 `profile-repair` 的 missing-profile 测试由测试 helper 主动创建了 shadow Profile，只验证事务能够提交调用方构造的 Profile，无法覆盖本次安装器调用顺序，因此保留并补上更高一层的测试。
