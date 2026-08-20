/**
 * Merge per-platform updater fragments into the GitHub-Release latest.json.
 * Each fragment is `{ "<os>-<arch>": { signature, url } }`.
 *
 * Usage: node scripts/compose-latest-json.mjs <version> <out.json> [fragment.json ...]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [version, out, ...fragments] = process.argv.slice(2)
if (!version || !out || fragments.length === 0) {
  console.error('usage: node scripts/compose-latest-json.mjs <version> <out.json> <fragment.json>...')
  process.exit(1)
}

const platforms = {}
for (const fragment of fragments) {
  const parsed = JSON.parse(readFileSync(fragment, 'utf8'))
  Object.assign(platforms, parsed)
}
if (Object.keys(platforms).length === 0) {
  console.error('compose-latest-json: no platforms in fragments')
  process.exit(1)
}

writeFileSync(out, JSON.stringify({
  version,
  notes: 'See the release page for notes.',
  pub_date: new Date().toISOString(),
  platforms,
}, null, 2) + '\n')
console.log(`compose-latest-json: ${Object.keys(platforms).join(', ')} -> ${out}`)
