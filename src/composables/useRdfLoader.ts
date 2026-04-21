import { ref } from 'vue'
import {
  flattenGraph,
  hasType,
  getFirstLiteral,
  getIdValues,
  fetchRdf,
  type RdfNode,
  type RdfFormat,
} from './rdfUtils'
import {
  DCT_TITLE,
  DCT_ISSUED,
  DCT_MODIFIED,
  DCT_IS_PART_OF,
  DCAT_THEME_TAXONOMY,
  FDP_METADATA_ISSUED,
  FDP_METADATA_MODIFIED,
  LDP_DIRECT_CONTAINER,
  PROF_HAS_ARTIFACT,
  DCT_DESCRIPTION,
} from './vocabularies'

export type ChildSummary = {
  uri: string
  title?: string | null
  description?: string | null
  issued?: string | null
  modified?: string | null
  theme?: string | null
  isPartOf?: string | null
}

export function isPrimaryDomainNode(node: RdfNode): boolean {
  const id = node['@id']
  if (typeof id !== 'string' || id.startsWith('_:')) return false
  const types = Array.isArray(node['@type']) ? node['@type'] : []
  return types.some((type) => type !== LDP_DIRECT_CONTAINER)
}

function selectPrimaryNode(nodes: RdfNode[], preferredUri?: string): RdfNode | null {
  const exact = preferredUri ? nodes.find((node) => node['@id'] === preferredUri) : null

  if (exact && !hasType(exact, LDP_DIRECT_CONTAINER)) return exact

  const preferred = nodes.find((node) => isPrimaryDomainNode(node))
  if (preferred) return preferred

  if (exact) return exact

  return nodes.find((node) => typeof node['@id'] === 'string') ?? null
}

export function useRdfLoader() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const rawGraph = ref<RdfNode[]>([])
  const activeFormat = ref<RdfFormat | null>(null)
  const activeRawText = ref<string | null>(null)
  const childSummaries = ref<Record<string, ChildSummary>>({})
  const parentSummaries = ref<Record<string, ChildSummary>>({})
  const profileGraphs = ref<Record<string, RdfNode[]>>({})
  const shapeGraphs = ref<Record<string, RdfNode[]>>({})

  async function loadResource(uri: string) {
    loading.value = true
    error.value = null
    rawGraph.value = []
    activeFormat.value = null
    activeRawText.value = null

    try {
      const { nodes, format, rawText } = await fetchRdf(uri)
      rawGraph.value = nodes
      activeFormat.value = format
      activeRawText.value = rawText
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  async function loadChildSummary(uri: string) {
    if (childSummaries.value[uri]) return

    try {
      const { nodes } = await fetchRdf(uri)
      const childGraph = flattenGraph(nodes)
      const node = selectPrimaryNode(childGraph, uri)
      if (!node) return
      childSummaries.value[uri] = {
        uri,
        title: getFirstLiteral(node, DCT_TITLE),
        description: getFirstLiteral(node, DCT_DESCRIPTION),
        issued: getFirstLiteral(node, DCT_ISSUED) ?? getFirstLiteral(node, FDP_METADATA_ISSUED),
        modified:
          getFirstLiteral(node, DCT_MODIFIED) ?? getFirstLiteral(node, FDP_METADATA_MODIFIED),
        theme:
          getFirstLiteral(node, DCAT_THEME_TAXONOMY) ??
          getIdValues(node, DCAT_THEME_TAXONOMY)[0] ??
          null,
      }
    } catch {
      // ignore child summary failures
    }
  }

  async function loadParentChain(uri: string): Promise<void> {
    if (parentSummaries.value[uri]) return

    try {
      const { nodes } = await fetchRdf(uri)
      const parentGraph = flattenGraph(nodes)
      const node = selectPrimaryNode(parentGraph, uri)
      if (!node) return

      const grandParentUri = getIdValues(node, DCT_IS_PART_OF)[0]

      parentSummaries.value[uri] = {
        uri,
        title: getFirstLiteral(node, DCT_TITLE),
        issued: null,
        modified: null,
        theme: null,
        isPartOf: grandParentUri ?? null,
      }
      if (grandParentUri) {
        await loadParentChain(grandParentUri)
      }
    } catch {
      // ignore parent chain failures
    }
  }

  async function loadShapeDocument(uri: string): Promise<void> {
    if (shapeGraphs.value[uri]) return

    try {
      const { nodes } = await fetchRdf(uri)
      const shapeGraph = flattenGraph(nodes)
      shapeGraphs.value[uri] = shapeGraph
    } catch {
      // ignore shape fetch failures
    }
  }

  async function loadProfile(uri: string): Promise<void> {
    if (profileGraphs.value[uri]) return

    try {
      const { nodes } = await fetchRdf(uri)
      const profileGraph = flattenGraph(nodes)
      profileGraphs.value[uri] = profileGraph

      // Follow prof:hasArtifact from each resource descriptor to get shape documents
      const artifactUris = profileGraph.flatMap((node) => getIdValues(node, PROF_HAS_ARTIFACT))

      for (const artifactUri of artifactUris) {
        void loadShapeDocument(artifactUri)
      }
    } catch {
      // ignore profile fetch failures
    }
  }

  return {
    loading,
    error,
    rawGraph,
    activeFormat,
    activeRawText,
    childSummaries,
    parentSummaries,
    shapeGraphs,
    loadResource,
    loadChildSummary,
    loadParentChain,
    loadProfile,
  }
}
