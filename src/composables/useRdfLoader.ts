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
import { fetchRdfTurtle } from './fdpApi'

export type ChildSummary = {
  uri: string
  title?: string | null
  description?: string | null
  issued?: string | null
  modified?: string | null
  theme?: string | null
  isPartOf?: string | null
}

// Handles all RDF fetching for a resource view: the primary resource, its parent chain for
// breadcrumbs, its profile and SHACL shape documents for metadata rendering, and
// summaries of child resources for the child listing.
export function useRdfLoader() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const quads = ref<Store>(new Store())
  const rawTurtle = ref<string | null>(null)
  const childSummaries = ref<Record<string, ChildSummary>>({})
  const parentSummaries = ref<Record<string, ChildSummary>>({})
  const shapeGraphs = ref<Record<string, Store>>({})

  // Fetches and parses the primary resource, populating quads and rawTurtle.
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

  // Recursively walks dct:isPartOf links upward, storing title and parent URI for each
  // ancestor in parentSummaries, used to build the breadcrumb trail.
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

  // Fetches a profile and calls loadShapeDocument for each of its SHACL artifacts.
  async function loadProfile(uri: string): Promise<void> {
    if (shapeGraphs.value[uri]) return

    try {
      const store = parseTurtle(await fetchRdfTurtle(uri))
      for (const artifactUri of getArtifactUris(store)) {
        void loadShapeDocument(artifactUri)
      }
    } catch (err) {
      console.warn(`Failed to load profile ${uri}`, err)
    }
  }

  // Fetches and parses a SHACL shape document into shapeGraphs, used for property ordering and rendering hints.
  async function loadShapeDocument(uri: string): Promise<void> {
    if (shapeGraphs.value[uri]) return

    try {
      const store = parseTurtle(await fetchRdfTurtle(uri))
      shapeGraphs.value[uri] = store
    } catch (err) {
      console.warn(`Failed to load shape document ${uri}`, err)
    }
  }

  // Fetches a child resource and stores a display summary (title, description, dates, theme) in childSummaries.
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
    shapeGraphs,
    loadResource,
    loadChildSummary,
    loadParentChain,
    loadProfile,
  }
}
