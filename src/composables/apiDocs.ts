import { fetchRdfTurtle, fetchApiDocs } from './fdpApi'
import { parseTurtle, resolveSubjectUri, getParentUri, getNodeRefs } from './rdfUtils'
import { DCAT_ENDPOINT_DESCRIPTION } from './vocabularies'

/**
 * Resolves the URL of the FDP's OpenAPI/SmartAPI document. Follows dct:isPartOf up from the
 * given resource until reaching the FDP root (no further parent), reads
 * dcat:endPointDescription there, and falls back to a same-origin /v3/api-docs guess if the
 * root doesn't declare one. The returned URL is not verified to actually respond; callers are
 * responsible for handling a failed or invalid fetch.
 */
export async function discoverApiDocsUrl(uri: string): Promise<string> {
  let currentUri = uri
  let store = parseTurtle(await fetchRdfTurtle(currentUri))
  let subjectUri = resolveSubjectUri(store, currentUri)

  let parentUri = subjectUri ? getParentUri(store, subjectUri) : null
  while (parentUri) {
    currentUri = parentUri
    store = parseTurtle(await fetchRdfTurtle(currentUri))
    subjectUri = resolveSubjectUri(store, currentUri)
    parentUri = subjectUri ? getParentUri(store, subjectUri) : null
  }

  const endpointDescription = subjectUri
    ? getNodeRefs(store, subjectUri, DCAT_ENDPOINT_DESCRIPTION)[0]
    : undefined

  return endpointDescription ?? new URL('/v3/api-docs', currentUri).toString()
}

type OpenApiOperation = { operationId?: string }
type OpenApiDoc = { paths?: Record<string, Record<string, OpenApiOperation>> }

/**
 * Finds the path and HTTP method for a given operationId in an already-fetched OpenAPI document.
 * Returns null if the document has no matching operation.
 */
export function resolveOperation(
  doc: unknown,
  operationId: string,
): { path: string; method: string } | null {
  const paths = (doc as OpenApiDoc | null)?.paths
  if (!paths) return null

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation.operationId === operationId) {
        return { path, method: method.toUpperCase() }
      }
    }
  }

  return null
}

/**
 * Resolves an operationId to a full URL and HTTP method by discovering and fetching the FDP's
 * OpenAPI document. Falls back to fallbackPath/fallbackMethod if discovery, fetching, or
 * resolution fails for any reason.
 */
export async function resolveOperationUrl(
  rootUri: string,
  operationId: string,
  fallbackPath: string,
  fallbackMethod: string,
): Promise<{ url: string; method: string }> {
  try {
    const docsUrl = await discoverApiDocsUrl(rootUri)
    const doc = await fetchApiDocs(docsUrl)
    const operation = resolveOperation(doc, operationId)
    if (operation) {
      return { url: new URL(operation.path, rootUri).toString(), method: operation.method }
    }
  } catch {
    // fall through to fallback
  }
  return { url: new URL(fallbackPath, rootUri).toString(), method: fallbackMethod }
}
