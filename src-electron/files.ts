import fs from 'node:fs'
import path from 'node:path'

export function sanitizeDownloadName(name: string): string {
  const base = name.split(/[/\\]/).pop()
  return base && base.length > 0 ? base : 'download'
}

export function uniquePath(dir: string, name: string): string {
  const candidate = path.join(dir, name)
  if (!fs.existsSync(candidate)) return candidate
  const split = name.lastIndexOf('.')
  const stem = split === -1 ? name : name.slice(0, split)
  const ext = split === -1 ? '' : name.slice(split)
  for (let n = 1; ; n += 1) {
    const next = path.join(dir, `${stem}-${n}${ext}`)
    if (!fs.existsSync(next)) return next
  }
}
