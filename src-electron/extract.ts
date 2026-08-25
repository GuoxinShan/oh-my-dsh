import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

let tarForceLocal: boolean | undefined

export function tarSupportsForceLocal(): boolean {
  if (tarForceLocal !== undefined) return tarForceLocal
  const result = spawnSync('tar', ['--help'], { encoding: 'utf8', windowsHide: true })
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  tarForceLocal = text.includes('--force-local')
  return tarForceLocal
}

export function extractBundleTar(tar: string, dir: string, sentinel: string, okContent: string): void {
  if (!fs.existsSync(tar)) {
    throw new Error(`bundled tarball missing: ${tar}`)
  }
  const parent = path.dirname(dir)
  fs.mkdirSync(parent, { recursive: true })
  const tmp = `${dir}.tmp`
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  const args = []
  if (tarSupportsForceLocal()) args.push('--force-local')
  args.push('-xzf', tar, '-C', tmp)
  const status = spawnSync('tar', args, { stdio: 'inherit', windowsHide: true })
  if (status.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw new Error(`tar -xzf ${tar} exited ${String(status.status)}`)
  }
  if (!fs.existsSync(path.join(tmp, sentinel))) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw new Error(`extracted ${tar} lacks the expected ${sentinel} — bundled tarball corrupt?`)
  }
  fs.writeFileSync(path.join(tmp, '.ok'), `${okContent}\n`)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  fs.renameSync(tmp, dir)
}

export function readRevisionManifest(resources: string): Record<string, unknown> | undefined {
  const manifest = path.join(resources, 'runtime-revision.json')
  if (!fs.existsSync(manifest)) return undefined
  return JSON.parse(fs.readFileSync(manifest, 'utf8')) as Record<string, unknown>
}

export function extractHashedPackage(
  tar: string,
  dir: string,
  hash: string | undefined,
): void {
  const fresh = hash
    ? fs.existsSync(path.join(dir, '.ok'))
      && fs.readFileSync(path.join(dir, '.ok'), 'utf8').trim() === hash
    : fs.existsSync(path.join(dir, 'package.json'))
  if (fresh) return
  extractBundleTar(tar, dir, 'package.json', hash ?? '')
}
