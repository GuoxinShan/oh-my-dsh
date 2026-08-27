/** Marker the archived Tauri shell puts in notes when the next release is Electron. */
export const ELECTRON_CUTOVER_MARKER = '<!-- dsh-electron-cutover -->'

export function isElectronCutoverNotes(notes: string): boolean {
  return notes.includes('dsh-electron-cutover')
}

/** One rendered region of an update-notes document. */
export type UpdateNoteBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string }

function headingText(line: string): string | undefined {
  const match = /^(#{2,3})\s+(.+)$/.exec(line)
  return match === null ? undefined : match[2].trim()
}

function listItem(line: string): string | undefined {
  const match = /^[-*]\s+(.+)$/.exec(line)
  return match === null ? undefined : match[1].trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** GitHub atom / electron-updater often hands us HTML, not Keep a Changelog markdown. */
function looksLikeHtml(text: string): boolean {
  return /<(?:h[1-6]|ul|ol|li|p|br|div|code)\b/i.test(text)
}

/**
 * Turn the GitHub-release HTML subset into the markdown this parser already
 * understands. Strip tags only — never feed the result to innerHTML.
 */
export function htmlToChangelogMarkdown(html: string): string {
  let text = html
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(?:h[1-6]|p|div)>/gi, '\n')
  text = text.replace(/<h([1-6])[^>]*>/gi, (_, level: string) => {
    const depth = Number(level)
    return `${'#'.repeat(depth <= 2 ? 2 : 3)} `
  })
  text = text.replace(/\s*<li[^>]*>\s*/gi, '\n- ')
  text = text.replace(/<\/li>/gi, '')
  text = text.replace(/\s*<\/?(?:ul|ol)[^>]*>\s*/gi, '\n')
  text = text.replace(/<\/?[^>]+>/g, '')
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Split Keep a Changelog markdown into headings, lists, and paragraphs.
 * The renderer stays inside this plugin so the dialog does not pull the
 * chat Markdown stack (KaTeX / streaming parser) into a confirmation box.
 */
export function parseUpdateNotes(text: string): UpdateNoteBlock[] {
  const decoded = decodeEntities(text)
  const source = looksLikeHtml(decoded) ? htmlToChangelogMarkdown(decoded) : decoded
  const blocks: UpdateNoteBlock[] = []
  let paragraph: string[] = []
  let items: string[] = []

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = (): void => {
    if (items.length === 0) return
    blocks.push({ type: 'list', items })
    items = []
  }

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0) {
      flushParagraph()
      flushList()
      continue
    }
    if (line.startsWith('<!--') && line.endsWith('-->')) continue
    const heading = headingText(line)
    if (heading !== undefined) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: heading })
      continue
    }
    const item = listItem(line)
    if (item !== undefined) {
      flushParagraph()
      items.push(item)
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}
