import { bindOperation, getOperationId, type OperationBinding } from './apiDocs'
import { authHeaders, request } from './fetchUtils'

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

/** Identifies a typed resource; null explicitly identifies the FDP root. */
export type ResourceIdentifier = { resourceType: string; id: string } | null

// Fields used from the backend's member and meta responses.
export type ResourceMember = {
  user: { uuid: string; firstName: string; lastName: string }
  membership: {
    name: string
  }
}

export type ResourceMeta = {
  member: { membership: ResourceMember['membership'] | null } | null
}

/**
 * Resolves a resource operation from the capitalized prefix, or the root GET's operation ID.
 */
async function bindResourceOperation(
  resource: ResourceIdentifier,
  suffix: 'Meta' | 'Members',
): Promise<OperationBinding> {
  if (resource === null) {
    const rootOperationId = await getOperationId('/', 'get')
    return bindOperation(`${rootOperationId}${suffix}`)
  }

  const { resourceType, id } = resource
  const resourceName = resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
  return bindOperation(`get${resourceName}${suffix}`, { uuid: id })
}

/**
 * Fetches a resource's meta; pass null for the root.
 * ResourceMeta describes only the membership fields currently used by the client.
 */
export async function fetchMeta(resource: ResourceIdentifier): Promise<ResourceMeta> {
  const { url, method } = await bindResourceOperation(resource, 'Meta')
  const response = await request(url, { method, headers: { Accept: 'application/json' } })
  return response.json() as Promise<ResourceMeta>
}

/** Fetches the members of a resource, each with their user and membership; pass null for the root. */
export async function fetchMembers(resource: ResourceIdentifier): Promise<ResourceMember[]> {
  const { url, method } = await bindResourceOperation(resource, 'Members')
  const response = await request(url, { method, headers: { Accept: 'application/json' } })
  return response.json() as Promise<ResourceMember[]>
}

/** Searches resources via the FDP full-text search endpoint. */
// TODO: currently limited to the first 20 results; consider pagination or a larger page size.
export async function searchResources(query: string): Promise<unknown[]> {
  // search_1, not search: springdoc renames one of the two backend search() methods on collision.
  const { url, method } = await bindOperation('search_1')
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
