import { bindOperation, type OperationBinding } from './apiDocs'
import { authHeaders, request } from './fetchUtils'

/** Identifies a typed resource; null explicitly identifies the FDP root. */
export type ResourceIdentifier = { resourceType: string; id: string } | null

// Fields used from the backend's member, meta and resource-definition responses.
export type ResourceMember = {
  user: { uuid: string; firstName: string; lastName: string }
  membership: {
    name: string
    permissions: { code: string }[]
  }
}

export type ResourceMeta = {
  member: { membership: ResourceMember['membership'] | null } | null
}

type ResourceDefinition = {
  uuid: string
  name: string
  urlPrefix: string
}

/** Reads resource definitions through their advertised operation. */
async function fetchResourceDefinitions(): Promise<ResourceDefinition[]> {
  const { url, method } = await bindOperation('getResourceDefinitions')
  const response = await request(url, { method, headers: { Accept: 'application/json' } })
  return response.json() as Promise<ResourceDefinition[]>
}

// Share concurrent root lookups (meta and members), but don't retain definitions across visits.
let rootDefinitionRequest: Promise<ResourceDefinition> | null = null

function fetchRootDefinition(): Promise<ResourceDefinition> {
  rootDefinitionRequest ??= fetchResourceDefinitions()
    .then((definitions) => {
      const root = definitions.find((definition) => definition.urlPrefix === '')
      if (!root) throw new Error('The FDP has no root resource definition')
      return root
    })
    .finally(() => {
      rootDefinitionRequest = null
    })
  return rootDefinitionRequest
}

/**
 * Selects an operation ID from the capitalized resource prefix or root definition name.
 * bindOperation resolves its endpoint URL from the API docs.
 */
export async function getResourceOperation(
  resource: ResourceIdentifier,
  action: 'meta' | 'members' | 'put',
) {
  const prefix = action === 'put' ? 'put' : 'get'
  const suffix = action === 'meta' ? 'Meta' : action === 'members' ? 'Members' : ''
  if (resource === null) {
    const root = await fetchRootDefinition()
    return { operationId: `${prefix}${root.name}${suffix}` }
  }

  const { resourceType, id } = resource
  const resourceName = resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
  return { operationId: `${prefix}${resourceName}${suffix}`, pathParams: { uuid: id } }
}

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

/**
 * Fetches a resource's meta; pass null for the root.
 * ResourceMeta describes only the membership fields currently used by the client.
 */
export async function fetchMeta(resource: ResourceIdentifier): Promise<ResourceMeta> {
  const { operationId, pathParams } = await getResourceOperation(resource, 'meta')
  const { url, method } = await bindOperation(operationId, pathParams)
  const response = await request(url, { method, headers: { Accept: 'application/json' } })
  return response.json() as Promise<ResourceMeta>
}

/** Fetches the members of a resource, each with their user and membership; pass null for the root. */
export async function fetchMembers(resource: ResourceIdentifier): Promise<ResourceMember[]> {
  const { operationId, pathParams } = await getResourceOperation(resource, 'members')
  const { url, method } = await bindOperation(operationId, pathParams)
  const response = await request(url, { method, headers: { Accept: 'application/json' } })
  return response.json() as Promise<ResourceMember[]>
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
