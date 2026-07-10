import { getRuntimeConfig } from '@/config.ts'

/** @example getBaseUrl() // -> 'http://localhost'  (when VITE_FDP_BASE_URL = 'http://localhost/') */
export function getBaseUrl(): string {
  return getRuntimeConfig().fdpBaseUrl.replace(/\/$/, '')
}

/**
 * RDF metadata can contain links to other resources on this FDP instance.
 * Internal links are handled by the Vue router; external links open in a new tab.
 * String prefix matching is used instead of URL object comparison: it is simpler and handles
 * all real cases correctly, since the base URL is a known configuration value (not arbitrary user input).
 * @example isInternalUri('http://localhost/catalog/1') // -> true
 * @example isInternalUri('https://example.com/foo')   // -> false
 */
export function isInternalUri(uri: string): boolean {
  const base = getBaseUrl()
  const normalized = uri.replace(/\/$/, '')
  return normalized === base || normalized.startsWith(`${base}/`)
}

/**
 * Converts a full FDP URI to a router path.
 * FDP resource URLs follow the pattern {base}/{resourceType}/{id}, so only the
 * first two segments are kept; deeper paths are not addressable by the router.
 * @example internalHref('http://localhost/catalog/1') // -> '/catalog/1'
 * @example internalHref('http://localhost')           // -> '/'
 * @example internalHref('https://example.com/foo')   // -> 'https://example.com/foo'
 */
export function internalHref(uri: string): string {
  if (!isInternalUri(uri)) return uri
  const base = getBaseUrl()
  const normalized = uri.replace(/\/$/, '')
  if (normalized === base) return '/'
  const parts = normalized.slice(base.length + 1).split('/')
  // parts.length < 2 means a container URI with no id (e.g. /catalog); no router route exists, fall back to root.
  return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : '/'
}
