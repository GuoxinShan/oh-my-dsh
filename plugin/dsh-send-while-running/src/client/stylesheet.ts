/**
 * The send-while-running stylesheet, browser half.
 *
 * The button mirrors ui-conversation's composer `.primary` circle (34px,
 * info fill, white glyph, -2px optical lift out of the row's top pad) so it
 * reads as the stock Send's twin beside the stock Stop. Positioning inside
 * the composer's trailing row uses only documented seams:
 *
 * - `[data-slot="conversation.input.right"]` — the render machinery's
 *   addressable anchor for this slot (every render site exposes it).
 * - `button:last-of-type` — the stock primary button, which is always the
 *   last direct button child of the trailing row (the model seat and the
 *   context meter render inside their own wrappers; a subagent's separate
 *   Stop never coexists with this button's visibility terms).
 *
 * `order: 1` on the button and the `:has()`-scoped `order: 2` on the stock
 * primary land the pair as [model][meter][send][stop]; in every other state
 * the `:has()` rule does not match and the shipped layout is untouched.
 * Semantic tokens only, with one deliberate exception: the glyph stays
 * static white on the info fill in both themes, matching the design-system
 * decision documented on the stock `.primary` rule this mirrors.
 * @returns the stylesheet text.
 */
export function sendWhileRunningCss(): string {
  return [
    '.dsh-send-while-running {',
    '  display: grid;',
    '  place-items: center;',
    '  flex: none;',
    '  width: 34px;',
    '  height: 34px;',
    '  border: none;',
    '  border-radius: 999px;',
    '  background: var(--dsw-alias-button-info-fill);',
    '  /* Static white, not the foreground token: mirrors the stock primary —',
    '     the arrow stays white on the blue fill in both themes. */',
    '  color: #fff;',
    '  cursor: pointer;',
    '  transition: background-color 100ms ease;',
    '  /* Opts out of the row\'s 2px downward shift, like the stock primary. */',
    '  transform: translateY(-2px);',
    '  order: 1;',
    '}',
    '.dsh-send-while-running:hover:not(:disabled) {',
    '  background: var(--dsw-alias-button-info-hover);',
    '}',
    '.dsh-send-while-running:disabled {',
    '  opacity: 0.4;',
    '  cursor: default;',
    '}',
    'div:has(> [data-slot="conversation.input.right"] .dsh-send-while-running) > button:last-of-type {',
    '  order: 2;',
    '}',
    '',
  ].join('\n')
}

/** Structural slice of a style element the installer touches (test-friendly). */
export interface InstalledStyle {
  setAttribute(name: string, value: string): void
  textContent: string | null
  remove(): void
}

/** Structural slice of Document the installer touches (test-friendly). */
export interface StylesheetHost {
  createElement(tagName: string): InstalledStyle
  head: { append(...nodes: unknown[]): void }
}

/**
 * Append the send-while-running stylesheet to a document head.
 * @param doc - the document to style (injected for tests).
 * @returns the disposer removing the style element.
 */
export function installSendWhileRunningCss(doc: StylesheetHost): () => void {
  const style = doc.createElement('style')
  style.setAttribute('data-dsh-send-while-running', '')
  style.textContent = sendWhileRunningCss()
  doc.head.append(style)
  return () => { style.remove() }
}
