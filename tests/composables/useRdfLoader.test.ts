import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRdfLoader } from '../../src/composables/useRdfLoader'
import { fetchRdfTurtle } from '../../src/composables/fetchUtils'

vi.mock('../../src/composables/fetchUtils', () => ({ fetchRdfTurtle: vi.fn() }))

const A_URI = 'http://localhost/catalog/a'
const B_URI = 'http://localhost/catalog/b'
const turtleFor = (uri: string) => `<${uri}> <http://purl.org/dc/terms/title> "Title" .`

/** Holds each fetch open, so responses can be completed out of the order they were requested. */
function deferredFetches() {
  const pending = new Map<string, PromiseWithResolvers<string>>()
  vi.mocked(fetchRdfTurtle).mockImplementation((uri: string) => {
    const request = Promise.withResolvers<string>()
    pending.set(uri, request)
    return request.promise
  })
  return {
    complete: (uri: string) => pending.get(uri)!.resolve(turtleFor(uri)),
    fail: (uri: string, message: string) => pending.get(uri)!.reject(new Error(message)),
  }
}

const subjectsOf = (loader: ReturnType<typeof useRdfLoader>) =>
  loader.quads.value.getSubjects(null, null, null).map((term) => term.value)

describe('loadResource', () => {
  beforeEach(() => {
    vi.mocked(fetchRdfTurtle).mockReset()
  })

  it('ignores a response that a newer load has already superseded', async () => {
    const fetches = deferredFetches()
    const loader = useRdfLoader()

    const first = loader.loadResource(A_URI)
    const second = loader.loadResource(B_URI)
    fetches.complete(B_URI)
    await second
    fetches.complete(A_URI)
    await first

    expect(subjectsOf(loader)).toEqual([B_URI])
    expect(loader.rawTurtle.value).toBe(turtleFor(B_URI))
    expect(loader.loading.value).toBe(false)
  })

  it('keeps the newer load pending while a superseded one fails', async () => {
    const fetches = deferredFetches()
    const loader = useRdfLoader()

    const first = loader.loadResource(A_URI)
    const second = loader.loadResource(B_URI)
    fetches.fail(A_URI, 'Gone')
    await first

    // The stale failure neither sets an error nor stops the newer load's spinner.
    expect(loader.error.value).toBeNull()
    expect(loader.loading.value).toBe(true)

    fetches.complete(B_URI)
    await second
    expect(subjectsOf(loader)).toEqual([B_URI])
    expect(loader.loading.value).toBe(false)
  })

  it('still reports a failure of the newest load', async () => {
    const fetches = deferredFetches()
    const loader = useRdfLoader()

    const load = loader.loadResource(A_URI)
    fetches.fail(A_URI, 'Not found')
    await load

    expect(loader.error.value).toBe('Not found')
    expect(loader.loading.value).toBe(false)
    expect(subjectsOf(loader)).toEqual([])
  })
})
