import assert from 'node:assert/strict'
import test from 'node:test'
import { isElectronCutoverNotes, parseUpdateNotes } from '../src/client/update-notes.ts'

test('parseUpdateNotes keeps changelog headings and bullets', () => {
  assert.deepEqual(parseUpdateNotes(`### Fixed

- titlebar drift
- updater notes

### Changed
Keep the dialog quiet when notes are empty.
`), [
    { type: 'heading', text: 'Fixed' },
    { type: 'list', items: ['titlebar drift', 'updater notes'] },
    { type: 'heading', text: 'Changed' },
    { type: 'paragraph', text: 'Keep the dialog quiet when notes are empty.' },
  ])
})

test('parseUpdateNotes skips an electron-cutover HTML comment', () => {
  assert.equal(isElectronCutoverNotes('<!-- dsh-electron-cutover -->\n请下载新包'), true)
  assert.equal(isElectronCutoverNotes('regular notes'), false)
  assert.deepEqual(parseUpdateNotes('<!-- dsh-electron-cutover -->\n请下载新包'), [
    { type: 'paragraph', text: '请下载新包' },
  ])
})

test('parseUpdateNotes treats blank input as no blocks', () => {
  assert.deepEqual(parseUpdateNotes(''), [])
  assert.deepEqual(parseUpdateNotes('   \n\n'), [])
})

test('parseUpdateNotes turns GitHub atom HTML into headings and bullets', () => {
  assert.deepEqual(parseUpdateNotes(`<h3>Fixed</h3>
<ul>
<li>新建会话时 agent 附着的短暂 running 脉冲不再发「回合已完成」。</li>
<li>启动或切工作区灌入会话列表时，不再把历史会话刷进通知中心。</li>
</ul>
<h3>Changed</h3>
<ul>
<li>Tauri 壳从仓库删除；Electron 升为正职 <code>src/</code>。</li>
</ul>`), [
    { type: 'heading', text: 'Fixed' },
    {
      type: 'list',
      items: [
        '新建会话时 agent 附着的短暂 running 脉冲不再发「回合已完成」。',
        '启动或切工作区灌入会话列表时，不再把历史会话刷进通知中心。',
      ],
    },
    { type: 'heading', text: 'Changed' },
    { type: 'list', items: ['Tauri 壳从仓库删除；Electron 升为正职 src/。'] },
  ])
})

test('parseUpdateNotes decodes entity-escaped GitHub HTML', () => {
  assert.deepEqual(parseUpdateNotes('&lt;h3&gt;Fixed&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;titlebar&lt;/li&gt;&lt;/ul&gt;'), [
    { type: 'heading', text: 'Fixed' },
    { type: 'list', items: ['titlebar'] },
  ])
})
