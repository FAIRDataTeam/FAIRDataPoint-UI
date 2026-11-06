import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiDocsFixture: unknown = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/api-docs.json'), 'utf-8'),
)

/** Mocks api-docs discovery plus the resolved request under test. */
function mockApiFetch(
  handleRequest: (url: string, init?: RequestInit) => Promise<unknown> | unknown,
  apiDocs: unknown = apiDocsFixture,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const accept = (init?.headers as Record<string, string> | undefined)?.Accept
    if (accept === 'text/turtle') return { ok: true, text: async () => '' }
    if (url === 'http://localhost/v3/api-docs') return { ok: true, json: async () => apiDocs }
    return handleRequest(url, init)
  })
}

const okJson =
  (body: unknown = {}) =>
  async () => ({ ok: true, json: async () => body })

// apiDocsReady starts when fdpApi.ts imports apiDocs.ts, so each test must install its fetch
// mock before dynamically importing fdpApi.ts.
beforeEach(() => {
  vi.resetModules()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchResources', () => {
  it('posts the query to the resolved search endpoint with paging params', async () => {
    const searchResult = [
      { uri: 'http://localhost/dataset/1', types: [], title: 'Dataset 1', description: null },
    ]
    const mockFetch = mockApiFetch(async () => ({ ok: true, json: async () => searchResult }))
    vi.stubGlobal('fetch', mockFetch)
    const { searchResources } = await import('../../src/composables/fdpApi')
    const results = await searchResources('dataset')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/search?page=0&size=20', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'dataset' }),
    })
    expect(results).toEqual(searchResult)
  })

  it('throws "Search failed" with the status on HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      mockApiFetch(async () => ({ ok: false, status: 500 })),
    )
    const { searchResources } = await import('../../src/composables/fdpApi')
    await expect(searchResources('anything')).rejects.toThrow('Search failed (HTTP 500)')
  })
})

describe('resource operations', () => {
  // Deliberately different endpoint paths: the client must follow operation IDs, not append
  // /meta or /members to the resource URI. The root also has a custom name.
  const resourceApiDocs = {
    openapi: '3.0.1',
    paths: {
      '/': { get: { operationId: 'getResearch Hub' } },
      '/root-status': { get: { operationId: 'getResearch HubMeta' } },
      '/root-access': { get: { operationId: 'getResearch HubMembers' } },
      '/status/{uuid}': { get: { operationId: 'getCatalogMeta' } },
      '/access/{uuid}': { get: { operationId: 'getCatalogMembers' } },
      '/custom-status/{uuid}': { get: { operationId: 'getResearchDataMeta' } },
    },
  }
  const meta = { member: { membership: { name: 'Owner' } } }
  const members = [
    {
      user: { uuid: 'tesla', firstName: 'Nikola', lastName: 'Tesla' },
      membership: { name: 'Owner' },
    },
  ]
  const getJson = { method: 'GET', headers: { Accept: 'application/json' } }

  it('binds root meta and members using the root GET operation name', async () => {
    const mockFetch = mockApiFetch((url) => {
      if (url.endsWith('/root-status')) return okJson(meta)()
      if (url.endsWith('/root-access')) return okJson(members)()
      throw new Error(`Unexpected request: ${url}`)
    }, resourceApiDocs)
    vi.stubGlobal('fetch', mockFetch)
    const { fetchMeta, fetchMembers } = await import('../../src/composables/fdpApi')

    expect(await fetchMeta(null)).toEqual(meta)
    expect(await fetchMembers(null)).toEqual(members)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/root-status', getJson)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/root-access', getJson)
  })

  it('binds typed meta and members to advertised URLs', async () => {
    const mockFetch = mockApiFetch((url) => {
      if (url.endsWith('/status/abc')) return okJson(meta)()
      if (url.endsWith('/access/abc')) return okJson(members)()
      throw new Error(`Unexpected request: ${url}`)
    }, resourceApiDocs)
    vi.stubGlobal('fetch', mockFetch)
    const { fetchMeta, fetchMembers } = await import('../../src/composables/fdpApi')

    expect(await fetchMeta({ resourceType: 'catalog', id: 'abc' })).toEqual(meta)
    expect(await fetchMembers({ resourceType: 'catalog', id: 'abc' })).toEqual(members)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/status/abc', getJson)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/access/abc', getJson)
  })

  it('supports custom prefixes and lets bindOperation encode the resource ID', async () => {
    const mockFetch = mockApiFetch(okJson(meta), resourceApiDocs)
    vi.stubGlobal('fetch', mockFetch)
    const { fetchMeta } = await import('../../src/composables/fdpApi')

    await fetchMeta({ resourceType: 'researchData', id: 'a b' })
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/custom-status/a%20b', getJson)
  })

  it('refuses an unadvertised operation even if a conventional endpoint path exists', async () => {
    const handleRequest = vi.fn(okJson(meta))
    vi.stubGlobal(
      'fetch',
      mockApiFetch(handleRequest, {
        openapi: '3.0.1',
        paths: { '/catalog/{uuid}/meta': { get: { operationId: 'someOtherOperation' } } },
      }),
    )
    const { fetchMeta } = await import('../../src/composables/fdpApi')

    await expect(fetchMeta({ resourceType: 'catalog', id: 'abc' })).rejects.toThrow(
      "Operation 'getCatalogMeta' is not offered",
    )
    expect(handleRequest).not.toHaveBeenCalled()
  })

  it('does not guess a root name when the root GET is not advertised', async () => {
    const handleRequest = vi.fn(okJson(meta))
    vi.stubGlobal(
      'fetch',
      mockApiFetch(handleRequest, {
        openapi: '3.0.1',
        paths: { '/meta': { get: { operationId: 'getFAIR Data PointMeta' } } },
      }),
    )
    const { fetchMeta } = await import('../../src/composables/fdpApi')

    await expect(fetchMeta(null)).rejects.toThrow('No GET / operation is offered')
    expect(handleRequest).not.toHaveBeenCalled()
  })
})

/**
 * Passing a uuid selects the admin operation on /users/{uuid}; omitting it selects the current-user
 * operation on /users/current. The two are not interchangeable: the backend restricts the uuid
 * variants to admins, and only the uuid variants accept a role change.
 */
describe('current-user and uuid user operations', () => {
  const uuid = '7e64818d-6276-46fb-8bb1-732e6e09f7e9'

  it('fetchUser reads the current user or a user by uuid', async () => {
    const mockFetch = mockApiFetch(okJson())
    vi.stubGlobal('fetch', mockFetch)
    const { fetchUser } = await import('../../src/composables/fdpApi')

    await fetchUser()
    await fetchUser(uuid)

    const headers = { Accept: 'application/json' }
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/users/current', { headers })
    expect(mockFetch).toHaveBeenCalledWith(`http://localhost/users/${uuid}`, { headers })
  })

  it('updateUser writes the current user profile or a user by uuid', async () => {
    const mockFetch = mockApiFetch(okJson())
    vi.stubGlobal('fetch', mockFetch)
    const { updateUser } = await import('../../src/composables/fdpApi')
    const profile = {
      firstName: 'Albert',
      lastName: 'Einstein',
      email: 'albert.einstein@example.com',
      role: 'USER',
    }

    await updateUser(profile)
    await updateUser(profile, uuid)

    const init = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(profile),
    }
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/users/current', init)
    expect(mockFetch).toHaveBeenCalledWith(`http://localhost/users/${uuid}`, init)
  })

  it('updateUserPassword writes the current user password or a user password by uuid', async () => {
    const mockFetch = mockApiFetch(okJson())
    vi.stubGlobal('fetch', mockFetch)
    const { updateUserPassword } = await import('../../src/composables/fdpApi')

    await updateUserPassword('secret')
    await updateUserPassword('secret', uuid)

    const init = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret' }),
    }
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/users/current/password', init)
    expect(mockFetch).toHaveBeenCalledWith(`http://localhost/users/${uuid}/password`, init)
  })
})
