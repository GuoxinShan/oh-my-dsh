export interface ThreadPanelVisibility {
  close(): void
  getSnapshot(): boolean
  open(): void
  subscribe(listener: () => void): () => void
  toggle(): void
}

export function createThreadPanelVisibility(): ThreadPanelVisibility {
  let visible = false
  const listeners = new Set<() => void>()

  const setVisible = (next: boolean): void => {
    if (visible === next) return
    visible = next
    for (const listener of listeners) listener()
  }

  return {
    close: () => { setVisible(false) },
    getSnapshot: () => visible,
    open: () => { setVisible(true) },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    toggle: () => { setVisible(!visible) },
  }
}
