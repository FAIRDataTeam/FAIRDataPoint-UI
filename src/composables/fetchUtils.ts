let authToken: string | null = null

/** Stores the JWT token to be included in subsequent requests as a Bearer header. */
export function setAuthToken(token: string | null): void {
  authToken = token
}

/** Merges the bearer token into the given headers, if one is set. */
export function authHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return authToken ? { ...headers, Authorization: `Bearer ${authToken}` } : headers
}

/** Performs a fetch with the bearer token attached, throwing a basic error on non-2xx responses. */
export async function request(
  url: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const { headers, ...rest } = init
  const response = await fetch(url, { ...rest, headers: authHeaders(headers) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response
}

/** Low-level fetch for any RDF resource; callers specify the Accept header and optional timeout. */
export async function fetchRdf(uri: string, accept: string, timeoutMs?: number): Promise<string> {
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
  const response = await request(uri, { headers: { Accept: accept }, signal })
  return response.text()
}

/** Fetches an RDF resource as Turtle, the only format used by this client. */
export async function fetchRdfTurtle(uri: string, timeoutMs?: number): Promise<string> {
  return fetchRdf(uri, 'text/turtle', timeoutMs)
}

/** Fetches api-docs as JSON from the given URL. See fetchRdf for the optional timeoutMs. */
export async function fetchJSON(uri: string, timeoutMs?: number): Promise<unknown> {
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
  const response = await request(uri, { headers: { Accept: 'application/json' }, signal })
  return response.json()
}
