/**
 * Download bridge: the pure decision behind intercepting `a[download]`
 * clicks, plus the blob→base64 save pipeline. In WKWebView/WebView2 an
 * anchor-triggered blob download does not land on disk; the shell's
 * `dsh_desktop_save_file` IPC command is the real writer.
 */

/** Decision for one clicked anchor carrying a download attribute. */
export type DownloadDecision =
  | { action: 'save'; url: string; name: string }
  | { action: 'pass' }

/**
 * Classify one `a[download]` click against the desktop save policy.
 *
 * Save through the shell: same-origin http(s) hrefs and `blob:` hrefs (the
 * session-export flow) with a non-empty `download` attribute. Pass through
 * untouched: everything else (no download attribute, cross-origin http —
 * left to the external-link router, data:, javascript:, fragments).
 *
 * @param anchor - the clicked element (tests pass stubs satisfying the subset read here).
 * @param origin - the current page origin (location.origin).
 * @returns the save decision; the suggested filename never carries path components.
 */
export function classifyDownload(
  anchor: Pick<HTMLAnchorElement, 'href' | 'download' | 'getAttribute'>,
  origin: string,
): DownloadDecision {
  const download = anchor.download
  if (download === undefined || download === '') return { action: 'pass' }
  const raw = anchor.getAttribute('href')
  if (raw === null || raw === '' || raw.startsWith('#')) return { action: 'pass' }
  if (anchor.href.startsWith('blob:')) {
    return { action: 'save', url: anchor.href, name: sanitizeName(download) }
  }
  if (anchor.href.startsWith('http://') || anchor.href.startsWith('https://')) {
    try {
      if (new URL(anchor.href).origin !== origin) return { action: 'pass' }
      return { action: 'save', url: anchor.href, name: sanitizeName(download) }
    } catch {
      return { action: 'pass' }
    }
  }
  return { action: 'pass' }
}

/** Strip path components and empties from a suggested download filename. */
function sanitizeName(name: string): string {
  const base = name.split('/').pop()?.split('\\').pop() ?? ''
  return base === '' ? 'download' : base
}

/**
 * Encode bytes as base64 in chunks (btoa argument limits).
 * @param bytes - the payload.
 * @returns the base64 string (no data: prefix).
 */
export function toBase64(bytes: Uint8Array): string {
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(out)
}

/** Shell IPC carrier face the save pipeline needs. */
export interface SaveInvoke {
  /** @param cmd - registered custom command name.
   *  @param args - JSON arguments record.
   *  @returns command fulfillment value. */
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>
}

/**
 * Run one save: fetch the bytes, base64 them, hand them to the shell.
 * @param decision - the save decision to execute.
 * @param invoke - the shell IPC carrier.
 * @returns the absolute path the shell reported, or undefined when the shell rejected the save.
 */
export async function saveViaShell(
  decision: { url: string; name: string },
  invoke: SaveInvoke,
): Promise<string | undefined> {
  const response = await fetch(decision.url)
  if (!response.ok) throw new Error(`download fetch failed: ${String(response.status)}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const result = await invoke.invoke('dsh_desktop_save_file', {
    name: decision.name,
    base64: toBase64(bytes),
  })
  return typeof result === 'string' ? result : undefined
}
