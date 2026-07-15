import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRoute } from 'vue-router'
import { useResourceView } from '../../src/composables/useResourceView'
import { fetchRdfTurtle } from '../../src/composables/fdpApi'

vi.mock('../../src/composables/fdpApi', () => ({ fetchRdfTurtle: vi.fn() }))

// Mock useRoute.
vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
}))

const readFixture = (name: string) => readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8')

// Empty content for fetches, so useRdfLoader's loaders no-op instead of warning.
const EMPTY_TTL = '# no data'

const ROOT_URI = 'http://localhost/'
// catalog/dataset/distribution's dct:isPartOf points to the root without the trailing slash
const ROOT_URI_NO_TRAILING_SLASH = 'http://localhost'
const ROOT_PROFILE_URI = 'http://localhost/profile/77aaad6a-0136-4c6e-88b9-07ffccd0ee4c'
const CATALOG_URI = 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f'
const CATALOG_PROFILE_URI = 'http://localhost/profile/a0949e72-4466-4d53-8900-9436d1049a4b'
const DATASET_URI = 'http://localhost/dataset/dfb63246-106a-4388-9b81-ed42ccb3f0ad'
const DATASET_PROFILE_URI = 'http://localhost/profile/2f08228e-1789-40f8-84cd-28e3288c3604'
const DISTRIBUTION_URI = 'http://localhost/distribution/28f248e7-a965-4739-9381-b66878845ea4'
const DISTRIBUTION_PROFILE_URI = 'http://localhost/profile/02c649de-c579-43bb-b470-306abdc808c7'

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function mockRoute(params: Record<string, string | string[]> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params } as unknown as ReturnType<typeof useRoute>)
}

function setupFetchFixtures(fixtureMap: Record<string, string>) {
  vi.mocked(fetchRdfTurtle).mockImplementation(async (uri: string) => {
    const content = fixtureMap[uri]
    if (!content) throw new Error(`No fixture for URI: ${uri}`)
    return content
  })
}

// Tests
describe('useResourceView', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FDP_BASE_URL', ROOT_URI_NO_TRAILING_SLASH)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  // FDP root
  describe('FDP root', () => {
    beforeEach(() => {
      mockRoute({})
      setupFetchFixtures({
        [ROOT_URI]: readFixture('fdp-root.ttl'),
        [CATALOG_URI]: EMPTY_TTL,
        [ROOT_PROFILE_URI]: EMPTY_TTL,
      })
    })

    it('returns dct:title', async () => {
      const { title } = useResourceView()
      await flushPromises()
      expect(title.value).toBe('My FAIR Data Point')
    })

    it('returns dct:description', async () => {
      const { description } = useResourceView()
      await flushPromises()
      expect(description.value).toBe(
        'Duis pellentesque, nunc a fringilla varius, magna dui porta quam, nec ultricies augue turpis sed velit.',
      )
    })

    it('builds breadcrumbs containing only the root', async () => {
      const { breadcrumbs } = useResourceView()
      await flushPromises()
      expect(breadcrumbs.value).toEqual([{ text: 'FAIR Data Point', uri: ROOT_URI }])
    })

    it('exposes the catalog container as a child section with one item despite duplicate ldp:contains', async () => {
      const { childSections } = useResourceView()
      await flushPromises()
      expect(childSections.value).toHaveLength(1)
      expect(childSections.value[0].items).toEqual([CATALOG_URI])
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
          label: 'Conforms to',
          kind: 'link',
          values: [{ text: 'FAIR Data Point Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version',
          kind: 'literal',
          values: [{ text: '1.0' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language',
          kind: 'link',
          values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License',
          kind: 'link',
          values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights',
          kind: 'link',
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher',
          kind: 'link',
        }))

      it('includes a repository identifier row', () =>
        expect(find('http://www.re3data.org/schema/3-0#repositoryIdentifier')).toMatchObject({
          label: 'Repository identifier',
          kind: 'link',
        }))

      it('includes an endpoint URL row', () =>
        expect(find('http://www.w3.org/ns/dcat#endpointURL')).toMatchObject({
          label: 'Endpoint URL',
          kind: 'link',
        }))

      it('includes a software version row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#fdpSoftwareVersion')).toMatchObject({
          label: 'Software version',
          kind: 'literal',
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier',
          kind: 'link',
        }))
    })

    describe('with profile and shape', () => {
      beforeEach(() => {
        mockRoute({})
        setupFetchFixtures({
          [ROOT_URI]: readFixture('fdp-root.ttl'),
          [CATALOG_URI]: EMPTY_TTL,
          [ROOT_PROFILE_URI]: readFixture('profile-fdp-root.ttl'),
          'http://localhost/metadata-schemas/a92958ab-a414-47e6-8e17-68ba96ba3a2b': readFixture(
            'metadata-schema-fdp-root.ttl',
          ),
          'http://localhost/metadata-schemas/89d94c1b-f6ff-4545-ba9b-120b2d1921d0': readFixture(
            'metadata-schema-fdp-root-data-service.ttl',
          ),
          'http://localhost/metadata-schemas/6f7a5a76-6185-4bd0-9fe9-62ecc90c9bad': readFixture(
            'metadata-schema-fdp-root-metadata-service.ttl',
          ),
        })
      })

      it('populates metadataRows with only dash:viewer predicates in shacl:order', async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(metadataRows.value.map((r) => r.predicate)).toEqual([
          'http://www.w3.org/ns/dcat#version',
          'http://purl.org/dc/terms/language',
          'http://purl.org/dc/terms/license',
          'https://w3id.org/fdp/fdp-o#metadataIdentifier',
          'https://w3id.org/fdp/fdp-o#metadataModified',
          'https://w3id.org/fdp/fdp-o#metadataIssued',
        ])
      })

      it('populates unknownMetadataRows with predicates that have no dash:viewer', async () => {
        const { unknownMetadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(unknownMetadataRows.value.map((r) => r.predicate).sort()).toEqual(
          [
            'http://purl.org/dc/terms/accessRights',
            'http://purl.org/dc/terms/conformsTo',
            'http://www.w3.org/ns/dcat#endpointURL',
            'http://purl.org/dc/terms/publisher',
            'http://www.re3data.org/schema/3-0#repositoryIdentifier',
            'https://w3id.org/fdp/fdp-o#fdpSoftwareVersion',
          ].sort(),
        )
      })
    })
  })

  // catalog
  describe('catalog', () => {
    beforeEach(() => {
      mockRoute({ resourceType: 'catalog', id: '37691d1d-94b4-4376-80a9-e49cab8e676f' })
      setupFetchFixtures({
        [CATALOG_URI]: readFixture('catalog.ttl'),
        [ROOT_URI_NO_TRAILING_SLASH]: EMPTY_TTL,
        [DATASET_URI]: EMPTY_TTL,
        [CATALOG_PROFILE_URI]: EMPTY_TTL,
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

    it('builds breadcrumbs as FDP root → catalog', async () => {
      const { breadcrumbs } = useResourceView()
      await flushPromises()
      expect(breadcrumbs.value).toEqual([
        { text: 'FAIR Data Point', uri: ROOT_URI },
        { text: 'A catalog', uri: CATALOG_URI },
      ])
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

    it('exposes the dataset container as a child section', async () => {
      const { childSections } = useResourceView()
      await flushPromises()
      expect(childSections.value).toHaveLength(1)
      expect(childSections.value[0].items).toEqual([DATASET_URI])
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
          label: 'Conforms to',
          kind: 'link',
          values: [{ text: 'Catalog Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes an issued row', () =>
        expect(find('http://purl.org/dc/terms/issued')).toMatchObject({
          label: 'Issued',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a modified row', () =>
        expect(find('http://purl.org/dc/terms/modified')).toMatchObject({
          label: 'Modified',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version',
          kind: 'literal',
          values: [{ text: '1' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language',
          kind: 'link',
          values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License',
          kind: 'link',
          values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes a theme taxonomy row', () =>
        expect(find('http://www.w3.org/ns/dcat#themeTaxonomy')).toMatchObject({
          label: 'Theme taxonomy',
          kind: 'link',
          values: [{ text: 'test' }],
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher',
          kind: 'blank-node',
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier',
          kind: 'link',
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights',
          kind: 'link',
        }))
    })

    describe('with profile and shape', () => {
      beforeEach(() => {
        mockRoute({ resourceType: 'catalog', id: '37691d1d-94b4-4376-80a9-e49cab8e676f' })
        setupFetchFixtures({
          [CATALOG_URI]: readFixture('catalog.ttl'),
          [ROOT_URI_NO_TRAILING_SLASH]: EMPTY_TTL,
          [DATASET_URI]: EMPTY_TTL,
          [CATALOG_PROFILE_URI]: readFixture('profile-catalog.ttl'),
          'http://localhost/metadata-schemas/2aa7ba63-d27a-4c0e-bfa6-3a4e250f4660': readFixture(
            'metadata-schema-catalog.ttl',
          ),
        })
      })

      it('populates metadataRows with only dash:viewer predicates in shacl:order', async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(metadataRows.value.map((r) => r.predicate)).toEqual([
          'http://www.w3.org/ns/dcat#version',
          'http://purl.org/dc/terms/language',
          'http://purl.org/dc/terms/license',
          'http://purl.org/dc/terms/issued',
          'http://purl.org/dc/terms/modified',
          'http://www.w3.org/ns/dcat#themeTaxonomy',
        ])
      })

      it('populates unknownMetadataRows with predicates that have no dash:viewer', async () => {
        const { unknownMetadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(unknownMetadataRows.value.map((r) => r.predicate).sort()).toEqual(
          [
            'http://purl.org/dc/terms/publisher',
            'https://w3id.org/fdp/fdp-o#metadataIdentifier',
            'http://purl.org/dc/terms/accessRights',
            'https://w3id.org/fdp/fdp-o#metadataIssued',
            'https://w3id.org/fdp/fdp-o#metadataModified',
            'http://purl.org/dc/terms/conformsTo',
          ].sort(),
        )
      })
    })
  })

  // dataset
  describe('dataset', () => {
    beforeEach(() => {
      mockRoute({ resourceType: 'dataset', id: 'dfb63246-106a-4388-9b81-ed42ccb3f0ad' })
      setupFetchFixtures({
        [DATASET_URI]: readFixture('dataset.ttl'),
        [CATALOG_URI]: EMPTY_TTL,
        [DISTRIBUTION_URI]: EMPTY_TTL,
        [DATASET_PROFILE_URI]: EMPTY_TTL,
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

    it('builds breadcrumbs as FDP root → catalog → dataset', async () => {
      setupFetchFixtures({
        [DATASET_URI]: readFixture('dataset.ttl'),
        [CATALOG_URI]: readFixture('catalog.ttl'),
        [ROOT_URI_NO_TRAILING_SLASH]: EMPTY_TTL,
        [DISTRIBUTION_URI]: EMPTY_TTL,
        [DATASET_PROFILE_URI]: EMPTY_TTL,
      })
      const { breadcrumbs } = useResourceView()
      await flushPromises()
      expect(breadcrumbs.value).toEqual([
        { text: 'FAIR Data Point', uri: ROOT_URI },
        { text: 'A catalog', uri: CATALOG_URI },
        { text: 'A dataset', uri: DATASET_URI },
      ])
    })

    it('exposes the distribution container as a child section', async () => {
      const { childSections } = useResourceView()
      await flushPromises()
      expect(childSections.value).toHaveLength(1)
      expect(childSections.value[0].items).toEqual([DISTRIBUTION_URI])
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
          label: 'Conforms to',
          kind: 'link',
          values: [{ text: 'Dataset Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version',
          kind: 'literal',
          values: [{ text: '1' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language',
          kind: 'link',
          values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License',
          kind: 'link',
          values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher',
          kind: 'blank-node',
        }))

      it('includes a theme row', () =>
        expect(find('http://www.w3.org/ns/dcat#theme')).toMatchObject({
          label: 'Theme',
          kind: 'link',
          values: [{ text: 'test' }],
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier',
          kind: 'link',
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights',
          kind: 'link',
        }))
    })

    describe('with profile and shape', () => {
      beforeEach(() => {
        mockRoute({ resourceType: 'dataset', id: 'dfb63246-106a-4388-9b81-ed42ccb3f0ad' })
        setupFetchFixtures({
          [DATASET_URI]: readFixture('dataset.ttl'),
          [CATALOG_URI]: EMPTY_TTL,
          [DISTRIBUTION_URI]: EMPTY_TTL,
          [DATASET_PROFILE_URI]: readFixture('profile-dataset.ttl'),
          'http://localhost/metadata-schemas/866d7fb8-5982-4215-9c7c-18d0ed1bd5f3': readFixture(
            'metadata-schema-dataset.ttl',
          ),
        })
      })

      it('populates metadataRows with only dash:viewer predicates in shacl:order', async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(metadataRows.value.map((r) => r.predicate)).toEqual([
          'http://www.w3.org/ns/dcat#version',
          'http://purl.org/dc/terms/language',
          'http://purl.org/dc/terms/license',
          'http://www.w3.org/ns/dcat#theme',
        ])
      })

      it('populates unknownMetadataRows with predicates that have no dash:viewer', async () => {
        const { unknownMetadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(unknownMetadataRows.value.map((r) => r.predicate).sort()).toEqual(
          [
            'http://purl.org/dc/terms/publisher',
            'https://w3id.org/fdp/fdp-o#metadataIdentifier',
            'http://purl.org/dc/terms/accessRights',
            'https://w3id.org/fdp/fdp-o#metadataIssued',
            'https://w3id.org/fdp/fdp-o#metadataModified',
            'http://purl.org/dc/terms/conformsTo',
          ].sort(),
        )
      })
    })
  })

  // distribution
  describe('distribution', () => {
    beforeEach(() => {
      mockRoute({ resourceType: 'distribution', id: '28f248e7-a965-4739-9381-b66878845ea4' })
      setupFetchFixtures({
        [DISTRIBUTION_URI]: readFixture('distribution.ttl'),
        [DATASET_URI]: EMPTY_TTL,
        [DISTRIBUTION_PROFILE_URI]: EMPTY_TTL,
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

    it('builds breadcrumbs as FDP root → catalog → dataset → distribution', async () => {
      setupFetchFixtures({
        [DISTRIBUTION_URI]: readFixture('distribution.ttl'),
        [DATASET_URI]: readFixture('dataset.ttl'),
        [CATALOG_URI]: readFixture('catalog.ttl'),
        [ROOT_URI_NO_TRAILING_SLASH]: EMPTY_TTL,
        [DISTRIBUTION_PROFILE_URI]: EMPTY_TTL,
      })
      const { breadcrumbs } = useResourceView()
      await flushPromises()
      expect(breadcrumbs.value).toEqual([
        { text: 'FAIR Data Point', uri: ROOT_URI },
        { text: 'A catalog', uri: CATALOG_URI },
        { text: 'A dataset', uri: DATASET_URI },
        {
          text: 'One distribution',
          uri: DISTRIBUTION_URI,
        },
      ])
    })

    it('has no child sections', async () => {
      const { childSections } = useResourceView()
      await flushPromises()
      expect(childSections.value).toHaveLength(0)
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
          label: 'Conforms to',
          kind: 'link',
          values: [{ text: 'Distribution Profile' }],
        }))

      it('includes a metadata issued row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIssued')).toMatchObject({
          label: 'Metadata issued',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a metadata modified row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataModified')).toMatchObject({
          label: 'Metadata modified',
          kind: 'literal',
          values: [{ text: '23-04-2026' }],
        }))

      it('includes a version row', () =>
        expect(find('http://www.w3.org/ns/dcat#version')).toMatchObject({
          label: 'Version',
          kind: 'literal',
          values: [{ text: '1' }],
        }))

      it('includes a language row', () =>
        expect(find('http://purl.org/dc/terms/language')).toMatchObject({
          label: 'Language',
          kind: 'link',
          values: [{ text: 'en' }],
        }))

      it('includes a license row', () =>
        expect(find('http://purl.org/dc/terms/license')).toMatchObject({
          label: 'License',
          kind: 'link',
          values: [{ text: 'cc-zero1.0' }],
        }))

      it('includes a publisher row', () =>
        expect(find('http://purl.org/dc/terms/publisher')).toMatchObject({
          label: 'Publisher',
          kind: 'blank-node',
        }))

      it('includes a media type row', () =>
        expect(find('http://www.w3.org/ns/dcat#mediaType')).toMatchObject({
          label: 'Media type',
          kind: 'literal',
          values: [{ text: 'csv' }],
        }))

      it('includes a metadata identifier row', () =>
        expect(find('https://w3id.org/fdp/fdp-o#metadataIdentifier')).toMatchObject({
          label: 'Metadata identifier',
          kind: 'link',
        }))

      it('includes an access rights row', () =>
        expect(find('http://purl.org/dc/terms/accessRights')).toMatchObject({
          label: 'Access rights',
          kind: 'link',
        }))
    })

    describe('with profile and shape', () => {
      beforeEach(() => {
        mockRoute({ resourceType: 'distribution', id: '28f248e7-a965-4739-9381-b66878845ea4' })
        setupFetchFixtures({
          [DISTRIBUTION_URI]: readFixture('distribution.ttl'),
          [DATASET_URI]: EMPTY_TTL,
          [DISTRIBUTION_PROFILE_URI]: readFixture('profile-distribution.ttl'),
          'http://localhost/metadata-schemas/ebacbf83-cd4f-4113-8738-d73c0735b0ab': readFixture(
            'metadata-schema-distribution.ttl',
          ),
        })
      })

      it('populates metadataRows with only dash:viewer predicates in shacl:order', async () => {
        const { metadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(metadataRows.value.map((r) => r.predicate)).toEqual([
          'http://www.w3.org/ns/dcat#version',
          'http://purl.org/dc/terms/language',
          'http://purl.org/dc/terms/license',
          'http://www.w3.org/ns/dcat#mediaType',
        ])
      })

      it('populates unknownMetadataRows with predicates that have no dash:viewer', async () => {
        const { unknownMetadataRows } = useResourceView()
        await flushPromises()
        await flushPromises()
        expect(unknownMetadataRows.value.map((r) => r.predicate).sort()).toEqual(
          [
            'http://purl.org/dc/terms/publisher',
            'https://w3id.org/fdp/fdp-o#metadataIdentifier',
            'http://purl.org/dc/terms/accessRights',
            'https://w3id.org/fdp/fdp-o#metadataIssued',
            'https://w3id.org/fdp/fdp-o#metadataModified',
            'http://purl.org/dc/terms/conformsTo',
          ].sort(),
        )
      })
    })
  })
})
