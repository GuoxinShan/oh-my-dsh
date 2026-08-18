import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyDownload } from '../src/client/downloads.ts'

interface AnchorStub {
  href: string
  download: string
  attr: string | null
}

function anchor(raw: string | null, download: string): Pick<HTMLAnchorElement, 'href' | 'download' | 'getAttribute'> {
  const stub: AnchorStub = {
    href: raw === null ? '' : new URL(raw, 'http://127.0.0.1:3080').href,
    download,
    attr: raw,
  }
  return {
    href: stub.href,
    download: stub.download,
    getAttribute: (name: string) => (name === 'href' ? stub.attr : null),
  }
}

function blobAnchor(raw: string, download: string): Pick<HTMLAnchorElement, 'href' | 'download' | 'getAttribute'> {
  return {
    href: raw,
    download,
    getAttribute: () => raw,
  }
}

const ORIGIN = 'http://127.0.0.1:3080'

describe('classifyDownload', () => {
  it('saves same-origin http(s) anchors with a download attribute', () => {
    assert.deepEqual(classifyDownload(anchor('/export/session.json', 'session.json'), ORIGIN), {
      action: 'save',
      url: 'http://127.0.0.1:3080/export/session.json',
      name: 'session.json',
    })
  })
  it('saves blob: anchors (the session-export flow)', () => {
    assert.deepEqual(classifyDownload(blobAnchor('blob:http://127.0.0.1:3080/uuid', 'log.jsonl'), ORIGIN), {
      action: 'save',
      url: 'blob:http://127.0.0.1:3080/uuid',
      name: 'log.jsonl',
    })
  })
  it('strips path components from suggested filenames', () => {
    const hidden = classifyDownload(anchor('/x', '../../etc/passwd'), ORIGIN)
    assert.equal(hidden.action, 'save')
    if (hidden.action === 'save') assert.equal(hidden.name, 'passwd')
    const windows = classifyDownload(anchor('/x', 'a/b\\c.txt'), ORIGIN)
    assert.equal(windows.action, 'save')
    if (windows.action === 'save') assert.equal(windows.name, 'c.txt')
  })
  it('passes anchors without a download attribute (external router owns them)', () => {
    assert.deepEqual(classifyDownload(anchor('https://elsewhere.example/file', ''), ORIGIN), { action: 'pass' })
  })
  it('passes cross-origin http downloads (left to the external router)', () => {
    assert.deepEqual(classifyDownload(anchor('https://elsewhere.example/file', 'f.txt'), ORIGIN), { action: 'pass' })
  })
  it('passes fragments, missing hrefs, and non-http schemes', () => {
    assert.deepEqual(classifyDownload(anchor('#frag', 'f'), ORIGIN), { action: 'pass' })
    assert.deepEqual(classifyDownload(anchor(null, 'f'), ORIGIN), { action: 'pass' })
    assert.deepEqual(classifyDownload(blobAnchor('data:text/plain,hi', 'f'), ORIGIN), { action: 'pass' })
    assert.deepEqual(classifyDownload(blobAnchor('javascript:void(0)', 'f'), ORIGIN), { action: 'pass' })
  })
})
