/**
 * One style element for the effort editor's UI, inserted on mount and
 * removed on unmount. Everything is `.mee-` scoped; colors come only from
 * the `--dsw-*` semantic tokens so dark/light themes ride along.
 */

/** Popup width, shared with the placement math in inject. */
export const POP_WIDTH = 244

/** The injected stylesheet text. */
const CSS = `
.mee-grid { grid-template-columns: 1fr 1fr 16px 16px 16px !important; }
button.mee-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border: none; border-radius: 5px;
  background: transparent; color: var(--dsw-text-secondary, currentColor);
  cursor: pointer;
}
button.mee-btn:hover { background: var(--dsw-fill-secondary, rgba(127,127,127,.18)); color: var(--dsw-text-primary); }
button.mee-btn[data-on="1"] { color: var(--dsw-primary, #3b82f6); }
.mee-pop {
  position: fixed; z-index: 2147483000; width: ${POP_WIDTH}px;
  box-sizing: border-box; padding: 10px 12px 12px;
  background: var(--dsw-bg-elevated, #1f1f1f); color: var(--dsw-text-primary);
  border: 1px solid var(--dsw-border-subtle, rgba(127,127,127,.35));
  border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.28);
  font-size: 12px; line-height: 1.45;
}
.mee-pop-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; min-width: 0; }
.mee-pop-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mee-pop-sub { flex: 1; text-align: right; color: var(--dsw-text-secondary); font-size: 11px; }
.mee-pop-note { margin: 4px 0 0; color: var(--dsw-text-secondary); }
.mee-modes { display: flex; gap: 4px; margin-bottom: 6px; }
.mee-modes button {
  flex: 1; padding: 4px 2px; font-size: 11px; cursor: pointer;
  border-radius: 6px; border: 1px solid var(--dsw-border-subtle);
  background: transparent; color: var(--dsw-text-secondary);
}
.mee-modes button[data-on="1"] {
  background: var(--dsw-fill-secondary, rgba(127,127,127,.18));
  color: var(--dsw-text-primary); font-weight: 600;
}
.mee-levels { max-height: 196px; overflow-y: auto; margin: 2px 0 6px; }
.mee-level { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.mee-level label { display: flex; align-items: center; gap: 5px; min-width: 76px; cursor: pointer; }
.mee-level input[type="checkbox"] { accent-color: var(--dsw-primary, #3b82f6); }
.mee-level input[type="text"] {
  flex: 1; min-width: 0; box-sizing: border-box; padding: 2px 6px; font-size: 11px;
  border-radius: 5px; border: 1px solid var(--dsw-border-subtle);
  background: var(--dsw-bg-input, transparent); color: var(--dsw-text-primary);
}
.mee-level input[type="text"]:disabled { opacity: .45; }
.mee-compat { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; cursor: pointer; }
.mee-compat input { accent-color: var(--dsw-primary, #3b82f6); }
.mee-foot { display: flex; align-items: center; gap: 8px; }
.mee-foot button {
  margin-left: auto; padding: 4px 14px; font-size: 12px; cursor: pointer;
  border: none; border-radius: 7px;
  background: var(--dsw-primary, #3b82f6); color: var(--dsw-on-primary, #fff);
}
.mee-foot button:disabled { opacity: .55; cursor: default; }
.mee-err { color: var(--dsw-danger, #ef4444); font-size: 11px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

/** Insert the style element once and return its disposer. */
export function injectStyles(): () => void {
  const el = document.createElement('style')
  el.textContent = CSS
  document.head.appendChild(el)
  return () => {
    el.remove()
  }
}
