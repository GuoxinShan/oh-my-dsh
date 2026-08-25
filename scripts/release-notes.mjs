/**
 * Extract one Keep a Changelog section for a desktop version.
 *
 * Usage: node scripts/release-notes.mjs <version> [CHANGELOG.md]
 *
 * Prefers `## [version]`. If that heading is missing, falls back to
 * `## [Unreleased]` (stderr warning) so a tag PR that has not renamed the
 * heading still ships notes. Empty / missing sections fail loud — never
 * invent a placeholder for latest.json.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HEADING = /^##\s+\[([^\]]+)\](?:\s+-\s+.+)?\s*$/

/**
 * Return the body under `## [version]`, or undefined when the heading is absent.
 * @param markdown - the full changelog document.
 * @param version - exact heading label (`0.2.0-rc.24` or `Unreleased`).
 */
export function extractChangelogSection(markdown, version) {
  const lines = markdown.split(/\r?\n/)
  let start = -1
  for (let index = 0; index < lines.length; index += 1) {
    const match = HEADING.exec(lines[index])
    if (match !== null && match[1] === version) {
      start = index + 1
      break
    }
  }
  if (start < 0) return undefined
  let end = lines.length
  for (let index = start; index < lines.length; index += 1) {
    if (HEADING.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

/**
 * Resolve notes for a release: exact version, then Unreleased, else throw.
 * @param markdown - the full changelog document.
 * @param version - tauri.conf / tag semver without the leading `v`.
 */
export function releaseNotesForVersion(markdown, version) {
  const exact = extractChangelogSection(markdown, version)
  if (exact !== undefined && exact.length > 0) return { notes: exact, source: version }
  const unreleased = extractChangelogSection(markdown, 'Unreleased')
  if (unreleased !== undefined && unreleased.length > 0) {
    return { notes: unreleased, source: 'Unreleased' }
  }
  throw new Error(
    `release-notes: CHANGELOG.md has no non-empty "## [${version}]" or "## [Unreleased]" section`,
  )
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const [version, changelogPath = 'CHANGELOG.md'] = process.argv.slice(2)
  if (!version) {
    console.error('usage: node scripts/release-notes.mjs <version> [CHANGELOG.md]')
    process.exit(1)
  }
  const markdown = readFileSync(resolve(changelogPath), 'utf8')
  const { notes, source } = releaseNotesForVersion(markdown, version)
  if (source !== version) {
    console.error(`release-notes: using [Unreleased] for ${version}`)
  }
  process.stdout.write(`${notes}\n`)
}
