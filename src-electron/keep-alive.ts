/** macOS red-dot close hides the window; sidecar and the webview stay. */
export function shouldRetainBackground(platform: NodeJS.Platform, isQuitting: boolean): boolean {
  return platform === 'darwin' && !isQuitting
}
