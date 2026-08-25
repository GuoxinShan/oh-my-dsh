/**
 * Merge per-platform updater fragments into the GitHub-Release latest.json.
 * Each fragment is `{ "<os>-<arch>": { signature, url } }`.
 *
 * Usage:
 *   node scripts/compose-latest-json.mjs <version> <out.json> --notes-file <notes.md> <fragment.json> ...
 *
 * `notes` is the in-app changelog body (Tauri updater `body`). Empty notes or a
 * missing --notes-file fail loud so a release cannot ship the old placeholder.
 */
import { readFileSync, writeFileSync } from 'node:fs'

function parseArgs(argv) {
  const notesIndex = argv.indexOf('--notes-file')
  if (notesIndex === -1 || argv[notesIndex + 1] === undefined) {
    return { error: 'missing --notes-file <path>' }
  }
  const notesFile = argv[notesIndex + 1]
  const rest = [...argv.slice(0, notesIndex), ...argv.slice(notesIndex + 2)]
  const [version, out, ...fragments] = rest
  return { version, out, fragments, notesFile }
}

const parsed = parseArgs(process.argv.slice(2))
if (parsed.error || !parsed.version || !parsed.out || parsed.fragments.length === 0) {
  console.error('usage: node scripts/compose-latest-json.mjs <version> <out.json> --notes-file <notes.md> <fragment.json>...')
  if (parsed.error) console.error(`compose-latest-json: ${parsed.error}`)
  process.exit(1)
}

const notes = readFileSync(parsed.notesFile, 'utf8').trim()
if (notes.length === 0) {
  console.error(`compose-latest-json: notes file ${parsed.notesFile} is empty`)
  process.exit(1)
}

const platforms = {}
for (const fragment of parsed.fragments) {
  const parsedFragment = JSON.parse(readFileSync(fragment, 'utf8'))
  Object.assign(platforms, parsedFragment)
}
if (Object.keys(platforms).length === 0) {
  console.error('compose-latest-json: no platforms in fragments')
  process.exit(1)
}

writeFileSync(parsed.out, JSON.stringify({
  version: parsed.version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
}, null, 2) + '\n')
console.log(`compose-latest-json: ${Object.keys(platforms).join(', ')} -> ${parsed.out}`)
