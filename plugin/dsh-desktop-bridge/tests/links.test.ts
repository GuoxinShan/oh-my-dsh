import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyAnchor } from '../src/client/links.ts'

interface Stub {
  href: string
  target?: string
  attr: string | null
}

function anchor(raw: string | null, target?: string): Pick<HTMLAnchorElement, 'href' | 'target' | 'getAttribute'> {
  const stub: Stub = { href: raw === null ? '' : new URL(raw, 'http://127.0.0.1:3080').href, target, attr: raw }
  return {
    href: stub.href,
    target: stub.target ?? '',
    getAttribute: (name: string) => (name === 'href' ? stub.attr : null),
  }
}

const ORIGIN = 'http://127.0.0.1:3080'

describe('classifyAnchor', () => {
  it('routes target=_blank http links', () => {
    assert.deepEqual(classifyAnchor(anchor('https://example.com', '_blank'), ORIGIN), { action: 'route', url: 'https://example.com/' })
  })
  it('routes cross-origin http links without target', () => {
    assert.deepEqual(classifyAnchor(anchor('https://example.com/x'), ORIGIN), { action: 'route', url: 'https://example.com/x' })
  })
  it('passes same-origin links without target (SPA navigation)', () => {
    assert.deepEqual(classifyAnchor(anchor('/session/1'), ORIGIN), { action: 'pass' })
  })
  it('passes pure fragments and missing hrefs', () => {
    assert.deepEqual(classifyAnchor(anchor('#tools'), ORIGIN), { action: 'pass' })
    assert.deepEqual(classifyAnchor(anchor(null), ORIGIN), { action: 'pass' })
    assert.deepEqual(classifyAnchor(anchor(''), ORIGIN), { action: 'pass' })
  })
  it('routes mailto and tel', () => {
    assert.deepEqual(classifyAnchor(anchor('mailto:a@b.c'), ORIGIN), { action: 'route', url: 'mailto:a@b.c' })
    assert.deepEqual(classifyAnchor(anchor('tel:+123'), ORIGIN), { action: 'route', url: 'tel:+123' })
  })
  it('passes javascript: and ignores blob:/data: without target', () => {
    assert.deepEqual(classifyAnchor(anchor('javascript:void(0)'), ORIGIN), { action: 'pass' })
    assert.deepEqual(classifyAnchor(anchor('blob:http://x/y'), ORIGIN), { action: 'ignore' })
    assert.deepEqual(classifyAnchor(anchor('data:text/plain,hi'), ORIGIN), { action: 'ignore' })
  })
  it('ignores _blank anchors with non-web schemes', () => {
    assert.deepEqual(classifyAnchor(anchor('blob:http://x/y', '_blank'), ORIGIN), { action: 'ignore' })
  })
})
