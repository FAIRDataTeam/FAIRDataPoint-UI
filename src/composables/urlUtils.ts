export function isInternalUri(uri: string): boolean {
  const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
  const normalized = uri.replace(/\/$/, '')
  return normalized === base || normalized.startsWith(`${base}/`)
}

export function internalHref(uri: string): string {
  const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
  const normalized = uri.replace(/\/$/, '')
  if (normalized === base) return '/'
  const prefix = `${base}/`
  if (normalized.startsWith(prefix)) {
    const parts = normalized.slice(prefix.length).split('/')
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`
    return '/'
  }
  return uri
}
