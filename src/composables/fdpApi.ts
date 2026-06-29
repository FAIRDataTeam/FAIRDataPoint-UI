import { getBaseUrl } from './urlUtils'

let authToken: string | null = null

/** Stores the JWT token to be included in subsequent requests as a Bearer header. */
export function setAuthToken(token: string | null): void {
  authToken = token
}

/** Low-level fetch for any RDF resource; callers specify the Accept header. */
export async function fetchRdf(uri: string, accept: string): Promise<string> {
  const headers: Record<string, string> = { Accept: accept }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(uri, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

/** Fetches an RDF resource as Turtle, the only format used by this client. */
export async function fetchRdfTurtle(uri: string): Promise<string> {
  return fetchRdf(uri, 'text/turtle')
}

/** Searches resources via the FDP full-text search endpoint. */
// TODO: currently limited to the first 20 results; consider pagination or a larger page size.
export async function searchResources(query: string): Promise<unknown[]> {
  const base = getBaseUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/search?page=0&size=20`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Search failed (HTTP ${response.status})`)
  return response.json() as Promise<unknown[]>
}

/** Authenticates with the FDP and returns a JWT token. */
export async function fetchToken(email: string, password: string): Promise<string> {
  const base = getBaseUrl()
  const response = await fetch(`${base}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'Invalid email or password'
        : `Login failed (HTTP ${response.status})`,
    )
  }
  const data = (await response.json()) as { token: string }
  return data.token
}
