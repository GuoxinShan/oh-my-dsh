/**
 * Companion invariant: the bridge row registers nothing host-side, and the
 * log-sink row's only effect is appending to files outside the process — it
 * owns no in-process state another package can observe, so neither row has a
 * host runtime invariant to assert here. The browser half's contracts (gate
 * signal shape, IPC command table, notification edges) are pinned in the
 * repository AGENTS.md "插件契约" section, which both the Rust shell and the
 * client half implement against.
 */
