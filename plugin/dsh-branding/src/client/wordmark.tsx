/**
 * Brand wordmark, browser half: the occupant of ui-sidebar's
 * `sidebar.brand.name` single slot — the deployment replacement point the
 * sidebar documents for its generic "DSH Local Build" fallback (label plus
 * build-hash pill). The wordmark keeps the shell's whale mark
 * (`sidebar.brand.mark` stays on its fallback) and renames only the text:
 * the product name plus an edition pill. Styles mirror ui-sidebar's
 * `.fallbackBrandName` / `.buildRevision` rules through semantic tokens
 * only, no literal colors; flex layout (gap, height) belongs to the
 * shell's `.brandName` row that hosts this slot's output.
 */
import type { ReactElement } from 'react'

/** Name share: mirrors ui-sidebar's `.fallbackBrandName` (17px, no tracking). */
const NAME_STYLE = {
  fontSize: '17px',
  letterSpacing: '0px',
  whiteSpace: 'nowrap',
} as const

/**
 * Pill share: mirrors ui-sidebar's `.buildRevision` — inverted label ink on
 * the primary label color (a light pill on dark surfaces, dark on light),
 * code font with a monospace fallback when the token is absent.
 */
const PILL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '16px',
  padding: '0 4px',
  borderRadius: '3px',
  color: 'var(--dsw-alias-label-primary-inverted)',
  background: 'var(--dsw-alias-label-primary)',
  fontFamily: 'var(--ds-font-family-code, monospace)',
  fontSize: '8px',
  fontWeight: 500,
  lineHeight: '16px',
} as const

/**
 * The product wordmark: name plus edition pill.
 * @returns the wordmark fragment rendered inside the shell's brand row.
 */
export function BrandWordmark(): ReactElement {
  return (
    <>
      <span data-brand-name="" style={NAME_STYLE}>Oh My DSH</span>
      <span data-brand-pill="" style={PILL_STYLE}>Harness</span>
    </>
  )
}
