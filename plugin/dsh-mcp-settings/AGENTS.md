# Repository guidance

This repository is one installable DSH bundle with three Cordis entries: `./manager`, `./inventory`, and the root dual-face Web UI plugin. Keep `cordis.patch.yml`, `package.json` exports, the Typert descriptors, and README installation commands synchronized.

A sibling `../deepseek-harness` checkout is the source of framework types and test fixtures. Run `pnpm run typecheck`, `pnpm test`, and `pnpm run bundle` after behavior changes. The consumer-side `prepare` build must remain self-contained and must not require that sibling checkout.

Never commit MCP credentials, user settings, `lib/`, `node_modules/`, or coverage output.
