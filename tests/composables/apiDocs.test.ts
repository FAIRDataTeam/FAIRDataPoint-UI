import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { discoverApiDocsUrls, resolveOperation } from '../../src/composables/apiDocs'
import { fetchRdfTurtle } from '../../src/composables/fdpApi'

vi.mock('../../src/composables/fdpApi', () => ({ fetchRdfTurtle: vi.fn(), fetchApiDocs: vi.fn() }))

const readFixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

function setupFetchFixtures(fixtureMap: Record<string, string>) {
  vi.mocked(fetchRdfTurtle).mockImplementation(async (uri: string) => {
    const content = fixtureMap[uri]
    if (!content) throw new Error(`No fixture for URI: ${uri}`)
    return content
  })
}

describe('discoverApiDocsUrls', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the declared dcat:endpointDescription when already at the root', async () => {
    setupFetchFixtures({
      'http://localhost': `
        @prefix dcat: <http://www.w3.org/ns/dcat#> .
        <http://localhost> dcat:endpointDescription <http://localhost/v3/api-docs> .
      `,
    })

    expect(await discoverApiDocsUrls('http://localhost')).toEqual(['http://localhost/v3/api-docs'])
    expect(fetchRdfTurtle).toHaveBeenCalledTimes(1)
  })

  it('returns just the /v3/api-docs fallback when the root has no dcat:endpointDescription', async () => {
    setupFetchFixtures({
      'http://localhost': `
        @prefix dct: <http://purl.org/dc/terms/> .
        <http://localhost> dct:title "My FAIR Data Point" .
      `,
    })

    expect(await discoverApiDocsUrls('http://localhost')).toEqual(['http://localhost/v3/api-docs'])
  })

  it('returns multiple declared values in order, matching FDP 1.22+ which advertises both its OpenAPI doc and Swagger UI page', async () => {
    setupFetchFixtures({
      'http://localhost': `
        @prefix dcat: <http://www.w3.org/ns/dcat#> .
        <http://localhost> dcat:endpointDescription <http://localhost/v3/api-docs> .
        <http://localhost> dcat:endpointDescription <http://localhost/swagger-ui.html> .
      `,
    })

    expect(await discoverApiDocsUrls('http://localhost')).toEqual([
      'http://localhost/v3/api-docs',
      'http://localhost/swagger-ui.html',
    ])
  })
})

describe('bindOperation', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('skips a declared candidate that is not a usable OpenAPI document and uses the next one', async () => {
    const { fetchRdfTurtle, fetchApiDocs } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockResolvedValue(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <http://localhost/> dcat:endpointDescription <http://localhost/swagger-ui.html> .
      <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
    `)
    vi.mocked(fetchApiDocs).mockImplementation(async (url: string) => {
      if (url === 'http://localhost/swagger-ui.html') return '<html>not an OpenAPI doc</html>'
      if (url === 'http://localhost/v3/api-docs') return JSON.parse(readFixture('api-docs.json'))
      throw new Error(`unexpected fetch: ${url}`)
    })

    expect(await bindOperation('http://localhost/', 'generateToken')).toEqual({
      url: 'http://localhost/tokens',
      method: 'POST',
    })
    expect(fetchApiDocs).toHaveBeenCalledWith('http://localhost/swagger-ui.html')
    expect(fetchApiDocs).toHaveBeenCalledWith('http://localhost/v3/api-docs')
  })

  it('rejects when none of the candidates are usable', async () => {
    const { fetchRdfTurtle, fetchApiDocs } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockResolvedValue(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <http://localhost/> dcat:endpointDescription <http://localhost/swagger-ui.html> .
    `)
    vi.mocked(fetchApiDocs).mockResolvedValue('<html>not an OpenAPI doc</html>')

    await expect(bindOperation('http://localhost/', 'generateToken')).rejects.toThrow(
      'No usable OpenAPI document found',
    )
  })

  it('resolves with the url/method when the operation is found', async () => {
    const { fetchRdfTurtle, fetchApiDocs } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockResolvedValue(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
    `)
    vi.mocked(fetchApiDocs).mockResolvedValue(JSON.parse(readFixture('api-docs.json')))

    expect(await bindOperation('http://localhost/', 'generateToken')).toEqual({
      url: 'http://localhost/tokens',
      method: 'POST',
    })
  })

  it('rejects (no fallback) when the doc is fetched successfully but lacks the operationId', async () => {
    const { fetchRdfTurtle, fetchApiDocs } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockResolvedValue(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
    `)
    vi.mocked(fetchApiDocs).mockResolvedValue(JSON.parse(readFixture('api-docs.json')))

    await expect(bindOperation('http://localhost/', 'deleteEverything')).rejects.toThrow(
      "Operation 'deleteEverything' is not offered",
    )
  })

  it('rejects when the api docs cannot be discovered at all', async () => {
    const { fetchRdfTurtle } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockRejectedValue(new Error('network error'))

    await expect(bindOperation('http://localhost/', 'generateToken')).rejects.toThrow(
      'network error',
    )
  })

  it('substitutes pathParams into the resolved path template', async () => {
    const { fetchRdfTurtle, fetchApiDocs } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockResolvedValue(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
    `)
    vi.mocked(fetchApiDocs).mockResolvedValue(JSON.parse(readFixture('api-docs.json')))

    expect(await bindOperation('http://localhost/', 'deleteUser', { uuid: 'abc-123' })).toEqual({
      url: 'http://localhost/users/abc-123',
      method: 'DELETE',
    })
  })

  it('URL-encodes path param values, not just substitutes them verbatim', async () => {
    const { fetchRdfTurtle, fetchApiDocs } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockResolvedValue(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
    `)
    vi.mocked(fetchApiDocs).mockResolvedValue(JSON.parse(readFixture('api-docs.json')))

    expect(await bindOperation('http://localhost/', 'deleteUser', { uuid: 'a/b c' })).toEqual({
      url: 'http://localhost/users/a%2Fb%20c',
      method: 'DELETE',
    })
  })

  it('rejects when a required path param is missing', async () => {
    const { fetchRdfTurtle, fetchApiDocs } = await import('../../src/composables/fdpApi')
    const { bindOperation } = await import('../../src/composables/apiDocs')

    vi.mocked(fetchRdfTurtle).mockResolvedValue(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <http://localhost/> dcat:endpointDescription <http://localhost/v3/api-docs> .
    `)
    vi.mocked(fetchApiDocs).mockResolvedValue(JSON.parse(readFixture('api-docs.json')))

    await expect(bindOperation('http://localhost/', 'deleteUser', {})).rejects.toThrow(
      "Missing path parameter 'uuid'",
    )
  })
})

describe('resolveOperation', () => {
  const doc: unknown = JSON.parse(readFixture('api-docs.json'))

  it('finds the path and uppercased method for a matching operationId', () => {
    expect(resolveOperation(doc, 'generateToken')).toEqual({ path: '/tokens', method: 'POST' })
  })

  it('finds an operationId among multiple methods on the same path', () => {
    expect(resolveOperation(doc, 'getUser')).toEqual({ path: '/users/{uuid}', method: 'GET' })
    expect(resolveOperation(doc, 'putUser')).toEqual({ path: '/users/{uuid}', method: 'PUT' })
    expect(resolveOperation(doc, 'deleteUser')).toEqual({ path: '/users/{uuid}', method: 'DELETE' })
  })

  it('returns null for an unknown operationId', () => {
    expect(resolveOperation(doc, 'deleteEverything')).toBeNull()
  })

  it('returns null when the document has no paths', () => {
    expect(resolveOperation({}, 'generateToken')).toBeNull()
    expect(resolveOperation(null, 'generateToken')).toBeNull()
  })
})
