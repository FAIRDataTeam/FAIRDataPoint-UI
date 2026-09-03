import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/composables/fetchUtils', () => ({ fetchRdfTurtle: vi.fn(), fetchJSON: vi.fn() }))

const readFixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

/**
 * apiDocsReady starts when apiDocs.ts is imported, so each test configures fdpApi mocks before
 * importing a fresh module instance. Reset only those fdpApi mocks between tests; resetAllMocks()
 * would also clear the shared @/config mock used by getRootUri().
 */
async function importFresh(options: {
  turtleFixtures?: Record<string, string>
  turtleRejects?: Error
  apiDocsImpl?: (url: string) => Promise<unknown>
}) {
  const fetchUtils = await import('../../src/composables/fetchUtils')
  vi.mocked(fetchUtils.fetchRdfTurtle).mockReset()
  vi.mocked(fetchUtils.fetchJSON).mockReset()
  const { turtleFixtures = {}, turtleRejects, apiDocsImpl } = options
  if (turtleRejects) {
    vi.mocked(fetchUtils.fetchRdfTurtle).mockRejectedValue(turtleRejects)
  } else {
    vi.mocked(fetchUtils.fetchRdfTurtle).mockImplementation(async (uri: string) => {
      const content = turtleFixtures[uri]
      if (!content) throw new Error(`No fixture for URI: ${uri}`)
      return content
    })
  }
  if (apiDocsImpl) vi.mocked(fetchUtils.fetchJSON).mockImplementation(apiDocsImpl)
  return { fetchUtils: fetchUtils, apiDocs: await import('../../src/composables/apiDocs') }
}

beforeEach(() => {
  vi.resetModules()
})

describe('discoverApiDocsUrls', () => {
  it('returns the declared dcat:endpointDescription when already at the root', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: {
        'http://localhost': `
          @prefix dcat: <http://www.w3.org/ns/dcat#> .
          <http://localhost> dcat:endpointDescription <http://localhost/v3/api-docs> .
        `,
      },
    })

    expect(await apiDocs.discoverApiDocsUrls('http://localhost')).toEqual([
      'http://localhost/v3/api-docs',
    ])
  })

  it('returns just the /v3/api-docs fallback when the root has no dcat:endpointDescription', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: {
        'http://localhost': `
          @prefix dct: <http://purl.org/dc/terms/> .
          <http://localhost> dct:title "My FAIR Data Point" .
        `,
      },
    })

    expect(await apiDocs.discoverApiDocsUrls('http://localhost')).toEqual([
      'http://localhost/v3/api-docs',
    ])
  })

  it('returns multiple declared values in order, matching FDP 1.22+ which advertises both its OpenAPI doc and Swagger UI page', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: {
        'http://localhost': `
          @prefix dcat: <http://www.w3.org/ns/dcat#> .
          <http://localhost> dcat:endpointDescription <http://localhost/v3/api-docs> .
          <http://localhost> dcat:endpointDescription <http://localhost/swagger-ui.html> .
        `,
      },
    })

    expect(await apiDocs.discoverApiDocsUrls('http://localhost')).toEqual([
      'http://localhost/v3/api-docs',
      'http://localhost/swagger-ui.html',
    ])
  })

  it('resolves the /v3/api-docs fallback under a deployment subpath, with or without a trailing slash', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: {
        'https://example.org/fairdatapoint': `
          @prefix dct: <http://purl.org/dc/terms/> .
          <https://example.org/fairdatapoint> dct:title "My FAIR Data Point" .
        `,
        'https://example.org/fairdatapoint/': `
          @prefix dct: <http://purl.org/dc/terms/> .
          <https://example.org/fairdatapoint/> dct:title "My FAIR Data Point" .
        `,
      },
    })

    expect(await apiDocs.discoverApiDocsUrls('https://example.org/fairdatapoint')).toEqual([
      'https://example.org/fairdatapoint/v3/api-docs',
    ])
    expect(await apiDocs.discoverApiDocsUrls('https://example.org/fairdatapoint/')).toEqual([
      'https://example.org/fairdatapoint/v3/api-docs',
    ])
  })
})

describe('resolveOperation', () => {
  const doc: unknown = JSON.parse(readFixture('api-docs.json'))

  it('finds the path and uppercased method for a matching operationId', async () => {
    const { apiDocs } = await importFresh({})
    expect(apiDocs.resolveOperation(doc, 'generateToken')).toEqual({
      path: '/tokens',
      method: 'POST',
    })
  })

  it('finds an operationId among multiple methods on the same path', async () => {
    const { apiDocs } = await importFresh({})
    expect(apiDocs.resolveOperation(doc, 'getUser')).toEqual({
      path: '/users/{uuid}',
      method: 'GET',
    })
    expect(apiDocs.resolveOperation(doc, 'putUser')).toEqual({
      path: '/users/{uuid}',
      method: 'PUT',
    })
    expect(apiDocs.resolveOperation(doc, 'deleteUser')).toEqual({
      path: '/users/{uuid}',
      method: 'DELETE',
    })
  })

  it('returns null for an unknown operationId', async () => {
    const { apiDocs } = await importFresh({})
    expect(apiDocs.resolveOperation(doc, 'deleteEverything')).toBeNull()
  })

  it('returns null when the document has no paths', async () => {
    const { apiDocs } = await importFresh({})
    expect(apiDocs.resolveOperation({}, 'generateToken')).toBeNull()
    expect(apiDocs.resolveOperation(null, 'generateToken')).toBeNull()
  })
})

describe('apiDocsReady / isOperationOffered / bindOperation', () => {
  // Every test here relies on getRootUri() -> 'http://localhost/', from the global @/config mock
  // in tests/vitest.setup.ts.
  const rootTurtleWithBothCandidates = `
    @prefix dcat: <http://www.w3.org/ns/dcat#> .
    <http://localhost/> dcat:endpointDescription <http://localhost/swagger-ui.html> .
    <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
  `
  const rootTurtleWithApiDocsOnly = `
    @prefix dcat: <http://www.w3.org/ns/dcat#> .
    <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
  `
  const realDoc = () => JSON.parse(readFixture('api-docs.json'))

  it('resolves a usable document, skipping a declared candidate that is not a usable OpenAPI document', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
      apiDocsImpl: async (url) => {
        if (url === 'http://localhost/swagger-ui.html') return '<html>not an OpenAPI doc</html>'
        if (url === 'http://localhost/v3/api-docs') return realDoc()
        throw new Error(`unexpected fetch: ${url}`)
      },
    })

    await apiDocs.apiDocsReady

    expect(apiDocs.isOperationOffered('generateToken')).toBe(true)
    expect(await apiDocs.bindOperation('generateToken')).toEqual({
      url: 'http://localhost/tokens',
      method: 'POST',
    })
  })

  it('bounds both the root Turtle fetchUtils and each candidate fetchUtils with a timeout', async () => {
    const { apiDocs, fetchUtils } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsOnly },
      apiDocsImpl: async () => realDoc(),
    })

    await apiDocs.apiDocsReady

    // Verify timeout wiring without waiting for a real hang.
    expect(fetchUtils.fetchRdfTurtle).toHaveBeenCalledWith('http://localhost/', expect.any(Number))
    expect(fetchUtils.fetchJSON).toHaveBeenCalledWith(
      'http://localhost/v3/api-docs',
      expect.any(Number),
    )
  })

  it('fails closed (isOperationOffered false) when none of the candidates are usable', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
      apiDocsImpl: async () => '<html>not an OpenAPI doc</html>',
    })

    await apiDocs.apiDocsReady

    expect(apiDocs.apiDocs.value).toBeNull()
    expect(apiDocs.isOperationOffered('generateToken')).toBe(false)
    await expect(apiDocs.bindOperation('generateToken')).rejects.toThrow(
      "Operation 'generateToken' is not offered",
    )
  })

  it('fails closed when the api-docs cannot be discovered at all', async () => {
    const { apiDocs } = await importFresh({ turtleRejects: new Error('network error') })

    await apiDocs.apiDocsReady

    expect(apiDocs.apiDocs.value).toBeNull()
    expect(apiDocs.isOperationOffered('generateToken')).toBe(false)
  })

  it('refreshApiDocs re-resolves against the current state', async () => {
    const { apiDocs, fetchUtils } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsOnly },
      apiDocsImpl: async () => ({ paths: {} }),
    })

    await apiDocs.apiDocsReady
    expect(apiDocs.isOperationOffered('generateToken')).toBe(false)

    vi.mocked(fetchUtils.fetchJSON).mockResolvedValue(realDoc())
    await apiDocs.refreshApiDocs()

    expect(apiDocs.isOperationOffered('generateToken')).toBe(true)
  })

  it('substitutes and URL-encodes pathParams into the resolved path template', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsOnly },
      apiDocsImpl: async () => realDoc(),
    })

    expect(await apiDocs.bindOperation('deleteUser', { uuid: 'abc-123' })).toEqual({
      url: 'http://localhost/users/abc-123',
      method: 'DELETE',
    })
    expect(await apiDocs.bindOperation('deleteUser', { uuid: 'a/b c' })).toEqual({
      url: 'http://localhost/users/a%2Fb%20c',
      method: 'DELETE',
    })
  })

  it('resolves bindOperation against a root deployed under a subpath, not just the origin', async () => {
    // Deliberately overrides the global @/config mock (from tests/vitest.setup.ts) for this one
    // test only, restored in `finally`. Unlike fetchRdfTurtle/fetchJSON, this mock is shared
    // by every other test in this file via getRootUri(), so it must not leak past this test.
    const configModule = await import('@/config')
    vi.mocked(configModule.getClientConfig).mockReturnValue({
      apiEndpointUrl: 'https://example.org/fairdatapoint',
    })
    try {
      const { apiDocs } = await importFresh({
        turtleFixtures: {
          'https://example.org/fairdatapoint/': `
            @prefix dcat: <http://www.w3.org/ns/dcat#> .
            <https://example.org/fairdatapoint/> dcat:endpointDescription <https://example.org/fairdatapoint/v3/api-docs> .
          `,
        },
        apiDocsImpl: async () => realDoc(),
      })

      // Bug this pins down: new URL('/tokens', 'https://example.org/fairdatapoint/') would
      // silently drop the /fairdatapoint subpath, resolving to https://example.org/tokens.
      expect(await apiDocs.bindOperation('generateToken')).toEqual({
        url: 'https://example.org/fairdatapoint/tokens',
        method: 'POST',
      })
    } finally {
      vi.mocked(configModule.getClientConfig).mockReturnValue({
        apiEndpointUrl: 'http://localhost',
      })
    }
  })

  it('throws when a required path param is missing', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsOnly },
      apiDocsImpl: async () => realDoc(),
    })

    await expect(apiDocs.bindOperation('deleteUser', {})).rejects.toThrow(
      "Missing path parameter 'uuid'",
    )
  })

  it('bindOperation awaits apiDocsReady itself, without a caller having to await it separately', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsOnly },
      apiDocsImpl: async () => realDoc(),
    })

    // Deliberately not awaiting apiDocsReady here; bindOperation must do that internally.
    expect(await apiDocs.bindOperation('generateToken')).toEqual({
      url: 'http://localhost/tokens',
      method: 'POST',
    })
  })

  it('bindOperation rejects when the requested operation is not offered', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsOnly },
      apiDocsImpl: async () => realDoc(),
    })

    await expect(apiDocs.bindOperation('deleteEverything')).rejects.toThrow(
      "Operation 'deleteEverything' is not offered",
    )
  })
})
