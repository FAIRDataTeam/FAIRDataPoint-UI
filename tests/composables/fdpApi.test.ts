import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiDocsFixture: unknown = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/api-docs.json'), 'utf-8'),
)

/** Mocks api-docs discovery plus the resolved request under test. */
function mockApiFetch(
  handleRequest: (url: string, init?: RequestInit) => Promise<unknown> | unknown,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const accept = (init?.headers as Record<string, string> | undefined)?.Accept
    if (accept === 'text/turtle') return { ok: true, text: async () => '' }
    if (url === 'http://localhost/v3/api-docs')
      return { ok: true, json: async () => apiDocsFixture }
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
