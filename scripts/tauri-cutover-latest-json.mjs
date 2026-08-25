/**
 * Write a Tauri `latest.json` so 0.2.x clients still hit a document after
 * Electron owns `releases/latest`. It advertises the Electron version and
 * cutover notes. Platforms are placeholders — 0.2.x must not install an
 * Electron artifact as a Tauri update.
 *
 * Usage: node scripts/tauri-cutover-latest-json.mjs <version> <out.json>
 */
import { writeFileSync } from 'node:fs'

const CUTOVER_NOTES = `<!-- dsh-electron-cutover -->
新版 Oh My DSH 已换成 Electron 壳，无法从当前版本自动热更新。请到 GitHub Releases 下载 0.3.x 安装包。
`

const [version, out] = process.argv.slice(2)
if (!version || !out) {
  console.error('usage: node scripts/tauri-cutover-latest-json.mjs <version> <out.json>')
  process.exit(1)
}

const download = 'https://github.com/aka-danielZhang/oh-my-dsh/releases/latest'
writeFileSync(out, `${JSON.stringify({
  version,
  notes: CUTOVER_NOTES.trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': { signature: 'electron-cutover', url: download },
    'windows-x86_64': { signature: 'electron-cutover', url: download },
  },
}, null, 2)}\n`)
console.log(`tauri-cutover-latest-json: ${version} -> ${out}`)
