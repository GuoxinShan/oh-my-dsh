/**
 * Section stylesheet for the image-input page, injected once per document
 * (the dsh-desktop-bridge `railCss()` shape: a CSS string + one <style> tag).
 * Only `--dsw-*` semantic tokens; class names carry an `mii-` prefix so they
 * cannot collide with other plugins' styles.
 *
 * @module dsh-model-image-input/styles
 */

/** The section stylesheet. */
export const SECTION_CSS = `
.mii-section { display: flex; flex-direction: column; gap: 12px; max-width: 720px; }
.mii-heading { margin: 0; color: var(--dsw-alias-label-primary); font-size: 16px; line-height: 24px; font-weight: 600; }
.mii-intro { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.mii-empty {
  margin: 4px 0 0; padding: 12px;
  border: 1px dashed var(--dsw-alias-border-l3); border-radius: 8px;
  color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; text-align: center;
}
.mii-route {
  display: flex; flex-direction: column; gap: 8px; padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.mii-route-head { display: flex; align-items: baseline; gap: 8px; margin: 0; }
.mii-route-name { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px; font-weight: 600; }
.mii-route-id { color: var(--dsw-alias-label-dimmed); font-size: 12px; line-height: 18px; }
.mii-rows { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.mii-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mii-row-label {
  overflow: hidden; color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 20px; text-overflow: ellipsis; white-space: nowrap;
}
.mii-select {
  flex: none; width: auto; min-width: 168px; height: 28px; padding: 0 28px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  background-color: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; line-height: 20px;
  cursor: pointer; appearance: none;
  /* Data-URI SVGs cannot resolve CSS variables; #81858C is the caption gray shared by both themes. */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; background-size: 12px 12px;
}
.mii-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.mii-select:disabled { opacity: 0.6; cursor: default; }
.mii-footer { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.mii-hint { margin: 0; color: var(--dsw-alias-label-dimmed); font-size: 12px; line-height: 18px; }
.mii-actions { display: flex; align-items: center; gap: 10px; }
/* Mirrors the ui-primitives Button atom's compact primary variant (h28,
   font 12/18, pad 10, r14) so the page needs no runtime atom import — the
   client half stays free of @deepseek-ai/* value imports and importable
   under node:test. */
.mii-save {
  display: inline-flex; align-items: center; justify-content: center;
  height: 28px; padding: 0 10px; border: none; border-radius: 14px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  font: inherit; font-size: 12px; line-height: 18px;
  cursor: pointer;
}
.mii-save:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.mii-save:disabled { cursor: not-allowed; opacity: 0.4; }
.mii-saved { color: var(--dsw-alias-state-success-primary); font-size: 12px; line-height: 18px; }
.mii-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }
`

/**
 * Inject the stylesheet once and return its removal. Repeated calls within
 * one document are idempotent (the tag carries a data attribute), so an HMR
 * remount never stacks duplicates.
 * @returns the disposer removing the tag.
 */
export function injectStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector('style[data-plugin-css="dsh-model-image-input"]')
  if (existing !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-model-image-input'
  tag.dataset.pluginCss = 'dsh-model-image-input'
  tag.textContent = SECTION_CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

/** Class-name constants shared by the section component. */
export const css = {
  section: 'mii-section',
  heading: 'mii-heading',
  intro: 'mii-intro',
  empty: 'mii-empty',
  route: 'mii-route',
  routeHead: 'mii-route-head',
  routeName: 'mii-route-name',
  routeId: 'mii-route-id',
  rows: 'mii-rows',
  row: 'mii-row',
  rowLabel: 'mii-row-label',
  select: 'mii-select',
  footer: 'mii-footer',
  hint: 'mii-hint',
  actions: 'mii-actions',
  save: 'mii-save',
  saved: 'mii-saved',
  error: 'mii-error',
} as const
