import { fetchRdfTurtle, fetchApiDocs } from './fdpApi'
import { parseTurtle, resolveSubjectUri, getNodeRefs } from './rdfUtils'
import { DCAT_ENDPOINT_DESCRIPTION } from './vocabularies'

/**
 * Returns candidate OpenAPI/SmartAPI document URLs from the FDP root. The spec defines
 * dcat:endpointDescription on the root, and FDP 1.22+ may declare multiple values, such as both
 * the OpenAPI document and Swagger UI. A /v3/api-docs guess is kept as the only path fallback for
 * older or incomplete roots; callers still have to try the candidates.
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
 * Substitutes {name}-style placeholders in a path template with values from pathParams.
 * @example substitutePathParams('/users/{uuid}', { uuid: 'abc' }) // -> '/users/abc'
 */
function substitutePathParams(path: string, pathParams: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_placeholder, name: string) => {
    const value = pathParams[name]
    if (value === undefined) throw new Error(`Missing path parameter '${name}' for '${path}'`)
    return encodeURIComponent(value)
  })
}

/**
 * Resolves an operationId to the URL/method advertised by the OpenAPI document.
 * No endpoint-path fallback is attempted here: after the document is found, a missing operation
 * means this FDP does not offer it.
 */
export async function bindOperation(
  rootUri: string,
  operationId: string,
  pathParams?: Record<string, string>,
): Promise<OperationBinding> {
  const doc = await getCachedApiDocs(rootUri)
  const operation = resolveOperation(doc, operationId)
  if (!operation) {
    throw new Error(`Operation '${operationId}' is not offered by this FDP's OpenAPI doc`)
  }
  const path = pathParams ? substitutePathParams(operation.path, pathParams) : operation.path
  return { url: new URL(path, rootUri).toString(), method: operation.method }
}
