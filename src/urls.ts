/** Hide the one-time `?token=` query from logs and diagnostics. */
export function redactLaunchUrl(url: string): string {
  return url.replace(/([?&]token=)[^&#\s]+/gu, '$1<redacted>')
}

/** Keep an existing launch token and add the e2e probe flag. */
export function withE2eQuery(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set('e2e', '1')
  return parsed.href
}

export function allowedExternalUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.startsWith('http://')
    || lower.startsWith('https://')
    || lower.startsWith('mailto:')
    || lower.startsWith('tel:')
}
