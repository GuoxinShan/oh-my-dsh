import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const EXEC_NAME = 'DSH Node'
const BUNDLE_ID = 'dev.dsh.desktop.node'

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${EXEC_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>DSH Node</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSBackgroundOnly</key>
  <true/>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`

export function electronFrameworksDir(electronPath: string): string {
  return path.resolve(path.dirname(electronPath), '..', 'Frameworks')
}

function bundleKey(electronPath: string): string {
  return createHash('sha256').update(electronPath).digest('hex').slice(0, 12)
}

function stubStamp(electronPath: string): string {
  return createHash('sha256').update(fs.readFileSync(electronPath)).digest('hex').slice(0, 16)
}

function copyStub(src: string, dest: string): void {
  try {
    fs.copyFileSync(src, dest, fs.constants.COPYFILE_FICLONE)
  } catch {
    fs.copyFileSync(src, dest)
  }
  fs.chmodSync(dest, 0o755)
}

/** `codesign -d` writes identity to stderr. */
export function isAdhocCodesignText(text: string): boolean {
  return /\bSignature=adhoc\b/.test(text) || /\(adhoc\)/.test(text)
}

/** Copied Developer ID stub + rewritten Info.plist is killed (SIGKILL, empty log). */
export function sidecarHelperUnsafeToExec(text: string): boolean {
  if (isAdhocCodesignText(text)) return false
  return /\bAuthority=Developer ID\b/.test(text) || /flags=0x[0-9a-f]*\(runtime\)/.test(text)
}

function codesignVerbose(target: string): string {
  const result = spawnSync('codesign', ['-d', '--verbose=2', target], {
    encoding: 'utf8',
    windowsHide: true,
  })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function adhocSignApp(app: string): boolean {
  try {
    execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', app], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return !sidecarHelperUnsafeToExec(codesignVerbose(app))
  } catch {
    return false
  }
}

/**
 * Launch Services keys Dock identity off the bundle that contains the
 * running executable. Spawning `Oh My DSH.app/Contents/MacOS/Oh My DSH`
 * with ELECTRON_RUN_AS_NODE still registers a second Oh My DSH tile —
 * hide-dock after the fact is racy and needs clang on the user's Mac.
 *
 * Copy the 69KB Electron stub into an LSUIElement helper and symlink
 * `Contents/Frameworks` at the real framework so @rpath still resolves.
 * Re-sign ad-hoc after rewriting Info.plist — the copied Developer ID
 * stub keeps Hardened Runtime, and macOS SIGKILLs the modified bundle.
 * Sign failure on a hardened stub falls back to the main binary.
 */
export function ensureSidecarNodeApp(electronPath: string, root: string): string {
  if (process.platform !== 'darwin') return electronPath
  if (!fs.existsSync(electronPath)) {
    throw new Error(`dsh-desktop: refusing to write sidecar node app for missing binary: ${electronPath}`)
  }
  const frameworks = electronFrameworksDir(electronPath)
  if (!fs.existsSync(frameworks)) return electronPath

  const helperRoot = path.join(root, 'sidecar-node', bundleKey(electronPath))
  const app = path.join(helperRoot, 'DSH Node.app')
  const contents = path.join(app, 'Contents')
  const dest = path.join(contents, 'MacOS', EXEC_NAME)
  const fwLink = path.join(contents, 'Frameworks')
  const plist = path.join(contents, 'Info.plist')
  const stamp = path.join(helperRoot, 'stub-stamp')
  const expectedStamp = stubStamp(electronPath)
  let fwTarget = ''
  try {
    fwTarget = fs.realpathSync(frameworks)
  } catch {
    fwTarget = frameworks
  }
  // Ad-hoc sign changes the stub's byte size, so do not compare sizes.
  const ready =
    fs.existsSync(dest)
    && fs.existsSync(stamp)
    && fs.readFileSync(stamp, 'utf8').trim() === expectedStamp
    && fs.existsSync(plist)
    && fs.readFileSync(plist, 'utf8').includes(BUNDLE_ID)
    && fs.existsSync(fwLink)
    && !sidecarHelperUnsafeToExec(codesignVerbose(app))
  if (ready) {
    try {
      if (fs.realpathSync(fwLink) === fwTarget) return dest
    } catch {
      // rebuild the symlink
    }
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    fs.rmSync(dest, { force: true })
  } catch {
    // replace
  }
  copyStub(electronPath, dest)
  try {
    fs.lstatSync(fwLink)
    fs.rmSync(fwLink, { recursive: true, force: true })
  } catch {
    // nothing to remove
  }
  fs.symlinkSync(fwTarget, fwLink)
  fs.writeFileSync(plist, INFO_PLIST)
  fs.writeFileSync(stamp, `${expectedStamp}\n`)
  if (!adhocSignApp(app) && sidecarHelperUnsafeToExec(codesignVerbose(app))) {
    console.warn(`dsh-desktop: sidecar helper ${app} is still Developer ID / hardened; using the main binary`)
    return electronPath
  }
  return dest
}
