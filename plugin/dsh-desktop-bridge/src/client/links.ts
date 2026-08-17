/**
 * External-link classification: the pure decision behind the capture-phase
 * click listener. Everything here is DOM-data-in / decision-out; no DOM or
 * IPC side effects live in this module.
 */

/** Decision for one clicked anchor. */
export type LinkDecision =
  | { action: 'route'; url: string }
  | { action: 'pass' }
  | { action: 'ignore' }

/**
 * Classify one anchor element click against the desktop routing policy.
 *
 * Route to the OS browser (shell `dsh_desktop_open_external`): anchors with
 * `target=_blank`, cross-origin http(s) anchors, and mailto:/tel: schemes.
 * Pass through untouched: same-origin http(s) anchors without target (SPA
 * internal navigation), pure-fragment hrefs, and javascript: (app-owned
 * handler flows). Ignore entirely: blob:/data: and other non-navigational
 * schemes the webview must never hand to the OS.
 *
 * @param anchor - the clicked element (tests pass stubs satisfying the subset read here).
 * @param origin - the current page origin (location.origin).
 * @returns the routing decision for the click site.
 */
export function classifyAnchor(
  anchor: Pick<HTMLAnchorElement, 'href' | 'target' | 'getAttribute'>,
  origin: string,
): LinkDecision {
  const raw = anchor.getAttribute('href')
  if (raw === null || raw === '') return { action: 'pass' }
  if (raw.startsWith('#')) return { action: 'pass' }
  if (anchor.target === '_blank') {
    // A _blank anchor with a javascript:/blob:/data: URL would not navigate a
    // browser either; hand only real web/mail schemes to the OS.
    return webScheme(anchor.href) ? { action: 'route', url: anchor.href } : { action: 'ignore' }
  }
  const scheme = raw.split(':')[0]?.toLowerCase() ?? ''
  if (scheme === 'mailto' || scheme === 'tel') return { action: 'route', url: anchor.href }
  if (scheme === 'javascript') return { action: 'pass' }
  if (scheme === 'blob' || scheme === 'data') return { action: 'ignore' }
  if (webScheme(anchor.href)) {
    // Absolute http(s): same-origin stays in the SPA; anything else leaves.
    try {
      return new URL(anchor.href).origin === origin ? { action: 'pass' } : { action: 'route', url: anchor.href }
    } catch {
      // Unparseable absolute href: no navigable target, do nothing.
      return { action: 'ignore' }
    }
  }
  // Relative href without target = internal SPA navigation.
  return { action: 'pass' }
}

/** Whether the resolved href carries an OS-browser-navigable scheme. */
function webScheme(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')
}
