/**
 * Pure text-editing logic for the home patch file (`$DSH_HOME/cordis.patch.yml`).
 *
 * The toggle's single write target is one managed block inside that file:
 *
 * ```
 * # BEGIN dsh-web-search-toggle (managed — do not edit inside the markers)
 * - id: tool-web
 *   disabled: true
 * # END dsh-web-search-toggle
 * ```
 *
 * A patch entry with `disabled: true` is the loader's documented row switch
 * (the shipped telemetry switch uses the same shape), and the home patch file
 * is watched live (`watchUserPatches`), so an edit re-composes the tree
 * without a restart. Editing is text-splicing between marker comments rather
 * than YAML re-serialization: the file is user-authored and may carry foreign
 * entries and comments a round-trip would destroy. The managed block is a
 * fixed shape this module produces, so no YAML parse is needed to keep it
 * well-formed; foreign content is never rewritten.
 *
 * @module dsh-web-search-toggle/patch-file
 */

/** Marker line opening the managed block. */
export const BEGIN_MARKER = '# BEGIN dsh-web-search-toggle (managed — do not edit inside the markers)'

/** Marker line closing the managed block. */
export const END_MARKER = '# END dsh-web-search-toggle'

/** The harness row the toggle disables. */
export const TOOL_WEB_ROW_ID = 'tool-web'

/** The managed block as it appears in the file (trailing newline included). */
const MANAGED_BLOCK = `${BEGIN_MARKER}\n- id: ${TOOL_WEB_ROW_ID}\n  disabled: true\n${END_MARKER}\n`

/** Header written when this module creates the file from nothing. */
const FILE_HEADER = '# dsh home patch layer: applies to every profile, after each bundle layer.\n'
  + '# This file was absent; dsh-web-search-toggle created it for its managed block.\n'

/**
 * Whether the native web_search tool row is enabled: enabled unless the
 * managed block is present (its only content is `disabled: true`).
 * @param text - the patch file's current text, or undefined when absent.
 * @returns true when tool-web is not disabled by this toggle.
 */
export function toggleStateFromText(text: string | undefined): boolean {
  if (text === undefined) return true
  return !text.includes(BEGIN_MARKER)
}

/**
 * Compute the next file text for one toggle state, preserving everything
 * outside the managed block byte-for-byte.
 *
 * Removing the block leaves the remaining content untouched — including an
 * empty `[]` body another writer left; a file whose only content was the
 * block resolves to `[]\n` so the YAML document stays a valid list.
 * @param text - the current text, or undefined when the file is absent.
 * @param enabled - the requested toggle state.
 * @returns the complete next file text.
 */
export function withToggleEntry(text: string | undefined, enabled: boolean): string {
  const current = text ?? FILE_HEADER + '[]\n'
  if (!enabled) {
    if (current.includes(BEGIN_MARKER)) return current
    return appendBlock(current)
  }
  if (!current.includes(BEGIN_MARKER)) return current
  const begin = current.indexOf(BEGIN_MARKER)
  const end = current.indexOf(END_MARKER, begin)
  if (end === -1) return current
  let next = current.slice(0, begin) + current.slice(end + END_MARKER.length)
  // Swallow up to one blank line the block's insertion added before it.
  next = next.replace(/\n\n+$/, '\n')
  if (next.replace(/#[^\n]*\n/g, '').trim() === '') next = '[]\n'
  else if (next.trim() === '' ) next = '[]\n'
  return next
}

/** Append the managed block to file text, separated by one blank line. */
function appendBlock(current: string): string {
  // An `[]` empty-list line cannot precede block entries — YAML would read
  // two documents and the loader's parse would reject the file. The harness
  // creates exactly this shape, so the marker line is dropped when the list
  // is empty (comments keep it company, they stay).
  const withoutEmptyList = current.replace(/(^|\n)[ \t]*\[\][ \t]*(#[^\n]*)?(\n|$)/, '\n')
  const listIsEmpty = withoutEmptyList
    .split('\n')
    .filter(line => line.trim() !== '' && !line.trim().startsWith('#'))
    .length === 0
  const base0 = listIsEmpty ? withoutEmptyList : current
  const base = base0.endsWith('\n') ? base0 : `${base0}\n`
  return `${base}\n${MANAGED_BLOCK}`
}
