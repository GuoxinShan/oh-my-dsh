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

function copyStub(src: string, dest: string): void {
  try {
    fs.copyFileSync(src, dest, fs.constants.COPYFILE_FICLONE)
  } catch {
    fs.copyFileSync(src, dest)
  }
  fs.chmodSync(dest, 0o755)
}

/**
 * Launch Services keys Dock identity off the bundle that contains the
 * running executable. Spawning `Oh My DSH.app/Contents/MacOS/Oh My DSH`
 * with ELECTRON_RUN_AS_NODE still registers a second Oh My DSH tile —
 * hide-dock after the fact is racy and needs clang on the user's Mac.
 *
 * Copy the 69KB Electron stub into an LSUIElement helper and symlink
 * `Contents/Frameworks` at the real framework so @rpath still resolves.
 * No compiler required. Missing Frameworks → return the original path.
 */
export function ensureSidecarNodeApp(electronPath: string, root: string): string {
  if (process.platform !== 'darwin') return electronPath
  if (!fs.existsSync(electronPath)) {
    throw new Error(`dsh-desktop: refusing to write sidecar node app for missing binary: ${electronPath}`)
  }
  const frameworks = electronFrameworksDir(electronPath)
  if (!fs.existsSync(frameworks)) return electronPath

  const contents = path.join(root, 'sidecar-node', bundleKey(electronPath), 'DSH Node.app', 'Contents')
  const dest = path.join(contents, 'MacOS', EXEC_NAME)
  const fwLink = path.join(contents, 'Frameworks')
  const plist = path.join(contents, 'Info.plist')
  let fwTarget = ''
  try {
    fwTarget = fs.realpathSync(frameworks)
  } catch {
    fwTarget = frameworks
  }
  const ready =
    fs.existsSync(dest)
    && fs.statSync(dest).size === fs.statSync(electronPath).size
    && fs.existsSync(plist)
    && fs.readFileSync(plist, 'utf8').includes(BUNDLE_ID)
    && fs.existsSync(fwLink)
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
  return dest
}
