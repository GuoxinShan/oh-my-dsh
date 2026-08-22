/**
 * The send-while-running stylesheet, browser half.
 *
 * The Send twin mirrors ui-conversation's composer `.primary` circle (34px,
 * info fill, white glyph, -2px optical lift out of the row's top pad) so it
 * reads as the stock Send's twin beside the stock Stop. Positioning and the
 * Stop recolor use only documented seams:
 *
 * - `[data-slot="conversation.input.right"]` — the render machinery's
 *   addressable anchor for this slot (every render site exposes it).
 * - `button:last-of-type` — the stock primary button, which is always the
 *   last direct button child of the trailing row (the model seat and the
 *   context meter render inside their own wrappers; a subagent's separate
 *   Stop never coexists with this button's visibility terms).
 * - `button:has(> svg > rect)` — the Stop STATE anchor: the stock primary
 *   swaps its glyph when it flips Send→Stop (arrow = <path>, stop =
 *   <rect>), so the selector matches the button exactly while it IS a
 *   Stop button. Pure CSS, no JS state mirror; it follows the stock
 *   machine for free, including the subagent's separate Stop (also a
 *   rect button in the same row).
 *
 * Rules:
 * - Ordering (`order: 1` / `:has()`-scoped `order: 2`) lands the pair as
 *   [model][meter][send][stop] and only applies while the Send twin is
 *   mounted; every other state keeps the shipped layout untouched.
 * - The Stop button is danger-red in EVERY state (user preference): it
 *   reads apart from the blue Send at a glance. Toned one shade softer
 *   than the theme error-primary fill after visual review — light theme
 *   red-500 (coral) instead of red-600, dark theme red-400; hover steps
 *   one shade lighter like the stock info button.
 * Semantic tokens only, with deliberate exceptions documented inline.
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
    // Stop = danger-red in EVERY state, anchored on the stop glyph (<rect>;
    // the send glyph is a <path> so the blue Send state never matches). The
    // selector is scoped to the composer trailing row through the slot seam.
    'div:has(> [data-slot="conversation.input.right"]) > button:has(> svg > rect) {',
    '  background: var(--dsw-static-red-500);',
    '  color: #fff;',
    '}',
    'div:has(> [data-slot="conversation.input.right"]) > button:has(> svg > rect):hover:not(:disabled) {',
    '  background: var(--dsw-static-red-400);',
    '}',
    // Dark theme: red-400 base (softer than red-500 on dark surfaces); hover
    // lightens via a brightness step instead of another token (the static red
    // scale has no shade between 400 and the near-white 100).
    'body[data-ds-dark-theme] div:has(> [data-slot="conversation.input.right"]) > button:has(> svg > rect) {',
    '  background: var(--dsw-static-red-400);',
    '}',
    'body[data-ds-dark-theme] div:has(> [data-slot="conversation.input.right"]) > button:has(> svg > rect):hover:not(:disabled) {',
    '  background: var(--dsw-static-red-500);',
    '  filter: brightness(1.08);',
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
