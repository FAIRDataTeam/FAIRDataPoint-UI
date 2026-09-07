import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/composables/fetchUtils', () => ({
  fetchRdfTurtle: vi.fn(),
  fetchJSON: vi.fn(),
  request: vi.fn(),
}))

/** Successful HTML response for docs-page checks. */
const htmlResponse = () => new Response('', { headers: { 'content-type': 'text/html' } })

const readFixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

/**
 * apiDocsReady starts when apiDocs.ts is imported, so each test configures fetchUtils mocks before
 * importing a fresh module instance. Reset only those mocks between tests; resetAllMocks() would
 * also clear the shared @/config mock used by getRootUri().
 */
async function importFresh(options: {
  turtleFixtures?: Record<string, string>
  turtleRejects?: Error
  apiDocsImpl?: (url: string) => Promise<unknown>
  docsPageImpl?: (url: string) => Promise<Response>
}) {
  const fetchUtils = await import('../../src/composables/fetchUtils')
  vi.mocked(fetchUtils.fetchRdfTurtle).mockReset()
  vi.mocked(fetchUtils.fetchJSON).mockReset()
  vi.mocked(fetchUtils.request).mockReset()
  const { turtleFixtures = {}, turtleRejects, apiDocsImpl, docsPageImpl } = options
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
  // Tests expecting a docs link must supply a response.
  vi.mocked(fetchUtils.request).mockImplementation(
    docsPageImpl ??
      (async (url: string) => {
        throw new Error(`No docs-page fixture for URL: ${url}`)
      }),
  )
  return { fetchUtils, apiDocs: await import('../../src/composables/apiDocs') }
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
  // Matches FDP declaration order: OpenAPI resolves before Swagger UI is tried.
  const rootTurtleWithApiDocsFirst = `
    @prefix dcat: <http://www.w3.org/ns/dcat#> .
    <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
    <http://localhost/> dcat:endpointDescription <http://localhost/swagger-ui.html> .
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

  it('skips a JSON body that has paths but no openapi field, which the spec requires', async () => {
    const { apiDocs } = await importFresh({
      turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
      apiDocsImpl: async (url) => {
        if (url === 'http://localhost/swagger-ui.html') return { paths: { '/tokens': {} } }
        if (url === 'http://localhost/v3/api-docs') return realDoc()
        throw new Error(`unexpected fetch: ${url}`)
      },
    })

    await apiDocs.apiDocsReady

    expect(apiDocs.jsonApiDocsUrl.value).toBe('http://localhost/v3/api-docs')
  })

  it('bounds both the root Turtle fetch and each candidate fetch with a timeout', async () => {
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
      // Recognized document with no operations.
      apiDocsImpl: async () => ({ openapi: '3.1.0', paths: {} }),
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

  describe('jsonApiDocsUrl / htmlApiDocsUrl', () => {
    it('separates the resolved OpenAPI document from the readable page', async () => {
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
        apiDocsImpl: async (url) =>
          url === 'http://localhost/v3/api-docs' ? realDoc() : '<html>swagger ui</html>',
        docsPageImpl: async () => htmlResponse(),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBe('http://localhost/v3/api-docs')
      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')
    })

    it('verifies the readable page separately when resolution never fetched it', async () => {
      const { apiDocs, fetchUtils } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsFirst },
        apiDocsImpl: async (url) =>
          url === 'http://localhost/v3/api-docs' ? realDoc() : '<html>swagger ui</html>',
        docsPageImpl: async () => htmlResponse(),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBe('http://localhost/v3/api-docs')
      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')
      expect(fetchUtils.fetchJSON).not.toHaveBeenCalledWith(
        'http://localhost/swagger-ui.html',
        expect.any(Number),
      )
      expect(fetchUtils.request).toHaveBeenCalledWith(
        'http://localhost/swagger-ui.html',
        expect.anything(),
      )
    })

    it('binds operations without waiting for the docs page to be verified', async () => {
      // A slow docs page must not block apiDocsReady consumers.
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsFirst },
        apiDocsImpl: async (url) =>
          url === 'http://localhost/v3/api-docs' ? realDoc() : '<html>swagger ui</html>',
        docsPageImpl: () => new Promise<Response>(() => {}), // never settles
      })

      expect(await apiDocs.bindOperation('generateToken')).toEqual({
        url: 'http://localhost/tokens',
        method: 'POST',
      })
      expect(apiDocs.apiDocsSettled.value).toBe(true)
      expect(apiDocs.htmlApiDocsUrl.value).toBeNull()
    })

    it('does not link a declared page that is advertised but no longer served', async () => {
      // FDP advertises Swagger UI even when disabled; only the HTML check catches its 404.
      const { apiDocs, fetchUtils } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsFirst },
        apiDocsImpl: async (url) => {
          if (url === 'http://localhost/v3/api-docs') return realDoc()
          throw new Error(`unexpected fetch: ${url}`)
        },
        docsPageImpl: async () => {
          throw new Error('HTTP 404')
        },
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBe('http://localhost/v3/api-docs')
      expect(apiDocs.htmlApiDocsUrl.value).toBeNull()
      expect(fetchUtils.request).toHaveBeenCalledWith(
        'http://localhost/swagger-ui.html',
        expect.anything(),
      )
    })

    it('still checks a candidate that failed as JSON, since that does not make the page dead', async () => {
      // Rejecting JSON with 406 does not mean HTML is unavailable.
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
        apiDocsImpl: async (url) => {
          if (url === 'http://localhost/v3/api-docs') return realDoc()
          throw new Error('HTTP 406')
        },
        docsPageImpl: async () => htmlResponse(),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBe('http://localhost/v3/api-docs')
      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')
    })

    it('ignores a stale docs-page check that finishes after a refresh', async () => {
      // The first check finishes after the refresh.
      let releaseStale!: (response: Response) => void
      const stale = new Promise<Response>((resolve) => {
        releaseStale = resolve
      })
      let firstCheck = true
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsFirst },
        apiDocsImpl: async (url) =>
          url === 'http://localhost/v3/api-docs' ? realDoc() : '<html>swagger ui</html>',
        docsPageImpl: () => {
          if (!firstCheck) return Promise.resolve(htmlResponse())
          firstCheck = false
          return stale
        },
      })

      await apiDocs.apiDocsReady // first HTML check still pending
      await apiDocs.refreshApiDocs()
      await apiDocs.whenDocsPageReady()
      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')

      // A stale non-HTML response must not clear the refreshed link.
      releaseStale(new Response('{}', { headers: { 'content-type': 'application/json' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')
    })

    it('does not link a declared page that answers with something other than HTML', async () => {
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
        apiDocsImpl: async (url) =>
          url === 'http://localhost/v3/api-docs' ? realDoc() : '<html>swagger ui</html>',
        docsPageImpl: async () =>
          new Response('{}', { headers: { 'content-type': 'application/json' } }),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.htmlApiDocsUrl.value).toBeNull()
    })

    it('accepts a content type in any case and with a charset parameter', async () => {
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
        apiDocsImpl: async (url) =>
          url === 'http://localhost/v3/api-docs' ? realDoc() : '<html>swagger ui</html>',
        docsPageImpl: async () =>
          new Response('', { headers: { 'content-type': 'TEXT/HTML;charset=UTF-8' } }),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')
    })

    it('never offers the /v3/api-docs fallback as the readable page', async () => {
      // The fallback can resolve operations, but it was not advertised as human-facing docs.
      const { apiDocs } = await importFresh({
        turtleFixtures: {
          'http://localhost/': `
            @prefix dcat: <http://www.w3.org/ns/dcat#> .
            <http://localhost/> dcat:endpointDescription <http://localhost/custom/openapi.json> .
          `,
        },
        apiDocsImpl: async (url) => {
          if (url === 'http://localhost/custom/openapi.json') return realDoc()
          throw new Error(`unexpected fetch: ${url}`)
        },
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBe('http://localhost/custom/openapi.json')
      expect(apiDocs.htmlApiDocsUrl.value).toBeNull()
    })

    it('leaves the readable page null when the document is the only candidate', async () => {
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithApiDocsOnly },
        apiDocsImpl: async () => realDoc(),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBe('http://localhost/v3/api-docs')
      expect(apiDocs.htmlApiDocsUrl.value).toBeNull()
    })

    it('still offers a verified page when no candidate is a usable document', async () => {
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
        apiDocsImpl: async () => '<html>not an OpenAPI doc</html>',
        docsPageImpl: async () => htmlResponse(),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBeNull()
      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')
      // This gates the footer warning.
      expect(apiDocs.apiDocsSettled.value).toBe(true)
    })

    it('does not offer a candidate that did not answer at all', async () => {
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
        apiDocsImpl: async () => {
          throw new Error('HTTP 404')
        },
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBeNull()
      expect(apiDocs.htmlApiDocsUrl.value).toBeNull()
      expect(apiDocs.apiDocsSettled.value).toBe(true)
    })

    it('treats an unparseable body as an answer, then verifies it is a page', async () => {
      const { apiDocs } = await importFresh({
        turtleFixtures: { 'http://localhost/': rootTurtleWithBothCandidates },
        apiDocsImpl: async (url) => {
          // Swagger UI is HTML, so response.json() rejects with SyntaxError.
          if (url === 'http://localhost/swagger-ui.html')
            throw new SyntaxError('Unexpected token <')
          throw new Error('HTTP 404')
        },
        docsPageImpl: async () => htmlResponse(),
      })

      await apiDocs.whenDocsPageReady()

      expect(apiDocs.jsonApiDocsUrl.value).toBeNull()
      expect(apiDocs.htmlApiDocsUrl.value).toBe('http://localhost/swagger-ui.html')
    })

    it('settles even when the root Turtle itself cannot be fetched', async () => {
      const { apiDocs } = await importFresh({ turtleRejects: new Error('network error') })

      await apiDocs.apiDocsReady

      expect(apiDocs.jsonApiDocsUrl.value).toBeNull()
      expect(apiDocs.apiDocsSettled.value).toBe(true)
    })
  })
})
