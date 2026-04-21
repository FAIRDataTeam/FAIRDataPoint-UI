import { computed, watch, watchEffect, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  fetchRdf,
  flattenGraph,
  getFirstLiteral,
  getIdValues,
  compactUri,
  internalHref,
  type RdfNode,
  type RdfValue,
} from './rdfUtils'
import { DCT_TITLE, DCT_DESCRIPTION, DCT_IS_PART_OF, LDP_CONTAINS } from './vocabularies'

type ChildSummary = {
  title: string | null
  description: string | null
  type: string | null
}

type ParentSummary = {
  title: string | null
  isPartOf: string | null
}

export function useResourceView() {
  const route = useRoute()

  const resourceUri = computed(() => {
    const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
    const { resourceType, id } = route.params
    if (resourceType && id) return `${base}/${resourceType}/${id}`
    return base
  })

  const loading = ref(false)
  const error = ref<string | null>(null)
  const node = ref<RdfNode | null>(null)
  const graph = ref<RdfNode[]>([])
  const childSummaries = ref<Record<string, ChildSummary>>({})
  const parentSummaries = ref<Record<string, ParentSummary>>({})

  watchEffect(async () => {
    loading.value = true
    error.value = null
    node.value = null
    graph.value = []
    childSummaries.value = {}
    parentSummaries.value = {}

    try {
      const { nodes } = await fetchRdf(resourceUri.value)
      graph.value = flattenGraph(nodes)
      node.value = graph.value.find((n) => n['@id'] === resourceUri.value) ?? graph.value[0] ?? null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  })

  const title = computed(() => getFirstLiteral(node.value, DCT_TITLE))
  const description = computed(() => getFirstLiteral(node.value, DCT_DESCRIPTION))

  const SKIP_KEYS = new Set(['@id', '@type', '@graph', DCT_IS_PART_OF])

  const metadataRows = computed(() => {
    if (!node.value) return []
    return Object.keys(node.value)
      .filter((key) => !SKIP_KEYS.has(key))
      .map((predicate) => ({
        predicate,
        label: compactUri(predicate),
        values: (node.value![predicate] as RdfValue[]).flatMap((v) => {
          if (typeof v['@value'] === 'string') return [v['@value']]
          if (typeof v['@id'] === 'string') return [v['@id']]
          return []
        }),
      }))
      .filter((row) => row.values.length > 0)
  })

  const children = computed(() => graph.value.flatMap((n) => getIdValues(n, LDP_CONTAINS)))

  watch(
    children,
    async (uris) => {
      for (const uri of uris) {
        if (childSummaries.value[uri]) continue
        try {
          const { nodes } = await fetchRdf(uri)
          const g = flattenGraph(nodes)
          const n = g.find((x) => x['@id'] === uri) ?? g[0] ?? null
          childSummaries.value[uri] = {
            title: getFirstLiteral(n, DCT_TITLE),
            description: getFirstLiteral(n, DCT_DESCRIPTION),
            type: Array.isArray(n?.['@type']) ? ((n['@type'] as string[])[0] ?? null) : null,
          }
        } catch {
          // ignore
        }
      }
    },
    { immediate: true },
  )

  async function loadParentChain(uri: string) {
    if (parentSummaries.value[uri]) return
    const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
    try {
      const { nodes } = await fetchRdf(uri)
      const g = flattenGraph(nodes)
      const n = g.find((x) => x['@id'] === uri) ?? g[0] ?? null
      const isPartOf = getIdValues(n, DCT_IS_PART_OF)[0] ?? null
      parentSummaries.value[uri] = { title: getFirstLiteral(n, DCT_TITLE), isPartOf }
      if (isPartOf && isPartOf.replace(/\/$/, '') !== base) {
        await loadParentChain(isPartOf)
      }
    } catch {
      // ignore
    }
  }

  watch(
    node,
    (n) => {
      if (!n) return
      const parentUri = getIdValues(n, DCT_IS_PART_OF)[0]
      if (!parentUri) return
      const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
      if (parentUri.replace(/\/$/, '') !== base) {
        void loadParentChain(parentUri)
      }
    },
    { immediate: true },
  )

  const breadcrumbs = computed(() => {
    const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
    const items: { text: string; uri: string }[] = []

    const fdpRootNode = graph.value.find((n) => n['@id'] === base || n['@id'] === `${base}/`) ?? null
    const fdpTitle = getFirstLiteral(fdpRootNode, DCT_TITLE) ?? 'FAIR Data Point'
    items.push({ text: fdpTitle, uri: base })

    const ancestors: { text: string; uri: string }[] = []
    const visited = new Set<string>()

    let uri: string | undefined = getIdValues(node.value, DCT_IS_PART_OF)[0]
    while (uri && uri.replace(/\/$/, '') !== base && !visited.has(uri)) {
      visited.add(uri)
      ancestors.unshift({
        text: parentSummaries.value[uri]?.title ?? uri,
        uri,
      })
      uri = parentSummaries.value[uri]?.isPartOf ?? undefined
    }

    items.push(...ancestors)

    if (resourceUri.value.replace(/\/$/, '') !== base) {
      items.push({ text: title.value ?? resourceUri.value, uri: resourceUri.value })
    }

    return items
  })

  const childSections = computed(() => {
    const sections = new Map<string, string[]>()
    for (const uri of children.value) {
      const summary = childSummaries.value[uri]
      if (!summary) continue
      const label = summary.type
        ? (compactUri(summary.type).split(':').pop() ?? summary.type)
        : 'Resource'
      if (!sections.has(label)) sections.set(label, [])
      sections.get(label)!.push(uri)
    }
    return [...sections.entries()].map(([label, uris]) => ({ label, uris }))
  })

  return {
    loading,
    error,
    node,
    title,
    description,
    breadcrumbs,
    metadataRows,
    childSections,
    childSummaries,
    internalHref,
  }
}
