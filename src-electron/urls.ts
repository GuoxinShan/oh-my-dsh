export function allowedExternalUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.startsWith('http://')
    || lower.startsWith('https://')
    || lower.startsWith('mailto:')
    || lower.startsWith('tel:')
}
