import { ref } from 'vue'
import { fetchRdfTurtle, fetchApiDocs } from './fdpApi'
import { parseTurtle, resolveSubjectUri, getNodeRefs } from './rdfUtils'
import { DCAT_ENDPOINT_DESCRIPTION } from './vocabularies'
import { getRootUri } from './urlUtils'
import { configReady } from '@/config'

/**
 * Appends an FDP-relative path to a base URL without letting a leading slash reset to the origin.
 */
function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/**
 * Returns candidate OpenAPI/SmartAPI document URLs from the FDP root. The spec defines
 * dcat:endpointDescription on the root, and FDP 1.22+ may declare multiple values, such as both
 * the OpenAPI document and Swagger UI. A /v3/api-docs guess is kept as the only path fallback for
 * older or incomplete roots; callers still have to try the candidates.
 */
export async function discoverApiDocsUrls(rootUri: string, timeoutMs?: number): Promise<string[]> {
  const store = parseTurtle(await fetchRdfTurtle(rootUri, timeoutMs))
  const subjectUri = resolveSubjectUri(store, rootUri)
  const declaredUrls = subjectUri ? getNodeRefs(store, subjectUri, DCAT_ENDPOINT_DESCRIPTION) : []
  const fallbackUrl = joinUrl(rootUri, 'v3/api-docs')
  return [...new Set([...declaredUrls, fallbackUrl])]
}

type OpenApiOperation = { operationId?: string }
type OpenApiDoc = { paths?: Record<string, Record<string, OpenApiOperation>> }

function isOpenApiDoc(doc: unknown): doc is OpenApiDoc {
  return typeof doc === 'object' && doc !== null && 'paths' in doc
}

// Timeout per api-docs discovery/fetch attempt.
const API_DOCS_TIMEOUT_MS = 10_000

/**
 * Fetches the FDP's api-docs, trying each URL from discoverApiDocsUrls in turn and keeping the
 * first one that actually parses as an OpenAPI document (has a paths object). Throws if none of
 * the candidates resolve to one.
 */
async function resolveApiDocs(rootUri: string): Promise<OpenApiDoc> {
  const candidates = await discoverApiDocsUrls(rootUri, API_DOCS_TIMEOUT_MS)
  for (const url of candidates) {
    try {
      const doc = await fetchApiDocs(url, API_DOCS_TIMEOUT_MS)
      if (isOpenApiDoc(doc)) return doc
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`No usable api-docs found among candidates: ${candidates.join(', ')}`)
}

/**
 * Finds the path and HTTP method for a given operationId in already-fetched api-docs.
 * Returns null if there's no matching operation.
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

/** The FDP's api-docs, once resolved. Null until resolved, or if resolution failed. */
export const apiDocs = ref<OpenApiDoc | null>(null)

async function loadApiDocs(): Promise<void> {
  try {
    apiDocs.value = await resolveApiDocs(getRootUri())
  } catch {
    apiDocs.value = null // fail closed, same as an absent operation
  }
}

/** Resolves once the initial api-docs resolution attempt has settled, success or failure. */
export const apiDocsReady: Promise<void> = (async () => {
  await configReady
  await loadApiDocs()
})()

/**
 * Re-fetches api-docs after backend changes that may alter advertised operations,
 * such as ResourceDefinition updates.
 */
export async function refreshApiDocs(): Promise<void> {
  await configReady // safe regardless of when a future caller invokes this
  await loadApiDocs()
}

/** Whether the FDP's api-docs currently advertise the given operationId. */
export function isOperationOffered(operationId: string): boolean {
  return resolveOperation(apiDocs.value, operationId) !== null
}

/**
 * Resolves an advertised operation from the already-loaded api-docs. Throws if it isn't offered.
 * Not exported: every caller needs api-docs readiness first anyway, so they go through
 * bindOperation instead.
 */
function getOperationOrThrow(
  operationId: string,
  pathParams?: Record<string, string>,
): OperationBinding {
  const operation = resolveOperation(apiDocs.value, operationId)
  if (!operation) {
    throw new Error(`Operation '${operationId}' is not offered by this FDP's api-docs`)
  }
  const path = pathParams ? substitutePathParams(operation.path, pathParams) : operation.path
  return { url: joinUrl(getRootUri(), path), method: operation.method }
}

/**
 * Waits for api-docs readiness, then resolves an advertised operation.
 * Used by action code; availability checks use isOperationOffered().
 */
export async function bindOperation(
  operationId: string,
  pathParams?: Record<string, string>,
): Promise<OperationBinding> {
  await apiDocsReady
  return getOperationOrThrow(operationId, pathParams)
}
