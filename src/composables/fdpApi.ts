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

/** Fetches an OpenAPI document as JSON from the given URL. */
export async function fetchApiDocs(uri: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(uri, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/** Searches resources via the FDP full-text search endpoint. */
// TODO: currently limited to the first 20 results; consider pagination or a larger page size.
export async function searchResources(
  query: string,
  url: string,
  method: string,
): Promise<unknown[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const searchUrl = new URL(url)
  searchUrl.searchParams.set('page', '0')
  searchUrl.searchParams.set('size', '20')
  const response = await fetch(searchUrl.toString(), {
    method,
    headers,
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Search failed (HTTP ${response.status})`)
  return response.json() as Promise<unknown[]>
}

/** Lists all users registered on the FDP. */
export async function fetchUsers(): Promise<unknown[]> {
  const base = getBaseUrl()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/users`, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<unknown[]>
}

/** Deletes a user by UUID. */
export async function deleteUser(uuid: string): Promise<void> {
  const base = getBaseUrl()
  const headers: Record<string, string> = {}
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/users/${uuid}`, { method: 'DELETE', headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

/** Fetches a single user's profile by UUID. */
export async function fetchUser(uuid: string): Promise<unknown> {
  const base = getBaseUrl()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/users/${uuid}`, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * Creates a new user; body mirrors the backend's UserCreateDTO.
 * Error responses are assumed to carry { message: string } (e.g. "Email '...' is already taken").
 */
export async function createUser(data: {
  firstName: string
  lastName: string
  email: string
  role: string
  password: string
}): Promise<unknown> {
  const base = getBaseUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { message?: string })?.message ?? `HTTP ${response.status}`)
  }
  return response.json()
}

/** Updates a user's profile fields; body mirrors the backend's UserChangeDTO. */
export async function updateUser(
  uuid: string,
  data: { firstName: string; lastName: string; email: string; role: string },
): Promise<unknown> {
  const base = getBaseUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/users/${uuid}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { message?: string })?.message ?? `HTTP ${response.status}`)
  }
  return response.json()
}

/** Updates a user's password. */
export async function updateUserPassword(uuid: string, password: string): Promise<void> {
  const base = getBaseUrl()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/users/${uuid}/password`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { message?: string })?.message ?? `HTTP ${response.status}`)
  }
}

/** Fetches the currently authenticated user's profile. */
export async function fetchCurrentUser(url: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/** Authenticates with the FDP and returns a JWT token. */
export async function fetchToken(
  email: string,
  password: string,
  url: string,
  method: string,
): Promise<string> {
  const response = await fetch(url, {
    method,
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
