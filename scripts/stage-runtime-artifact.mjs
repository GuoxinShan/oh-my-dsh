/**
 * Copy src/resources/runtime.tar.gz to release/runtime-<sha>-<platform-arch>.tar.gz
 * so GitHub Releases can serve it when a slim updater zip omitted the bundled tar.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function runtimeArtifactName(sha, platform = process.platform, arch = process.arch) {
  return `runtime-${sha}-${platform}-${arch}.tar.gz`
}

export function stageRuntimeArtifact() {
  const resources = join(repoRoot, 'src/resources')
  const tar = join(resources, 'runtime.tar.gz')
  const revisionPath = join(resources, 'runtime-revision.json')
  if (!existsSync(tar) || !existsSync(revisionPath)) {
    console.log('stage-runtime-artifact: skip (prepare has not packed runtime.tar.gz)')
    return
  }
  const revision = JSON.parse(readFileSync(revisionPath, 'utf8'))
  const sha = typeof revision.sha === 'string' ? revision.sha : ''
  if (!sha) throw new Error('stage-runtime-artifact: runtime-revision.json has no sha')
  const destDir = join(repoRoot, 'release')
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, runtimeArtifactName(sha))
  copyFileSync(tar, dest)
  console.log(`stage-runtime-artifact: ${dest}`)
  return dest
}

const invoked = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invoked) stageRuntimeArtifact()
