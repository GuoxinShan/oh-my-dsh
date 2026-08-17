/**
 * Companion invariant: the bridge registers nothing host-side, so this
 * package owns no host runtime invariant to assert. The browser half's
 * contracts (gate signal shape, IPC command table, notification edges) are
 * pinned in the repository AGENTS.md "插件契约" section, which both the Rust
 * shell and the client half implement against.
 */
