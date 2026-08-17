import { fetchRdfTurtle, fetchApiDocs } from './fdpApi'
import { parseTurtle, resolveSubjectUri, getNodeRefs } from './rdfUtils'
import { DCAT_ENDPOINT_DESCRIPTION } from './vocabularies'

/**
 * Finds candidate URLs for the FDP's OpenAPI/SmartAPI document: reads dcat:endpointDescription
 * from the FDP root's Turtle, and adds a /v3/api-docs guess as a fallback. Always called with the
 * root URI: dcat:endpointDescription is a root-only property per the FDP spec (Section 4.2.1), so
 * there's nothing to discover by walking dct:isPartOf up from elsewhere, and callers already know
 * the root directly via getRootUri(), no discovery needed to find it either.
 * FDP 1.22+ can declare more than one (e.g. the OpenAPI doc and the Swagger UI page) in no
 * guaranteed order, and none of the returned URLs are verified to respond; callers must try each.
 */
export async function discoverApiDocsUrls(rootUri: string): Promise<string[]> {
  const store = parseTurtle(await fetchRdfTurtle(rootUri))
  const subjectUri = resolveSubjectUri(store, rootUri)
  const declaredUrls = subjectUri ? getNodeRefs(store, subjectUri, DCAT_ENDPOINT_DESCRIPTION) : []
  const fallbackUrl = new URL('/v3/api-docs', rootUri).toString()
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

export type OperationBinding = { url: string; method: string }

/**
 * Resolves an operationId to the URL/method to call it. No fallback: the only guessed URL in
 * this module is discoverApiDocsUrls's /v3/api-docs guess, for locating the doc itself. Once we
 * have the doc, resolveOperation gives a definitive answer, offered or not, so this rejects
 * rather than guessing a path the backend has already told us doesn't exist.
 */
export async function bindOperation(
  rootUri: string,
  operationId: string,
): Promise<OperationBinding> {
  const doc = await getCachedApiDocs(rootUri)
  const operation = resolveOperation(doc, operationId)
  if (!operation) {
    throw new Error(`Operation '${operationId}' is not offered by this FDP's OpenAPI doc`)
  }
  return { url: new URL(operation.path, rootUri).toString(), method: operation.method }
}
