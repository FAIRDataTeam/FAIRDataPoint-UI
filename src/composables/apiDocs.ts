import { fetchRdfTurtle, fetchApiDocs } from './fdpApi'
import { parseTurtle, resolveSubjectUri, getParentUri, getNodeRefs } from './rdfUtils'
import { DCAT_ENDPOINT_DESCRIPTION } from './vocabularies'

/**
 * Finds candidate URLs for the FDP's OpenAPI/SmartAPI document: walks dct:isPartOf up to the FDP
 * root, reads dcat:endpointDescription there, and adds a /v3/api-docs guess as a fallback.
 * FDP 1.22+ can declare more than one (e.g. the OpenAPI doc and the Swagger UI page) in no
 * guaranteed order, and none of the returned URLs are verified to respond; callers must try each.
 */
export async function discoverApiDocsUrls(uri: string): Promise<string[]> {
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

  const declaredUrls = subjectUri ? getNodeRefs(store, subjectUri, DCAT_ENDPOINT_DESCRIPTION) : []
  const fallbackUrl = new URL('/v3/api-docs', currentUri).toString()
  return [...new Set([...declaredUrls, fallbackUrl])]
}

type OpenApiOperation = { operationId?: string }
type OpenApiDoc = { paths?: Record<string, Record<string, OpenApiOperation>> }

function isOpenApiDoc(doc: unknown): doc is OpenApiDoc {
  return typeof doc === 'object' && doc !== null && 'paths' in doc
}

let apiDocsPromise: Promise<unknown> | null = null

/** Fetches the FDP's OpenAPI doc once per session and reuses it for all subsequent lookups. */
async function getCachedApiDocs(rootUri: string): Promise<unknown> {
  if (!apiDocsPromise) {
    apiDocsPromise = resolveApiDocs(rootUri).catch((err) => {
      apiDocsPromise = null
      throw err
    })
  }
  return apiDocsPromise
}

/**
 * Fetches the FDP's OpenAPI document, trying each URL from discoverApiDocsUrls in turn and
 * keeping the first one that actually parses as an OpenAPI document (has a paths object).
 * Throws if none of the candidates resolve to one.
 */
async function resolveApiDocs(rootUri: string): Promise<unknown> {
  const candidates = await discoverApiDocsUrls(rootUri)
  for (const url of candidates) {
    try {
      const doc = await fetchApiDocs(url)
      if (isOpenApiDoc(doc)) return doc
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`No usable OpenAPI document found among candidates: ${candidates.join(', ')}`)
}

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
    const doc = await getCachedApiDocs(rootUri)
    const operation = resolveOperation(doc, operationId)
    if (operation) {
      return { url: new URL(operation.path, rootUri).toString(), method: operation.method }
    }
  } catch {
    // fall through to fallback
  }
  return { url: new URL(fallbackPath, rootUri).toString(), method: fallbackMethod }
}

/**
 * Checks whether the FDP's OpenAPI doc advertises the given operationId. Only used to gate UI
 * affordances (e.g. showing a "Log in" button), so it fails closed: any discovery/fetch failure,
 * or the operation being absent from a successfully-fetched doc, resolves to false. We only offer
 * functionality we can actually confirm the backend supports.
 */
export async function isOperationOffered(rootUri: string, operationId: string): Promise<boolean> {
  try {
    const doc = await getCachedApiDocs(rootUri)
    return resolveOperation(doc, operationId) !== null
  } catch {
    return false
  }
}
