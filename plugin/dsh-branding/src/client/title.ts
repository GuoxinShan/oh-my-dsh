/**
 * Document-title rebranding. The browser title is owned by ui-renderer's
 * DocumentTitle projection, whose product title is a build-time constant
 * ("DSH Local Build" unless DSH_CLIENT_TITLE was set at build time) with no
 * slot seam to occupy. Rather than patching the shell, the installer
 * rewrites every occurrence of the build title as it lands: once
 * immediately, and on every later title write (session switches project
 * "<session> — <product>", unmount restores "<product>"). Rewriting is
 * idempotent — a rewritten title no longer contains the source string, so
 * the observer settles instead of looping.
 */

/**
 * Replace every occurrence of `from` with `to` — literal strings, no regex.
 * @param raw - current title text.
 * @param from - source brand text to replace.
 * @param to - replacement brand text.
 * @returns the rewritten title, or `raw` unchanged when there is nothing to do.
 */
export function rebrandTitle(raw: string, from: string, to: string): string {
  if (from === '' || from === to || !raw.includes(from)) return raw
  return raw.split(from).join(to)
}

/**
 * Install the title rewriter on a document: rewrite now, then observe the
 * title element so future writes (any owner) get the same treatment.
 * @param doc - the document whose title is rebranded.
 * @param from - source brand text to replace.
 * @param to - replacement brand text.
 * @returns the disposer: stops observing and restores any branded text.
 */
export function installTitleRebrand(doc: Document, from: string, to: string): () => void {
  const el = doc.querySelector('title')
  const view = doc.defaultView
  if (el === null || view === null) return () => {}
  const rewrite = (): void => {
    const current = el.textContent ?? ''
    const next = rebrandTitle(current, from, to)
    if (next !== current) el.textContent = next
  }
  rewrite()
  const observer = new view.MutationObserver(rewrite)
  observer.observe(el, { childList: true, characterData: true, subtree: true })
  return () => {
    observer.disconnect()
    const current = el.textContent ?? ''
    const restored = rebrandTitle(current, to, from)
    if (restored !== current) el.textContent = restored
  }
}
