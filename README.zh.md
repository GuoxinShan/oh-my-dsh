# dsh-mcp-settings

[English](README.md) | 中文

这是一个可安装的 DeepSeek Harness bundle，包含通过 Web 设置管理 MCP 服务器的三个插件。

| Cordis 行 | 入口 | 职责 |
|---|---|---|
| `dsh-mcp-settings-manager` | `dsh-mcp-settings/manager` | 拥有 `mcp.servers`，为每个已启用服务器启动或停止内置 MCP client fiber，并发布合并后的连接状态。 |
| `dsh-mcp-settings-inventory` | `dsh-mcp-settings/inventory` | 提供只读 `mcpInventory/list` Remote。 |
| `dsh-mcp-settings-ui` | `dsh-mcp-settings` + `./client` | 提供 MCP 设置页、表单/JSON 编辑、启停开关、状态轮询和工具数量。 |

bundle 会停用当前 Web profile 中等价的三个内置行，再以独立 id 插入这些行。移除 bundle 后，下次启动 profile 时内置行会恢复。已有 `mcp.servers` 用户设置不会被删除。

## 环境要求

- 带 `web` profile 且包含当前 MCP 设置/Remote 扩展点的 DeepSeek Harness。
- Node.js `^22.19.0 || >=24`。
- 从 GitHub 直接安装时使用 pnpm 10 或更高版本。

## 从 GitHub 安装

DSH 插件通过 bundle 分发。`dsh plugin add` 会把包安装进 profile，并把它的 `dsh.bundle` 层加入 profile manifest；不需要额外的启用脚本。

```sh
dsh plugin --profile web add github:aka-danielZhang/dsh-mcp-settings
```

Git 安装会运行仓库的 `prepare` 脚本生成 `lib/`。pnpm 默认阻止依赖构建脚本；如果第一次安装提示 build 被忽略，请把提示中的准确包名加入 `~/.dsh/profiles/web/pnpm-workspace.yaml`，然后重试：

```yaml
allowBuilds:
  "dsh-mcp-settings@https://codeload.github.com/aka-danielZhang/dsh-mcp-settings/tar.gz/<commit-sha>": true
```

这项授权允许安装期间执行包代码。安装不受你控制的源码时应锁定 commit：

```sh
dsh plugin --profile web add github:aka-danielZhang/dsh-mcp-settings#<commit-sha>
```

安装后重启 `dsh --profile web`，打开“设置 > MCP”；原有 `mcp.servers` 列表会继续使用。

检查组合结果：

```sh
dsh --profile web --dump-config
```

输出应包含 `dsh-mcp-settings-manager`、`dsh-mcp-settings-inventory` 和 `dsh-mcp-settings-ui`。

## 安装本地 checkout

```sh
git clone https://github.com/aka-danielZhang/dsh-mcp-settings.git
cd dsh-mcp-settings
dsh plugin --profile web add file:.
```

全局安装了 `dsh` 时，也可以使用这些可选快捷脚本：

```sh
pnpm run plugin:add
pnpm run plugin:dump
pnpm run plugin:remove
```

DSH CLI 是权威安装路径；这些脚本不会直接修改 profile 文件。

## 配置 MCP 服务器

使用“设置 > MCP”。manager 读取与内置实现相同的 `mcp.servers` 设置命名空间。凭据应保存在用户设置或环境变量中，不能提交到本仓库。

UI 支持 stdio 与 Streamable HTTP、表单与 JSON 编辑、直接启停以及实时状态/工具数量。保存已启用服务器后立即查询一次，随后每两秒查询，直到连接成功或经过 60 秒。

## 移除

```sh
dsh plugin --profile web remove dsh-mcp-settings
```

重启 Web profile。该 bundle 层消失后，随 DSH 发布的 MCP 行重新生效，用户设置保持不变。

## 开发

类型检查和测试遵循 DSH 仓库外插件约定：在相邻目录 `../deepseek-harness` 保留一个 Harness checkout。

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git ../deepseek-harness
cd ../deepseek-harness && pnpm install
cd ../dsh-mcp-settings
pnpm install
pnpm run typecheck
pnpm test
pnpm run bundle
pnpm run smoke
```

`prepare` 使用自包含的 `tsdown.config.ts` 与 `tsconfig.prepare.json`，因此 GitHub 安装方不需要相邻 Harness checkout；类型检查与测试需要它。

GitHub CI 会在没有 Harness checkout 的情况下验证消费端安装、bundle、JavaScript 语法和打包产物。完整类型检查与测试会针对匹配的相邻 Harness 开发树运行，因为依赖的 `mcp-client/status` 事件尚未进入公开 Harness 默认分支。

## 兼容性

该 bundle 替换当前 DeepSeek Harness RC 版本线提供的扩展点，并复用内置 `@deepseek-ai/dsh-mcp-client`。DSH 仍处于预发布阶段；这些扩展点变化时，需要一起更新 peer 范围、Typert descriptor 和 bundle patch。

## 来源与许可

实现迁移自 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中 MIT 许可的 MCP manager、MCP inventory 和 MCP Settings 包。详见 [LICENSE](LICENSE)。
