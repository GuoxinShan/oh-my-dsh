import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { collapseRailTemplate, railCss } from '../src/client/rail.ts'

describe('collapseRailTemplate', () => {
  it('zeroes the first track of the AppFrame template (details closed)', () => {
    assert.equal(collapseRailTemplate('56px minmax(0, 1fr) 0px'), '0px minmax(0, 1fr) 0px')
  })
  it('zeroes the first track and keeps the live details width', () => {
    assert.equal(collapseRailTemplate('56px minmax(0px, 1fr) 412px'), '0px minmax(0px, 1fr) 412px')
  })
  it('rewrites any leading pixel track (tolerant of solver drift)', () => {
    assert.equal(collapseRailTemplate('280px minmax(0, 1fr) 0px'), '0px minmax(0, 1fr) 0px')
  })
  it('is idempotent on an already-zero first track', () => {
    assert.equal(collapseRailTemplate('0px minmax(0, 1fr) 0px'), '0px minmax(0, 1fr) 0px')
  })
  it('passes non-contract templates through unchanged (fail soft)', () => {
    assert.equal(collapseRailTemplate(''), '')
    assert.equal(collapseRailTemplate('none'), 'none')
    assert.equal(collapseRailTemplate('56px'), '56px')
    assert.equal(collapseRailTemplate('minmax(0, 1fr) 360px'), 'minmax(0, 1fr) 360px')
  })
})

describe('railCss', () => {
  it('drops the zero-width sidebar column border seam', () => {
    const css = railCss()
    assert.ok(css.includes('div[data-sidebar-collapsed]:has(> [data-shell-overlay])>div:nth-child(1)'))
    assert.ok(css.includes('border-right:none'))
  })
  it('hides the native toggle but keeps the brand wordmark visible', () => {
    const css = railCss()
    assert.ok(css.includes("div[data-slot='sidebar']>div>div:first-child>button:last-child{display:none;}"))
  })
  it('seats the controls right of the traffic lights, centered on the dropped row', () => {
    const css = railCss()
    assert.ok(css.includes('top:8px;left:86px;height:22px;'))
    assert.ok(css.includes('gap:8px;'), 'breathing room between toggle and bubble')
    assert.ok(css.includes('z-index:1'))
  })
  it('keeps the toggle always visible and clickable', () => {
    const css = railCss()
    const toggleRule = css.match(/\[data-desktop-rail-controls\] \[data-desktop-rail-button\]\{[^}]*\}/)
    assert.ok(toggleRule !== null)
    assert.ok(toggleRule[0].includes('pointer-events:auto'))
    assert.ok(toggleRule[0].includes('-webkit-app-region:no-drag!important'))
    assert.ok(!toggleRule[0].includes('opacity:0'))
  })
  it('shows the New Session bubble only while collapsed, sliding in delayed', () => {
    const css = railCss()
    assert.ok(css.includes('[data-desktop-rail-controls] [data-desktop-new-session]{opacity:0;visibility:hidden;transform:translateX(12px);pointer-events:none!important;'))
    assert.ok(css.includes('div[data-sidebar-collapsed] [data-desktop-rail-controls] [data-desktop-new-session]{opacity:1;visibility:visible;'))
    assert.ok(css.includes('transition:opacity .2s ease .18s,transform .2s ease .18s'))
  })
  it('respects reduced motion', () => {
    assert.ok(railCss().includes('@media (prefers-reduced-motion: reduce)'))
  })
  it('styles with semantic tokens only', () => {
    const css = railCss()
    assert.ok(css.includes('var(--dsw-alias-label-primary)'))
    assert.ok(css.includes('var(--dsw-alias-interactive-bg-hover)'))
    assert.ok(!css.includes('#'), 'no literal colors')
  })
})
