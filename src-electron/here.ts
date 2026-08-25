import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

declare const __dirname: string
declare const __filename: string

/** Directory of this module: CJS bundle uses __dirname; ESM tests use import.meta. */
export function moduleDirname(metaUrl: string): string {
  try {
    if (typeof __dirname === 'string' && __dirname.length > 0) return __dirname
  } catch {
    // ESM has no __dirname
  }
  return path.dirname(fileURLToPath(metaUrl))
}

export function moduleFilename(metaUrl: string): string {
  try {
    if (typeof __filename === 'string' && __filename.length > 0) return __filename
  } catch {
    // ESM has no __filename
  }
  return fileURLToPath(metaUrl)
}

export function nodeRequire(metaUrl: string): NodeRequire {
  return createRequire(moduleFilename(metaUrl))
}
