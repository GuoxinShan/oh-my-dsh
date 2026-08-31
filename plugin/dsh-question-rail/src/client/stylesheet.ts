/**
 * The question-rail stylesheet, browser half.
 *
 * Visual contract (iterated through ten dynamic-plugin rounds against the live
 * shell; see docs/notes/2026-08-31-dsh-question-rail.md):
 *
 * - Collapsed: a 16px-wide, borderless, backgroundless strip of evenly
 *   spaced ticks (one per question, index i at (i+0.5)/N), vertically
 *   centered on the conversation scroll body. Only hover affordance colors
 *   a tick brand-primary.
 * - Expanded (hover): the strip widens to a 300px card that mirrors the
 *   stock Menu surface (menu fill, inverted hairline, lv3 shadow, r12, 4px
 *   inset padding) with dense menu rows (34px, r10, interactive hover
 *   fill) and tertiary auxiliary text. The l2 scrollbar rebinding mirrors
 *   Menu.module.css's elevated-surface contract.
 * - `overflow: hidden` on the rail is load-bearing: without it the panel's
 *   scrollbar and scrolling rows bleed past the rounded card (regression
 *   observed in the dynamic round; `overscroll-behavior: contain` stops
 *   wheel chaining into the transcript at the list's ends).
 * - The dock anchor is a 0-height, position:relative row whose negative
 *   margins cancel the composer stack's 6px gap on both sides, so the rail
 *   adds no visible seam above the composer.
 * Semantic tokens only, with fallbacks for tokens outside Theme.listTokens.
 * @returns the stylesheet text.
 */
export function questionRailCss(): string {
  return [
    '.dsh-qr-anchor {',
    '  position: relative;',
    '  height: 0;',
    '  margin-top: -6px;',
    '  margin-bottom: -6px;',
    '  z-index: 5;',
    '}',
    '.dsh-qr-rail {',
    '  position: absolute;',
    '  width: 16px;',
    '  border-radius: 8px;',
    '  /* Clips the expanded card\'s scrollbar and scrolling rows to the rounded box. */',
    '  overflow: hidden;',
    '  background: transparent;',
    '  border: 1px solid transparent;',
    '  transition: width 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease,',
    '    left 0.15s ease, top 0.15s ease;',
    '}',
    '.dsh-qr-rail-open {',
    '  width: 300px;',
    '  border-radius: 12px;',
    '  background: var(--dsw-specific-menu, var(--dsw-alias-bg-overlay));',
    '  border-color: var(--dsw-alias-border-inverted, var(--dsw-alias-border-l1));',
    '  box-shadow: var(--dsw-shadow-lv3, 0 10px 36px rgba(0, 0, 0, 0.22));',
    '  /* Elevated-surface scrollbar rebinding, mirroring Menu.module.css. */',
    '  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2, var(--dsw-alias-bg-layer-2));',
    '  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2, var(--dsw-alias-border-l2));',
    '}',
    '.dsh-qr-track {',
    '  position: absolute;',
    '  top: 6px;',
    '  bottom: 6px;',
    '  left: 3px;',
    '  right: 3px;',
    '}',
    '.dsh-qr-rail-open .dsh-qr-track {',
    '  display: none;',
    '}',
    '.dsh-qr-tick {',
    '  position: absolute;',
    '  left: 0;',
    '  right: 0;',
    '  height: 2px;',
    '  border-radius: 1px;',
    '  background: var(--dsw-alias-label-secondary);',
    '  opacity: 0.75;',
    '  cursor: pointer;',
    '  transform: translateY(-1px);',
    '}',
    '.dsh-qr-tick:hover {',
    '  background: var(--dsw-alias-brand-primary);',
    '  opacity: 1;',
    '  height: 4px;',
    '  border-radius: 2px;',
    '  transform: translateY(-2px);',
    '}',
    '.dsh-qr-panel {',
    '  display: flex;',
    '  flex-direction: column;',
    '  height: 100%;',
    '  min-height: 0;',
    '  padding: 4px;',
    '  box-sizing: border-box;',
    '}',
    '.dsh-qr-header {',
    '  flex: none;',
    '  padding: 8px 10px 4px;',
    '  font-size: 12px;',
    '  line-height: 16px;',
    '  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));',
    '}',
    '.dsh-qr-sep {',
    '  flex: none;',
    '  height: 1px;',
    '  margin: 4px 2px;',
    '  background: var(--dsw-alias-border-l1);',
    '}',
    '.dsh-qr-list {',
    '  flex: 1;',
    '  min-height: 0;',
    '  overflow-y: auto;',
    '  /* Wheel at the list\'s ends stays in the list; never chains into the transcript. */',
    '  overscroll-behavior: contain;',
    '}',
    '.dsh-qr-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  width: 100%;',
    '  min-height: 34px;',
    '  padding: 5px 10px;',
    '  border: none;',
    '  border-radius: 10px;',
    '  background: transparent;',
    '  cursor: pointer;',
    '  font-size: 13px;',
    '  line-height: 20px;',
    '  text-align: left;',
    '  color: var(--dsw-alias-label-primary);',
    '}',
    '/* The header/separator precede the item rules below in the component; both',
    '   use the same dense-menu geometry as ui-primitives Menu.module.css. */',
    '.dsh-qr-item:hover {',
    '  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));',
    '}',
    '.dsh-qr-text {',
    '  flex: 1;',
    '  min-width: 0;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '}',
    '.dsh-qr-time {',
    '  flex: none;',
    '  font-size: 11px;',
    '  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));',
    '}',
    '@keyframes dsh-qr-flash-anim {',
    '  0% {',
    '    background-color: var(--dsw-alias-bg-layer-2);',
    '    box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary);',
    '  }',
    '  100% {',
    '    background-color: transparent;',
    '    box-shadow: none;',
    '  }',
    '}',
    '.dsh-qr-flash {',
    '  animation: dsh-qr-flash-anim 1.6s ease-out;',
    '  border-radius: 8px;',
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
 * Append the question-rail stylesheet to a document head.
 * @param doc - the document to style (injected for tests).
 * @returns the disposer removing the style element.
 */
export function installQuestionRailCss(doc: StylesheetHost): () => void {
  const style = doc.createElement('style')
  style.setAttribute('data-dsh-question-rail', '')
  style.textContent = questionRailCss()
  doc.head.append(style)
  return () => { style.remove() }
}
