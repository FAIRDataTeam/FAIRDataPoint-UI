import { ref } from 'vue'
import { Store } from 'n3'
import {
  getTitle,
  getDescription,
  getParentUri,
  getIssued,
  getModified,
  getTheme,
  getArtifactUris,
  resolveSubjectUri,
  parseTurtle,
} from './rdfUtils'
import { fetchRdfTurtle } from './fetchUtils'

export type ChildSummary = {
  uri: string
  title?: string | null
  description?: string | null
  issued?: string | null
  modified?: string | null
  theme?: string | null
  isPartOf?: string | null
}

/**
 * Handles all RDF fetching for a resource view: the primary resource, its parent chain for
 * breadcrumbs, its profile and SHACL shape documents for metadata rendering, and
 * summaries of child resources for the child listing.
 */
export function useRdfLoader() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const quads = ref<Store>(new Store())
  const rawTurtle = ref<string | null>(null)
  const childSummaries = ref<Record<string, ChildSummary>>({})
  const parentSummaries = ref<Record<string, ChildSummary>>({})

  /** Fetches and parses the primary resource, populating quads and rawTurtle. */
  async function loadResource(uri: string) {
    loading.value = true
    error.value = null
    quads.value = new Store()
    rawTurtle.value = null

    try {
      const rawText = await fetchRdfTurtle(uri)
      quads.value = parseTurtle(rawText)
      rawTurtle.value = rawText
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  /**
   * Recursively walks dct:isPartOf links upward, storing title and parent URI for each
   * ancestor in parentSummaries, used to build the breadcrumb trail.
   */
  async function loadParentChain(uri: string): Promise<void> {
    if (parentSummaries.value[uri]) return

    try {
      const store = parseTurtle(await fetchRdfTurtle(uri))
      const subjectUri = resolveSubjectUri(store, uri)
      if (!subjectUri) return

      const grandParentUri = getParentUri(store, subjectUri)

      parentSummaries.value[uri] = {
        uri,
        title: getTitle(store, subjectUri),
        isPartOf: grandParentUri ?? null,
      }
      if (grandParentUri) {
        await loadParentChain(grandParentUri)
      }
    } catch (err) {
      console.warn(`Failed to load parent chain for ${uri}`, err)
    }
  }

  /** Fetches a profile and its SHACL artifacts, retaining successful results and reporting failures. */
  async function loadProfile(uri: string): Promise<{
    graphs: Record<string, Store>
    error: string | null
  }> {
    const store = parseTurtle(await fetchRdfTurtle(uri))
    const results = await Promise.allSettled(
      getArtifactUris(store).map(async (artifactUri) => {
        const graph = parseTurtle(await fetchRdfTurtle(artifactUri))
        return [artifactUri, graph] as const
      }),
    )
    const graphs: Record<string, Store> = {}
    let error: string | null = null
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [artifactUri, graph] = result.value
        graphs[artifactUri] = graph
      } else {
        error ??=
          result.reason instanceof Error ? result.reason.message : 'Unable to load resource shapes.'
      }
    }
    return { graphs, error }
  }

  /** Fetches a child resource and stores a display summary (title, description, dates, theme) in childSummaries. */
  async function loadChildSummary(uri: string) {
    if (childSummaries.value[uri]) return

    try {
      const store = parseTurtle(await fetchRdfTurtle(uri))
      const subjectUri = resolveSubjectUri(store, uri)
      if (!subjectUri) return
      childSummaries.value[uri] = {
        uri,
        title: getTitle(store, subjectUri),
        description: getDescription(store, subjectUri),
        issued: getIssued(store, subjectUri),
        modified: getModified(store, subjectUri),
        theme: getTheme(store, subjectUri),
      }
    } catch (err) {
      console.warn(`Failed to load child summary for ${uri}`, err)
    }
  }

  return {
    loading,
    error,
    quads,
    rawTurtle,
    childSummaries,
    parentSummaries,
    loadResource,
    loadChildSummary,
    loadParentChain,
    loadProfile,
  }
}
