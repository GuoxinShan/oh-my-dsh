import assert from 'node:assert/strict'
import test from 'node:test'
import { extractChangelogSection, releaseNotesForVersion } from './release-notes.mjs'

const sample = `# Changelog

## [Unreleased]

### Changed
- upcoming

## [0.2.0-rc.23] - 2026-08-24

### Fixed
- drift

## [0.2.0-rc.22] - 2026-08-22

- older
`

test('extractChangelogSection reads the version body only', () => {
  assert.equal(
    extractChangelogSection(sample, '0.2.0-rc.23'),
    '### Fixed\n- drift',
  )
  assert.equal(extractChangelogSection(sample, 'missing'), undefined)
})

test('releaseNotesForVersion prefers the exact heading then Unreleased', () => {
  assert.deepEqual(releaseNotesForVersion(sample, '0.2.0-rc.23'), {
    notes: '### Fixed\n- drift',
    source: '0.2.0-rc.23',
  })
  assert.deepEqual(releaseNotesForVersion(sample, '0.2.0-rc.24'), {
    notes: '### Changed\n- upcoming',
    source: 'Unreleased',
  })
  assert.throws(
    () => releaseNotesForVersion('# Changelog\n\n## [0.1.0]\n\n', '9.9.9'),
    /no non-empty/,
  )
})
