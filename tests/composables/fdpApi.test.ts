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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('putResource', () => {
  const docs = {
    openapi: '3.0.1',
    paths: {
      '/definitions': { get: { operationId: 'getResourceDefinitions' } },
      '/root-update': { put: { operationId: 'putResearch Hub' } },
      '/update/{uuid}': { put: { operationId: 'putCatalog' } },
      '/root-meta': { get: { operationId: 'getResearch HubMeta' } },
    },
  }
  const definitions = [{ uuid: 'root', name: 'Research Hub', urlPrefix: '' }]
  const resource = { resourceType: 'catalog', id: 'abc' }
  const turtle = '<urn:resource> <urn:title> "Edited" .'

  it.each([
    { target: resource, url: 'http://localhost/update/abc' },
    { target: null, url: 'http://localhost/root-update' },
  ])('saves Turtle to $url with authentication', async ({ target, url }) => {
    const fetch = mockApiFetch(
      (url) => (url.endsWith('/definitions') ? okJson(definitions)() : { ok: true }),
      docs,
    )
    vi.stubGlobal('fetch', fetch)
    const { putResource } = await import('../../src/composables/fdpApi')
    const { setAuthToken } = await import('../../src/composables/fetchUtils')
    setAuthToken('test-token')
    await putResource(target, turtle)
    expect(fetch).toHaveBeenCalledWith(url, {
      method: 'PUT',
      body: turtle,
      signal: expect.any(AbortSignal),
      headers: { 'Content-Type': 'text/turtle', Authorization: 'Bearer test-token' },
    })
  })

  it.each(['Gateway timed out', ''])('reports an HTTP timeout response (%s)', async (body) => {
    vi.stubGlobal(
      'fetch',
      mockApiFetch(() => ({ ok: false, status: 504, text: async () => body }), docs),
    )
    const { putResource } = await import('../../src/composables/fdpApi')
    await expect(putResource(resource, turtle)).rejects.toThrow(body || 'HTTP 504')
  })

  it.each(['put', 'definitions', 'error body'])(
    'bounds a stalled %s and permits a subsequent save',
    async (stage) => {
      let release!: (value: unknown) => void
      const stalled = new Promise((resolve) => {
        release = resolve
      })
      let hanging = true
      let requestSignal: AbortSignal | undefined
      const fetch = mockApiFetch((url, init) => {
        const isDefinition = url.endsWith('/definitions')
        if (hanging && (stage === 'definitions') === isDefinition) {
          requestSignal = init?.signal ?? undefined
          if (stage === 'error body') return { ok: false, status: 504, text: () => stalled }
          return stalled
        }
        return isDefinition ? okJson(definitions)() : { ok: true }
      }, docs)
      vi.stubGlobal('fetch', fetch)
      const { putResource } = await import('../../src/composables/fdpApi')
      const { apiDocsReady } = await import('../../src/composables/apiDocs')
      await apiDocsReady
      vi.useFakeTimers()
      const target = stage === 'definitions' ? null : resource
      const result = expect(putResource(target, turtle, 100)).rejects.toThrow(
        'The save request timed out. Check the resource before retrying.',
      )
      await vi.advanceTimersByTimeAsync(100)
      await result
      expect(requestSignal?.aborted).toBe(true)
      // Even a late response must not start a PUT after the deadline.
      release(stage === 'error body' ? 'Late error' : await okJson(definitions)())
      await vi.advanceTimersByTimeAsync(0)
      if (stage === 'definitions') {
        expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
      }
      hanging = false
      await expect(putResource(target, turtle, 100)).resolves.toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('keeps a concurrent read independent of the save timeout', async () => {
    let release!: (value: unknown) => void
    const stalled = new Promise((resolve) => {
      release = resolve
    })
    // Model fetch cancellation for the save's lookup; the read has a separate request.
    const fetch = mockApiFetch((url, init) => {
      if (!url.endsWith('/definitions')) return okJson({ member: null })()
      const signal = init?.signal
      if (!signal) return stalled
      return Promise.race([
        stalled,
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason as Error))
        }),
      ])
    }, docs)
    vi.stubGlobal('fetch', fetch)
    const { putResource, fetchMeta } = await import('../../src/composables/fdpApi')
    const { apiDocsReady } = await import('../../src/composables/apiDocs')
    await apiDocsReady
    vi.useFakeTimers()

    const saveResult = expect(putResource(null, turtle, 100)).rejects.toThrow('timed out')
    // The read's lookup must continue after the save aborts its own lookup.
    const metaResult = fetchMeta(null)
    await vi.advanceTimersByTimeAsync(100)
    await saveResult
    release(await okJson(definitions)())
    await expect(metaResult).resolves.toEqual({ member: null })
  })
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
  // /meta or /members to the resource URI. The root definition also has a custom name.
  const resourceApiDocs = {
    openapi: '3.0.1',
    paths: {
      '/definitions-list': { get: { operationId: 'getResourceDefinitions' } },
      '/root-status': { get: { operationId: 'getResearch HubMeta' } },
      '/root-access': { get: { operationId: 'getResearch HubMembers' } },
      '/status/{uuid}': { get: { operationId: 'getCatalogMeta' } },
      '/access/{uuid}': { get: { operationId: 'getCatalogMembers' } },
      '/custom-status/{uuid}': { get: { operationId: 'getResearchDataMeta' } },
    },
  }
  const definitions = [
    { uuid: 'catalog-definition', name: 'Catalog', urlPrefix: 'catalog' },
    { uuid: 'root-definition', name: 'Research Hub', urlPrefix: '' },
  ]
  const meta = { member: { membership: { name: 'Owner', permissions: [{ code: 'W' }] } } }
  const members = [
    {
      user: { uuid: 'tesla', firstName: 'Nikola', lastName: 'Tesla' },
      membership: { name: 'Owner', permissions: [{ code: 'W' }] },
    },
  ]
  const getJson = { method: 'GET', headers: { Accept: 'application/json' } }

  it('binds root meta and members using the configured root name, sharing the definition request', async () => {
    const mockFetch = mockApiFetch((url) => {
      if (url.endsWith('/definitions-list')) return okJson(definitions)()
      if (url.endsWith('/root-status')) return okJson(meta)()
      if (url.endsWith('/root-access')) return okJson(members)()
      throw new Error(`Unexpected request: ${url}`)
    }, resourceApiDocs)
    vi.stubGlobal('fetch', mockFetch)
    const { fetchMeta, fetchMembers } = await import('../../src/composables/fdpApi')

    expect(await Promise.all([fetchMeta(null), fetchMembers(null)])).toEqual([meta, members])
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/definitions-list', getJson)
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/definitions-list'))).toHaveLength(
      1,
    )
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/root-status', getJson)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/root-access', getJson)
  })

  it('binds typed meta and members to advertised URLs without needing definitions', async () => {
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
    expect(mockFetch.mock.calls.some(([url]) => url.endsWith('/definitions-list'))).toBe(false)
  })

  it('supports custom prefixes and lets bindOperation encode the resource ID', async () => {
    const mockFetch = mockApiFetch(okJson(meta), resourceApiDocs)
    vi.stubGlobal('fetch', mockFetch)
    const { fetchMeta } = await import('../../src/composables/fdpApi')

    await fetchMeta({ resourceType: 'researchData', id: 'a b' })
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/custom-status/a%20b', getJson)
  })

  it('uses the selected operation ID for availability checks', async () => {
    vi.stubGlobal('fetch', mockApiFetch(okJson(definitions), resourceApiDocs))
    const { getResourceOperation } = await import('../../src/composables/fdpApi')
    const { apiDocsReady, isOperationOffered } = await import('../../src/composables/apiDocs')
    await apiDocsReady

    const offered = await getResourceOperation({ resourceType: 'catalog', id: 'abc' }, 'meta')
    const absent = await getResourceOperation({ resourceType: 'dataset', id: 'abc' }, 'members')
    expect(isOperationOffered(offered.operationId)).toBe(true)
    expect(isOperationOffered(absent.operationId)).toBe(false)
  })

  it('resolves put operation IDs the same way, with no suffix', async () => {
    vi.stubGlobal('fetch', mockApiFetch(okJson(definitions), resourceApiDocs))
    const { getResourceOperation } = await import('../../src/composables/fdpApi')
    const { apiDocsReady, isOperationOffered } = await import('../../src/composables/apiDocs')
    await apiDocsReady

    const typed = await getResourceOperation({ resourceType: 'catalog', id: 'abc' }, 'put')
    expect(typed.operationId).toBe('putCatalog')
    expect(isOperationOffered(typed.operationId)).toBe(false)
  })

  it('resolves root PUT from the configured definition name without path parameters', async () => {
    vi.stubGlobal(
      'fetch',
      mockApiFetch(okJson(definitions), {
        ...resourceApiDocs,
        paths: {
          ...resourceApiDocs.paths,
          '/root-update': { put: { operationId: 'putResearch Hub' } },
        },
      }),
    )
    const { getResourceOperation } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    const operation = await getResourceOperation(null, 'put')
    expect(operation).toEqual({ operationId: 'putResearch Hub' })
    expect(await bindOperation(operation.operationId)).toEqual({
      url: 'http://localhost/root-update',
      method: 'PUT',
    })
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

  it('does not guess a root name when definitions are not advertised', async () => {
    const handleRequest = vi.fn(okJson(meta))
    vi.stubGlobal(
      'fetch',
      mockApiFetch(handleRequest, {
        openapi: '3.0.1',
        paths: { '/meta': { get: { operationId: 'getFAIR Data PointMeta' } } },
      }),
    )
    const { fetchMeta } = await import('../../src/composables/fdpApi')

    await expect(fetchMeta(null)).rejects.toThrow(
      "Operation 'getResourceDefinitions' is not offered",
    )
    expect(handleRequest).not.toHaveBeenCalled()
  })

  it('reports a missing root definition', async () => {
    vi.stubGlobal('fetch', mockApiFetch(okJson([definitions[0]]), resourceApiDocs))
    const { fetchMeta } = await import('../../src/composables/fdpApi')
    await expect(fetchMeta(null)).rejects.toThrow('no root resource definition')
  })

  it('allows a later root lookup to retry after a failed definition request', async () => {
    let failed = false
    const mockFetch = mockApiFetch((url) => {
      if (url.endsWith('/definitions-list')) {
        if (!failed) {
          failed = true
          return { ok: false, status: 503 }
        }
        return okJson(definitions)()
      }
      return okJson(meta)()
    }, resourceApiDocs)
    vi.stubGlobal('fetch', mockFetch)
    const { fetchMeta } = await import('../../src/composables/fdpApi')

    await expect(fetchMeta(null)).rejects.toThrow('HTTP 503')
    expect(await fetchMeta(null)).toEqual(meta)
  })

  it('uses fresh root definitions on subsequent lookups', async () => {
    let rootName = 'Research Hub'
    const mockFetch = mockApiFetch(
      (url) => {
        if (url.endsWith('/definitions-list')) {
          return okJson([{ uuid: 'root-definition', name: rootName, urlPrefix: '' }])()
        }
        return okJson(meta)()
      },
      {
        ...resourceApiDocs,
        paths: {
          ...resourceApiDocs.paths,
          '/renamed-status': { get: { operationId: 'getRenamed HubMeta' } },
        },
      },
    )
    vi.stubGlobal('fetch', mockFetch)
    const { fetchMeta } = await import('../../src/composables/fdpApi')

    await fetchMeta(null)
    rootName = 'Renamed Hub'
    await fetchMeta(null)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/renamed-status', getJson)
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
