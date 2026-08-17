/**
 * Desktop webview bridge, node half. Pure surface plugin: the empty apply
 * exists so the cordis.yml row is valid and the package appears in the host
 * Loader; the browser half ships via exports["./client"], discovered through
 * the package.json dsh.client declaration. The desktop shell it talks to
 * lives in this repository's Tauri crate (shell milestones).
 */

/** Host plugin body — no host-side behavior for this bridge surface. */
export function apply(): void {}
