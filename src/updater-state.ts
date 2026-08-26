export type DesktopUpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'current' }
  | { phase: 'available'; version: string; notes: string }
  | { phase: 'preparing'; version?: string }
  | { phase: 'downloading'; version: string; downloaded: number; total?: number }
  | { phase: 'ready'; version: string; notes: string }
  | { phase: 'installing'; version: string }
  | { phase: 'restarting'; version: string }
  | { phase: 'failed'; version?: string; message: string }

export function isBusy(status: DesktopUpdateStatus): boolean {
  return (
    status.phase === 'checking'
    || status.phase === 'preparing'
    || status.phase === 'downloading'
    || status.phase === 'installing'
    || status.phase === 'restarting'
  )
}

export function statusVersion(status: DesktopUpdateStatus): string | undefined {
  if (
    status.phase === 'available'
    || status.phase === 'downloading'
    || status.phase === 'ready'
    || status.phase === 'installing'
    || status.phase === 'restarting'
  ) {
    return status.version
  }
  if (status.phase === 'preparing' || status.phase === 'failed') return status.version
  return undefined
}

let status: DesktopUpdateStatus = { phase: 'idle' }

export function updateStatusSnapshot(): DesktopUpdateStatus {
  return status
}

export function setUpdateStatus(next: DesktopUpdateStatus): void {
  status = next
}

export function claimUpdateCheck(): string | undefined {
  if (isBusy(status)) throw new Error('update operation already in progress')
  if (status.phase === 'ready') throw new Error('downloaded update awaiting confirmation')
  const version = statusVersion(status)
  status = { phase: 'checking' }
  return version
}

export function claimUpdateDownload(): string {
  if (isBusy(status)) throw new Error('update operation already in progress')
  if (status.phase !== 'available') throw new Error('no checked update available')
  const version = status.version
  status = { phase: 'preparing', version }
  return version
}

export function claimUpdateInstall(): string {
  if (isBusy(status)) throw new Error('update operation already in progress')
  if (status.phase !== 'ready') throw new Error('no downloaded update ready')
  const version = status.version
  status = { phase: 'installing', version }
  return version
}

export function addUpdateChunk(chunk: number, total?: number): void {
  if (status.phase !== 'downloading') return
  const nextTotal = status.total === undefined && total !== undefined ? total : status.total
  status = {
    phase: 'downloading',
    version: status.version,
    downloaded: status.downloaded + chunk,
    ...(nextTotal === undefined ? {} : { total: nextTotal }),
  }
}

export function resetUpdateStatusForTests(): void {
  status = { phase: 'idle' }
}
