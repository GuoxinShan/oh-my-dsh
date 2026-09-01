/**
 * Stylesheet for the settings-card row injection, injected once per document.
 * The popup is intentionally narrow and grows left from the row button; its
 * actual height decides whether it opens above or below (see inject.ts).
 * Only `--dsw-*` semantic tokens; `mii-` class names prevent collisions.
 */

/** Compact popup width that fits the desktop settings panel. */
export const POP_WIDTH = 196

/** The injection stylesheet. */
export const SECTION_CSS = [
  '.mii-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }',
  '.mii-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
  '.mii-btn[data-on="1"] { color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-interactive-bg-hover); }',
  // The stock model row is a fixed 4-column grid; every injected button is an
  // extra child no hardcoded column count can foresee (this plugin and the
  // efforts editor decorate the same row). Flex fits any button count: inputs
  // keep the stock 1.4:1 share of the leftover width and shrink first, so the
  // trailing buttons never overflow the card and the trash never wraps onto
  // an implicit second grid row.
  '.mii-grid { display: flex !important; align-items: center; gap: 6px; }',
  '.mii-grid > input { flex: 1 1 0; min-width: 0; }',
  '.mii-grid > input:first-child { flex-grow: 1.4; }',
  '.mii-pop { position: fixed; z-index: 1000; box-sizing: border-box; width: ' + String(POP_WIDTH) + 'px; max-width: calc(100vw - 16px); padding: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-shadow-lv3); }',
  '.mii-pop-head { display: flex; flex-direction: column; gap: 1px; padding: 5px 7px 6px; }',
  '.mii-pop-title { overflow: hidden; color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 16px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }',
  '.mii-pop-sub { overflow: hidden; color: var(--dsw-alias-label-dimmed); font-size: 10px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }',
  '.mii-pop-item { display: flex; align-items: center; gap: 7px; width: 100%; padding: 5px 7px; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 16px; text-align: left; white-space: nowrap; cursor: pointer; }',
  '.mii-pop-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }',
  '.mii-pop-item:disabled { opacity: 0.5; cursor: default; }',
  '.mii-pop-check { flex: none; width: 13px; height: 13px; color: var(--dsw-alias-brand-primary); }',
  '.mii-pop-check[data-off="1"] { visibility: hidden; }',
  '.mii-pop-note { margin: 0; padding: 5px 7px; color: var(--dsw-alias-label-dimmed); font-size: 10px; line-height: 14px; }',
  '.mii-pop-error { margin: 0; padding: 5px 7px; color: var(--dsw-alias-state-error-primary); font-size: 10px; line-height: 14px; }',
].join('\n')

/** Inject once and return the disposer. */
export function injectStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector('style[data-plugin-css="dsh-model-image-input"]')
  if (existing !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-model-image-input'
  tag.dataset.pluginCss = 'dsh-model-image-input'
  tag.textContent = SECTION_CSS
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}
