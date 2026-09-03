import { ref } from 'vue'
import { fetchRdfTurtle, fetchJSON } from './fetchUtils'
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

/** Fallback OpenAPI path appended after the root's declared candidates. */
const FALLBACK_API_DOCS_PATH = 'v3/api-docs'

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
  // Note that JavaScript Set preserves insertion order
  return [...new Set([...declaredUrls, joinUrl(rootUri, FALLBACK_API_DOCS_PATH)])]
}

type OpenApiOperation = { operationId?: string }
type OpenApiDoc = { paths?: Record<string, Record<string, OpenApiOperation>> }

/** Duck-typing: If it looks like an OpenApiDoc, treat it as one. */
function isOpenApiDoc(doc: unknown): doc is OpenApiDoc {
  return typeof doc === 'object' && doc !== null && 'paths' in doc
}

// Timeout per api-docs discovery/fetch attempt.
const API_DOCS_TIMEOUT_MS = 10_000

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

/** Resolved OpenAPI document URL, or null when no usable api-docs were found. */
export const apiDocsUrl = ref<string | null>(null)

/**
 * Human-facing API documentation URL, usually Swagger UI. Declared by the root, not verified: it
 * may not actually have been fetched. Null when the root declared no such page.
 */
export const apiDocsPageUrl = ref<string | null>(null)

/** Whether the initial api-docs resolution attempt has finished. */
export const apiDocsSettled = ref(false)

/**
 * Loads api-docs state in three steps: discover candidates, resolve the machine-readable OpenAPI
 * document, then expose footer links/status from the same result.
 */
async function loadApiDocs(): Promise<void> {
  const rootUri = getRootUri()
  const fallbackUrl = joinUrl(rootUri, FALLBACK_API_DOCS_PATH)

  let candidateUrls: string[] = []
  try {
    candidateUrls = await discoverApiDocsUrls(rootUri, API_DOCS_TIMEOUT_MS)
  } catch {
    // Root itself is unreachable, so nothing is declared and nothing can be linked.
  }

  // Try candidates until one parses as OpenAPI; remember hard failures so they are not linked later.
  let doc: OpenApiDoc | null = null
  let openApiUrl: string | null = null
  const failedUrls = new Set<string>()
  for (const candidateUrl of candidateUrls) {
    try {
      const candidateDoc = await fetchJSON(candidateUrl, API_DOCS_TIMEOUT_MS)
      if (isOpenApiDoc(candidateDoc)) {
        doc = candidateDoc
        openApiUrl = candidateUrl
        break
      }
    } catch (error) {
      // A 200 HTML docs page throws SyntaxError from response.json(), but is still worth linking.
      // Anything else (404, network error) means the candidate is confirmed dead.
      if (!(error instanceof SyntaxError)) failedUrls.add(candidateUrl)
    }
  }
  // Fail closed when nothing resolved, same as an absent operation.
  apiDocs.value = doc
  apiDocsUrl.value = openApiUrl

  // Link the first non-fallback docs candidate that did not fail during resolution.
  const docsPageCandidates = candidateUrls.filter(
    (url) => url !== openApiUrl && url !== fallbackUrl,
  )
  apiDocsPageUrl.value = docsPageCandidates.find((url) => !failedUrls.has(url)) ?? null

  apiDocsSettled.value = true
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
