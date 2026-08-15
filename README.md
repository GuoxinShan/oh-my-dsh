# dsh-mcp-settings

English | [中文](README.zh.md)

An installable DeepSeek Harness bundle containing the three plugins that manage MCP servers from Web Settings.

| Cordis row | Entry | Responsibility |
|---|---|---|
| `dsh-mcp-settings-manager` | `dsh-mcp-settings/manager` | Owns `mcp.servers`, starts and stops one in-box MCP client fiber per enabled server, and publishes merged connection status. |
| `dsh-mcp-settings-inventory` | `dsh-mcp-settings/inventory` | Exposes the read-only `mcpInventory/list` Remote. |
| `dsh-mcp-settings-ui` | `dsh-mcp-settings` + `./client` | Adds the MCP Settings page, Form/JSON editing, enable toggles, status polling, and tool counts. |

The bundle inserts these rows into a compatible Web profile. The profile must not already mount another settings-driven MCP manager or MCP Settings UI. Existing `mcp.servers` user settings are not removed.

## Requirements

- A matching DeepSeek Harness development build whose `web` profile already supplies the DSH peer packages listed in `package.json`.
- That Harness build must emit the `mcp-client/status` event; this event is not yet on the public Harness default branch.
- Node.js `^22.19.0 || >=24`.
- pnpm 10 or newer when installing directly from GitHub.

## Install from GitHub

DSH plugins are distributed as bundles. `dsh plugin add` installs this package into a profile and appends its `dsh.bundle` layer to the profile manifest; no separate enable script is required.

```sh
dsh plugin --profile web add github:aka-danielZhang/dsh-mcp-settings
```

This command installs the bundle only. It does not install or upgrade the Harness-owned peer packages, so point it at a matching Web profile as described above.

Git installs run this repository's `prepare` script to create `lib/`. pnpm blocks dependency build scripts until the profile grants permission. If the first install reports an ignored build, add the exact package key it prints to `~/.dsh/profiles/web/pnpm-workspace.yaml` and repeat the command:

```yaml
allowBuilds:
  "dsh-mcp-settings@https://codeload.github.com/aka-danielZhang/dsh-mcp-settings/tar.gz/<commit-sha>": true
```

This permission allows package code to run during installation. Pin a commit when installing code you do not control:

```sh
dsh plugin --profile web add github:aka-danielZhang/dsh-mcp-settings#<commit-sha>
```

Restart `dsh --profile web` after installation. Open Settings > MCP; the existing `mcp.servers` list remains available.

Verify the composed rows:

```sh
dsh --profile web --dump-config
```

The output should contain `dsh-mcp-settings-manager`, `dsh-mcp-settings-inventory`, and `dsh-mcp-settings-ui`.

## Install a local checkout

```sh
git clone https://github.com/aka-danielZhang/dsh-mcp-settings.git
cd dsh-mcp-settings
dsh plugin --profile web add file:.
```

The package scripts are optional shortcuts when `dsh` is installed globally:

```sh
pnpm run plugin:add
pnpm run plugin:dump
pnpm run plugin:remove
```

The documented DSH CLI remains the authoritative installation path; the scripts do not edit profile files directly.

## Configure MCP servers

Use Settings > MCP. The manager reads the same `mcp.servers` settings namespace as the in-box implementation. Credentials stay in user settings or environment variables and must not be committed to this repository.

The UI supports stdio and Streamable HTTP servers, Form and JSON editing, direct enable/disable, and live status/tool counts. An enabled server is queried immediately after save and every two seconds until connected or 60 seconds elapse.

## Remove

```sh
dsh plugin --profile web remove dsh-mcp-settings
```

Restart the Web profile. The bundle rows disappear while user settings remain intact.

## Develop

The typecheck and test setup follows the DSH out-of-tree plugin convention: keep a Harness checkout in the sibling directory `../deepseek-harness`.

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

`prepare` uses the self-contained `tsdown.config.ts` and `tsconfig.prepare.json`, so a consumer installing from GitHub does not need the sibling Harness checkout. Type checking and tests do require it.

GitHub CI verifies the consumer-side install, bundle, JavaScript syntax, and packed distribution without a Harness checkout. The full typecheck and test suite intentionally runs against a matching sibling Harness development tree because the required `mcp-client/status` event has not yet landed on the public Harness default branch.

## Compatibility

This bundle replaces extension points present in the current DeepSeek Harness release-candidate line and deliberately reuses the in-box `@deepseek-ai/dsh-mcp-client`. DSH is pre-release software; update the peer ranges, Typert descriptor, and bundle patch together when those extension points change.

## Origin and license

The implementation was migrated from the MIT-licensed MCP manager, MCP inventory, and MCP Settings packages in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). See [LICENSE](LICENSE).
