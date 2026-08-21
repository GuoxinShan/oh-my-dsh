/**
 * Branding plugin, host half. Pure surface entry: the empty apply exists so
 * the cordis row is valid and the package appears in the host Loader; the
 * browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration. Branding has no host-side behavior —
 * no config, no services, no IPC.
 */

/** Host plugin body — no host-side behavior for this branding surface. */
export function apply(): void {}
