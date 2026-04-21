import { computed, watch, watchEffect, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  fetchRdf,
  flattenGraph,
  getFirstLiteral,
  getIdValues,
  compactUri,
  internalHref,
  hasType,
  uriLabel,
  formatLiteralValue,
  type RdfNode,
  type RdfValue,
} from './rdfUtils'
import { predicateLabel, metadataPredicatePriority } from './shaclFallback'
import {
  DCT_TITLE,
  DCT_DESCRIPTION,
  DCT_IS_PART_OF,
  DCT_CONFORMS_TO,
  RDFS_LABEL,
  LDP_CONTAINS,
  LDP_DIRECT_CONTAINER,
  LDP_MEMBERSHIP_RESOURCE,
  LDP_HAS_MEMBER_RELATION,
  SHACL_NODE_SHAPE,
  SHACL_TARGET_CLASS,
  SHACL_PROPERTY,
  SHACL_PATH,
  SHACL_NAME,
  SHACL_ORDER,
  SHACL_NODE_KIND,
  SHACL_IRI,
  DASH_VIEWER,
  DASH_URI_VIEWER,
  DCAT_ACCESS_URL,
  DCAT_DOWNLOAD_URL,
  PROF_HAS_ARTIFACT,
  SIO_IS_ABOUT,
  SIO_IS_RELATED_TO,
} from './vocabularies'

type LinkValue = {
  text: string
  href?: string
  internal?: boolean
}

type BlankNodeProperty = {
  label: string
  values: LinkValue[]
}

export type MetadataRow = {
  predicate: string
  label: string
  kind: 'literal' | 'link' | 'blank-node'
  values: LinkValue[]
  blankNodes?: BlankNodeProperty[][]
}

type ChildSummary = {
  title: string | null
  description: string | null
}

type ParentSummary = {
  title: string | null
  isPartOf: string | null
}

type ShapeProperty = {
  path: string
  label: string | null
  order: number
  viewer: string | null
  nodeKind: string | null
}

const embeddedNodeSkipList = new Set(['@id', '@type', '@graph', SIO_IS_ABOUT, SIO_IS_RELATED_TO])

const metadataSkipList = new Set([
  '@id',
  '@type',
  '@graph',
  DCT_TITLE,
  DCT_DESCRIPTION,
  RDFS_LABEL,
  DCAT_ACCESS_URL,
  DCAT_DOWNLOAD_URL,
  DCT_IS_PART_OF,
  LDP_CONTAINS,
  LDP_MEMBERSHIP_RESOURCE,
  LDP_HAS_MEMBER_RELATION,
  SIO_IS_ABOUT,
  SIO_IS_RELATED_TO,
])

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
  const shapeGraphs = ref<Record<string, RdfNode[]>>({})

  watchEffect(async () => {
    loading.value = true
    error.value = null
    node.value = null
    graph.value = []
    childSummaries.value = {}
    parentSummaries.value = {}
    shapeGraphs.value = {}

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

  function getNodeById(id: string): RdfNode | null {
    return graph.value.find((n) => n['@id'] === id) ?? null
  }

  function isInternalUri(uri: string): boolean {
    const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
    const normalized = uri.replace(/\/$/, '')
    return normalized === base || normalized.startsWith(`${base}/`)
  }

  function resourceLabel(uri: string): string {
    return uriLabel(uri, getNodeById(uri))
  }

  const title = computed(() => {
    if (!node.value) return null
    const explicit = getFirstLiteral(node.value, DCT_TITLE) ?? getFirstLiteral(node.value, RDFS_LABEL)
    if (explicit) return explicit
    if (hasType(node.value, SHACL_NODE_SHAPE)) {
      const targetClass = getIdValues(node.value, SHACL_TARGET_CLASS)[0]
      if (targetClass) return `Shape: ${compactUri(targetClass)}`
    }
    return null
  })

  const description = computed(() => getFirstLiteral(node.value, DCT_DESCRIPTION))

  const shapePropertyMap = computed<Map<string, ShapeProperty>>(() => {
    const map = new Map<string, ShapeProperty>()
    const currentTypes = new Set<string>(
      Array.isArray(node.value?.['@type']) ? (node.value!['@type'] as string[]) : [],
    )
    if (currentTypes.size === 0) return map

    for (const shapeGraph of Object.values(shapeGraphs.value)) {
      const relevantPropertyIds = new Set<string>()
      for (const n of shapeGraph) {
        if (!hasType(n, SHACL_NODE_SHAPE)) continue
        const targetClasses = getIdValues(n, SHACL_TARGET_CLASS)
        if (!targetClasses.some((tc) => currentTypes.has(tc))) continue
        getIdValues(n, SHACL_PROPERTY).forEach((id) => relevantPropertyIds.add(id))
      }

      for (const n of shapeGraph) {
        const nodeId = n['@id']
        if (typeof nodeId !== 'string' || !relevantPropertyIds.has(nodeId)) continue
        const path = getIdValues(n, SHACL_PATH)[0]
        if (!path) continue
        const label = getFirstLiteral(n, SHACL_NAME)
        const orderRaw = n[SHACL_ORDER]
        const order =
          Array.isArray(orderRaw) && orderRaw.length > 0
            ? parseInt((orderRaw[0] as RdfValue)['@value'] ?? '999', 10)
            : 999
        const viewer = getIdValues(n, DASH_VIEWER)[0] ?? null
        const nodeKind = getIdValues(n, SHACL_NODE_KIND)[0] ?? null
        const existing = map.get(path)
        if (!existing || order < existing.order) {
          map.set(path, {
            path,
            label: label ?? existing?.label ?? null,
            order,
            viewer: viewer ?? existing?.viewer ?? null,
            nodeKind: nodeKind ?? existing?.nodeKind ?? null,
          })
        }
      }
    }
    return map
  })

  async function loadShapeDocument(uri: string): Promise<void> {
    if (shapeGraphs.value[uri]) return
    try {
      const { nodes } = await fetchRdf(uri)
      shapeGraphs.value[uri] = flattenGraph(nodes)
    } catch {
      // ignore
    }
  }

  async function loadProfile(uri: string): Promise<void> {
    try {
      const { nodes } = await fetchRdf(uri)
      const profileGraph = flattenGraph(nodes)
      const artifactUris = profileGraph.flatMap((n) => getIdValues(n, PROF_HAS_ARTIFACT))
      for (const artifactUri of artifactUris) {
        void loadShapeDocument(artifactUri)
      }
    } catch {
      // ignore
    }
  }

  watch(
    node,
    (n) => {
      if (!n) return
      const profileUri = getIdValues(n, DCT_CONFORMS_TO)[0]
      if (profileUri) void loadProfile(profileUri)
    },
    { immediate: true },
  )

  function resolveBlankNode(id: string): BlankNodeProperty[] {
    const n = getNodeById(id)
    if (!n) return []
    const props: BlankNodeProperty[] = []
    const predicates = Object.keys(n)
      .filter((p) => !embeddedNodeSkipList.has(p))
      .sort((a, b) => predicateLabel(a).localeCompare(predicateLabel(b)))
    for (const predicate of predicates) {
      const raw = n[predicate]
      if (!Array.isArray(raw) || raw.length === 0) continue
      const literalValues = (raw as RdfValue[])
        .map(formatLiteralValue)
        .filter((v): v is string => v !== null)
      if (literalValues.length > 0) {
        props.push({ label: predicateLabel(predicate), values: literalValues.map((text) => ({ text })) })
        continue
      }
      const linkValues = (raw as RdfValue[])
        .filter((item) => typeof item['@id'] === 'string')
        .map((item) => item['@id'] as string)
      if (linkValues.length > 0) {
        props.push({
          label: predicateLabel(predicate),
          values: linkValues.map((href) => ({
            text: resourceLabel(href),
            href,
            internal: isInternalUri(href),
          })),
        })
      }
    }
    return props
  }

  function buildRow(
    predicate: string,
    raw: unknown[],
    viewer?: string | null,
    nodeKind?: string | null,
  ): MetadataRow | null {
    const literalValues = [
      ...new Set(
        (raw as RdfValue[]).map(formatLiteralValue).filter((v): v is string => v !== null),
      ),
    ]
    if (literalValues.length > 0) {
      return {
        predicate,
        label: predicateLabel(predicate),
        kind: 'literal',
        values: literalValues.map((text) => ({ text })),
      }
    }

    const linkValues = [
      ...new Set(
        (raw as RdfValue[])
          .filter((item) => typeof item['@id'] === 'string')
          .map((item) => item['@id'] as string),
      ),
    ]
    if (linkValues.length > 0) {
      const hasBlankNodes = linkValues.some((href) => href.startsWith('_:'))
      if (hasBlankNodes) {
        return {
          predicate,
          label: predicateLabel(predicate),
          kind: 'blank-node',
          values: [],
          blankNodes: linkValues
            .filter((href) => href.startsWith('_:'))
            .map((id) => resolveBlankNode(id)),
        }
      }
      return {
        predicate,
        label: predicateLabel(predicate),
        kind: 'link',
        values: linkValues.map((href) => ({
          text:
            viewer === DASH_URI_VIEWER || (viewer == null && nodeKind === SHACL_IRI)
              ? href
              : resourceLabel(href),
          href,
          internal: isInternalUri(href),
        })),
      }
    }
    return null
  }

  function buildRowsFor(n: RdfNode, predicates: string[]): MetadataRow[] {
    const rows: MetadataRow[] = []
    for (const predicate of predicates) {
      const raw = n[predicate]
      if (!Array.isArray(raw) || raw.length === 0) continue
      const shape = shapePropertyMap.value.get(predicate)
      const row = buildRow(predicate, raw, shape?.viewer ?? null, shape?.nodeKind ?? null)
      if (row) rows.push(row)
    }
    return rows
  }

  const childSections = computed(() => {
    const n = node.value
    if (!n || typeof n['@id'] !== 'string') return []
    return graph.value
      .filter((candidate) => hasType(candidate, LDP_DIRECT_CONTAINER))
      .filter((candidate) =>
        getIdValues(candidate, LDP_MEMBERSHIP_RESOURCE).includes(n['@id'] as string),
      )
      .map((candidate) => {
        const relation = getIdValues(candidate, LDP_HAS_MEMBER_RELATION)[0] ?? LDP_CONTAINS
        const items = getIdValues(candidate, LDP_CONTAINS)
        return { predicate: relation, label: predicateLabel(relation), items }
      })
  })

  watch(
    childSections,
    async (sections) => {
      const uris = [...new Set(sections.flatMap((s) => s.items))]
      for (const uri of uris) {
        if (childSummaries.value[uri]) continue
        try {
          const { nodes } = await fetchRdf(uri)
          const g = flattenGraph(nodes)
          const n = g.find((x) => x['@id'] === uri) ?? g[0] ?? null
          childSummaries.value[uri] = {
            title: getFirstLiteral(n, DCT_TITLE),
            description: getFirstLiteral(n, DCT_DESCRIPTION),
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
      ancestors.unshift({ text: parentSummaries.value[uri]?.title ?? uri, uri })
      uri = parentSummaries.value[uri]?.isPartOf ?? undefined
    }
    items.push(...ancestors)
    if (resourceUri.value.replace(/\/$/, '') !== base) {
      items.push({ text: title.value ?? resourceUri.value, uri: resourceUri.value })
    }
    return items
  })

  const metadataRows = computed<MetadataRow[]>(() => {
    if (!node.value) return []
    const allPredicates = Object.keys(node.value).filter((p) => !metadataSkipList.has(p))
    const shapeLoaded = shapePropertyMap.value.size > 0

    let predicates: string[]
    if (shapeLoaded) {
      predicates = allPredicates
        .filter((p) => shapePropertyMap.value.get(p)?.viewer != null)
        .sort((a, b) => shapePropertyMap.value.get(a)!.order - shapePropertyMap.value.get(b)!.order)
    } else {
      const prioritized = metadataPredicatePriority.filter((p) => allPredicates.includes(p))
      const prioritySet = new Set(prioritized)
      predicates = [...prioritized, ...allPredicates.filter((p) => !prioritySet.has(p))]
    }

    return buildRowsFor(node.value, predicates)
  })

  const unknownMetadataRows = computed<MetadataRow[]>(() => {
    if (!node.value || shapePropertyMap.value.size === 0) return []
    const allPredicates = Object.keys(node.value).filter((p) => !metadataSkipList.has(p))
    const unknown = allPredicates
      .filter((p) => !shapePropertyMap.value.get(p)?.viewer)
      .sort((a, b) => predicateLabel(a).localeCompare(predicateLabel(b)))
    return buildRowsFor(node.value, unknown)
  })

  return {
    loading,
    error,
    node,
    title,
    description,
    breadcrumbs,
    metadataRows,
    unknownMetadataRows,
    childSections,
    childSummaries,
    internalHref,
  }
}
