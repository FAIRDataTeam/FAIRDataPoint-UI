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
  })
})
