import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRoute } from 'vue-router'
import { useResourceView } from '../../src/composables/useResourceView'
import { fetchRdf, parseTurtle } from '../../src/composables/rdfUtils'

// Mock fetchRdf withi rdfUtils.
vi.mock('../../src/composables/rdfUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/composables/rdfUtils')>()
  return { ...actual, fetchRdf: vi.fn() }
})

// Mock useRoute.
vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
}))

const readFixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function mockRoute(params: Record<string, string | string[]> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params } as unknown as ReturnType<typeof useRoute>)
}

// Sets up fetchRdf to parse Turtle fixture files keyed by URI.
function setupFetchFixtures(fixtureMap: Record<string, string>) {
  vi.mocked(fetchRdf).mockImplementation(async (uri) => {
    const content = fixtureMap[uri]
    if (!content) throw new Error(`No fixture for URI: ${uri}`)
    return { nodes: parseTurtle(content), format: 'turtle' as const, rawText: content }
  })
}

// Tests
describe('useResourceView', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FDP_BASE_URL', 'http://localhost')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  // FDP root
  describe('FDP root', () => {
    beforeEach(() => {
      mockRoute({})
      setupFetchFixtures({ 'http://localhost/': readFixture('fdp-root.ttl') })
    })

    it('returns dct:title', async () => {
      const { title } = useResourceView()
      await flushPromises()
      expect(title.value).toBe('My FAIR Data Point')
    })

    it('returns dct:description', async () => {
      const { description } = useResourceView()
      await flushPromises()
      expect(description.value).toBe('Duis pellentesque, nunc a fringilla varius, magna dui porta quam, nec ultricies augue turpis sed velit.')
    })

    describe('metadata rows', () => {
      let rows: Awaited<ReturnType<typeof useResourceView>>['metadataRows']['value']

      beforeEach(async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        rows = metadataRows.value
      })

      const find = (predicate: string) => rows.find((r) => r.predicate === predicate)

      it('includes 12 rows', () => expect(rows).toHaveLength(12))

      it('includes a conforms to row', () =>
        expect(find('http://purl.org/dc/terms/conformsTo')).toMatchObject({
          label: 'Conforms to', kind: 'link', values: [{ text: 'FAIR Data Point Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version', kind: 'literal', values: [{ text: '1.0' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language', kind: 'link', values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License', kind: 'link', values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights', kind: 'link',
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher', kind: 'link',
        }))

      it('includes a repository identifier row', () =>
        expect(find('http://www.re3data.org/schema/3-0#repositoryIdentifier')).toMatchObject({
          label: 'Repository identifier', kind: 'link',
        }))

      it('includes an endpoint URL row', () =>
        expect(find('http://www.w3.org/ns/dcat#endpointURL')).toMatchObject({
          label: 'Endpoint URL', kind: 'link',
        }))

      it('includes a software version row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#fdpSoftwareVersion')).toMatchObject({
          label: 'Software version', kind: 'literal',
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier', kind: 'link',
        }))
    })
  })

  // dataset

  describe('dataset', () => {
    beforeEach(() => {
      mockRoute({ resourceType: 'dataset', id: 'dfb63246-106a-4388-9b81-ed42ccb3f0ad' })
      setupFetchFixtures({
        'http://localhost/dataset/dfb63246-106a-4388-9b81-ed42ccb3f0ad': readFixture('dataset.ttl'),
      })
    })

    it('returns dct:title', async () => {
      const { title } = useResourceView()
      await flushPromises()
      expect(title.value).toBe('A dataset')
    })

    it('returns dct:description', async () => {
      const { description } = useResourceView()
      await flushPromises()
      expect(description.value).toBe('For testing purposes.')
    })

    describe('metadata rows', () => {
      let rows: Awaited<ReturnType<typeof useResourceView>>['metadataRows']['value']

      beforeEach(async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        rows = metadataRows.value
      })

      const find = (predicate: string) => rows.find((r) => r.predicate === predicate)

      it('includes 10 rows', () => expect(rows).toHaveLength(10))

      it('includes a conforms to row', () =>
        expect(find('http://purl.org/dc/terms/conformsTo')).toMatchObject({
          label: 'Conforms to', kind: 'link', values: [{ text: 'Dataset Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version', kind: 'literal', values: [{ text: '1' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language', kind: 'link', values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License', kind: 'link', values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher', kind: 'blank-node',
        }))

      it('includes a theme row', () =>
        expect(find('http://www.w3.org/ns/dcat#theme')).toMatchObject({
          label: 'Theme', kind: 'link', values: [{ text: 'test' }],
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier', kind: 'link',
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights', kind: 'link',
        }))
    })
  })

  // catalog
  describe('catalog', () => {
    beforeEach(() => {
      mockRoute({ resourceType: 'catalog', id: '37691d1d-94b4-4376-80a9-e49cab8e676f' })
      setupFetchFixtures({
        'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f': readFixture('catalog.ttl'),
      })
    })

    it('returns dct:title', async () => {
      const { title } = useResourceView()
      await flushPromises()
      expect(title.value).toBe('A catalog')
    })

    it('returns dct:description', async () => {
      const { description } = useResourceView()
      await flushPromises()
      expect(description.value).toBe('For testing purposes.')
    })

    it('returns null for accessUrl when not set', async () => {
      const { accessUrl } = useResourceView()
      await flushPromises()
      expect(accessUrl.value).toBeNull()
    })

    it('returns null for downloadUrl when not set', async () => {
      const { downloadUrl } = useResourceView()
      await flushPromises()
      expect(downloadUrl.value).toBeNull()
    })

    describe('metadata rows', () => {
      let rows: Awaited<ReturnType<typeof useResourceView>>['metadataRows']['value']

      beforeEach(async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        rows = metadataRows.value
      })

      const find = (predicate: string) => rows.find((r) => r.predicate === predicate)

      it('includes 12 rows', () => expect(rows).toHaveLength(12))

      it('includes a conforms to row', () =>
        expect(find('http://purl.org/dc/terms/conformsTo')).toMatchObject({
          label: 'Conforms to', kind: 'link', values: [{ text: 'Catalog Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes an issued row', () =>
        expect(find('http://purl.org/dc/terms/issued')).toMatchObject({
          label: 'Issued', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a modified row', () =>
        expect(find('http://purl.org/dc/terms/modified')).toMatchObject({
          label: 'Modified', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version', kind: 'literal', values: [{ text: '1' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language', kind: 'link', values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License', kind: 'link', values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes a theme taxonomy row', () =>
        expect(find('http://www.w3.org/ns/dcat#themeTaxonomy')).toMatchObject({
          label: 'Theme taxonomy', kind: 'link', values: [{ text: 'test' }],
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher', kind: 'blank-node',
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier', kind: 'link',
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights', kind: 'link',
        }))
    })
  })

  // distribution

  describe('distribution', () => {
    beforeEach(() => {
      mockRoute({ resourceType: 'distribution', id: '28f248e7-a965-4739-9381-b66878845ea4' })
      setupFetchFixtures({
        'http://localhost/distribution/28f248e7-a965-4739-9381-b66878845ea4': readFixture('distribution.ttl'),
      })
    })

    it('returns dct:title', async () => {
      const { title } = useResourceView()
      await flushPromises()
      expect(title.value).toBe('One distribution')
    })

    it('returns dct:description', async () => {
      const { description } = useResourceView()
      await flushPromises()
      expect(description.value).toBe('For testing purposes.')
    })

    describe('metadata rows', () => {
      let rows: Awaited<ReturnType<typeof useResourceView>>['metadataRows']['value']

      beforeEach(async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        rows = metadataRows.value
      })

      const find = (predicate: string) => rows.find((r) => r.predicate === predicate)

      it('includes 10 rows', () => expect(rows).toHaveLength(10))

      it('includes a conforms to row', () =>
        expect(find('http://purl.org/dc/terms/conformsTo')).toMatchObject({
          label: 'Conforms to', kind: 'link', values: [{ text: 'Distribution Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified', kind: 'literal', values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version', kind: 'literal', values: [{ text: '1' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language', kind: 'link', values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License', kind: 'link', values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher', kind: 'blank-node',
        }))

      it('includes a media type row', () =>
        expect(find('http://www.w3.org/ns/dcat#mediaType')).toMatchObject({
          label: 'Media type', kind: 'literal', values: [{ text: 'csv' }],
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier', kind: 'link',
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights', kind: 'link',
        }))
    })
  })
})
