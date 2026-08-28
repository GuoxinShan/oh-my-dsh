import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { UPDATER_GITHUB_OWNER, UPDATER_GITHUB_REPO } from './constants.ts'
import { readUpdateMirror, withMirrorFallback } from './update-mirror.ts'

export const SLIM_ZIP_RUNTIME_FILES = ['runtime.tar.gz', 'runtime.tar.gz.sha'] as const

export type RuntimeSource = 'ok-cache' | 'bundled-tar' | 'download'

export function decideRuntimeSource(input: { okMatches: boolean; bundledTarExists: boolean }): RuntimeSource {
  if (input.okMatches) return 'ok-cache'
  if (input.bundledTarExists) return 'bundled-tar'
  return 'download'
}

export function runtimePlatformTriple(platform: string = process.platform, arch: string = process.arch): string {
  return `${platform}-${arch}`
}

export function runtimeArtifactName(sha: string, platform: string = process.platform, arch: string = process.arch): string {
  return `runtime-${sha}-${runtimePlatformTriple(platform, arch)}.tar.gz`
}

export function runtimeDownloadUrls(input: {
  sha: string
  version: string
  owner?: string
  repo?: string
  platform?: string
  arch?: string
}): string[] {
  const owner = input.owner ?? UPDATER_GITHUB_OWNER
  const repo = input.repo ?? UPDATER_GITHUB_REPO
  const name = runtimeArtifactName(input.sha, input.platform, input.arch)
  const version = input.version.replace(/^v/, '')
  return [
    `https://github.com/${owner}/${repo}/releases/download/v${version}/${name}`,
    `https://github.com/${owner}/${repo}/releases/latest/download/${name}`,
  ]
}

export function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export function stripRuntimeResources(resourcesDir: string): string[] {
  const removed: string[] = []
  for (const name of SLIM_ZIP_RUNTIME_FILES) {
    const target = path.join(resourcesDir, name)
    if (!fs.existsSync(target)) continue
    fs.rmSync(target)
    removed.push(name)
  }
  return removed
}

export function patchUpdaterYml(yml: string, sha512: string, size: number): string {
  return yml
    .replace(/^(\s*sha512:\s*)\S+ *$/gm, `$1${sha512}`)
    .replace(/^(\s*size:\s*)\d+ *$/gm, `$1${String(size)}`)
}

export function latestMacYml(input: {
  version: string
  file: string
  sha512: string
  size: number
  releaseDate: string
  releaseNotes?: string
}): string {
  const lines = [
    `version: ${input.version}`,
    'files:',
    `  - url: ${input.file}`,
    `    sha512: ${input.sha512}`,
    `    size: ${input.size}`,
    `path: ${input.file}`,
    `sha512: ${input.sha512}`,
    `releaseDate: '${input.releaseDate}'`,
  ]
  const notes = input.releaseNotes?.replace(/\r\n/g, '\n').trim()
  if (notes) {
    lines.push('releaseNotes: |')
    for (const line of notes.split('\n')) lines.push(`  ${line}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function downloadUrlToFile(url: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  fs.rmSync(tmp, { force: true })
  const result = spawnSync('curl', ['-fL', '--retry', '2', '--connect-timeout', '30', '-o', tmp, url], {
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.status !== 0) {
    fs.rmSync(tmp, { force: true })
    throw new Error(`download failed (${String(result.status)}): ${url}`)
  }
  fs.renameSync(tmp, dest)
}

export function downloadRuntimeTarball(input: {
  sha: string
  expectedSha256: string
  version: string
  dest: string
  env?: NodeJS.ProcessEnv
}): string {
  if (fs.existsSync(input.dest) && sha256File(input.dest) === input.expectedSha256) return input.dest
  const mirror = readUpdateMirror(input.env)
  const urls = runtimeDownloadUrls({ sha: input.sha, version: input.version }).flatMap((url) => withMirrorFallback(url, mirror))
  const seen = new Set<string>()
  const errors: string[] = []
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)
    try {
      console.log(`dsh-desktop: downloading runtime ${input.sha.slice(0, 12)} from ${url}`)
      downloadUrlToFile(url, input.dest)
      const got = sha256File(input.dest)
      if (got !== input.expectedSha256) {
        fs.rmSync(input.dest, { force: true })
        throw new Error(`sha256 mismatch: got ${got}, expected ${input.expectedSha256}`)
      }
      return input.dest
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${url}: ${message}`)
    }
  }
  throw new Error(`could not download runtime ${input.sha}: ${errors.join('; ')}`)
}
