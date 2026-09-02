import { bindOperation, type OperationBinding } from '@/composables/apiDocs.ts'

let authToken: string | null = null

/**
 * For /users/current, the signed-in user's profile is edited via current-user operations.
 * Admin routes (/users/:id) use uuid-based user operations instead.
 */
function bindUserOperation(
  currentUserOperationId: string,
  uuidUserOperationId: string,
  uuid?: string,
): Promise<OperationBinding> {
  return !uuid
    ? bindOperation(currentUserOperationId)
    : bindOperation(uuidUserOperationId, { uuid })
}

/** Stores the JWT token to be included in subsequent requests as a Bearer header. */
export function setAuthToken(token: string | null): void {
  authToken = token
}

/** Merges the bearer token into the given headers, if one is set. */
function authHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return authToken ? { ...headers, Authorization: `Bearer ${authToken}` } : headers
}

/** Performs a fetch with the bearer token attached, throwing a basic error on non-2xx responses. */
async function request(
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
export async function fetchApiDocs(uri: string, timeoutMs?: number): Promise<unknown> {
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
  const response = await request(uri, { headers: { Accept: 'application/json' }, signal })
  return response.json()
}

/** Searches resources via the FDP full-text search endpoint. */
// TODO: currently limited to the first 20 results; consider pagination or a larger page size.
export async function searchResources(
  query: string,
  url: string,
  method: string,
): Promise<unknown[]> {
  const searchUrl = new URL(url)
  searchUrl.searchParams.set('page', '0')
  searchUrl.searchParams.set('size', '20')
  const response = await fetch(searchUrl.toString(), {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Search failed (HTTP ${response.status})`)
  return response.json() as Promise<unknown[]>
}

/** Lists all users registered on the FDP. */
export async function fetchUsers(): Promise<unknown[]> {
  const { url } = await bindOperation('getUsers')
  const response = await request(url, { headers: { Accept: 'application/json' } })
  return response.json() as Promise<unknown[]>
}

/** Deletes a user. */
export async function deleteUser(uuid: string): Promise<void> {
  const { url, method } = await bindOperation('deleteUser', { uuid })
  await request(url, { method })
}

/** Fetches a single user's profile. */
export async function fetchUser(uuid?: string): Promise<unknown> {
  const { url } = await bindUserOperation('getUserCurrent', 'getUser', uuid)
  const response = await request(url, { headers: { Accept: 'application/json' } })
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
  const { url, method } = await bindOperation('createUser')
  const response = await fetch(url, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
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
  data: { firstName: string; lastName: string; email: string; role: string },
  uuid?: string,
): Promise<unknown> {
  const { url, method } = await bindUserOperation('putUserCurrent', 'putUser', uuid)
  const response = await fetch(url, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { message?: string })?.message ?? `HTTP ${response.status}`)
  }
  return response.json()
}

/** Updates a user's password. */
export async function updateUserPassword(password: string, uuid?: string): Promise<void> {
  const { url, method } = await bindUserOperation('putUserCurrentPassword', 'putUserPassword', uuid)
  const response = await fetch(url, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { message?: string })?.message ?? `HTTP ${response.status}`)
  }
}

/** Authenticates with the FDP and returns a JWT token. */
export async function fetchToken(email: string, password: string): Promise<string> {
  const { url, method } = await bindOperation('generateToken')
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
