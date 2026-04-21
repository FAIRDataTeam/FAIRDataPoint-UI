import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  flattenGraph,
  hasType,
  compactUri,
  formatLiteralValue,
  getFirstLiteral,
  getIdValues,
  uriLabel,
  internalHref,
  type RdfNode,
  type RdfValue,
} from './rdfUtils'
import { metadataPredicatePriority, predicateLabel } from './shaclFallback'
import {
  DCT_TITLE,
  DCT_DESCRIPTION,
  DCT_IS_PART_OF,
  RDFS_LABEL,
  LDP_DIRECT_CONTAINER,
  LDP_CONTAINS,
  LDP_MEMBERSHIP_RESOURCE,
  LDP_HAS_MEMBER_RELATION,
  SHACL_NODE_SHAPE,
  SHACL_TARGET_CLASS,
  SHACL_PROPERTY,
  SHACL_NODE_KIND,
  SHACL_IRI,
  DCT_CONFORMS_TO,
  SHACL_PATH,
  SHACL_NAME,
  SHACL_ORDER,
  DASH_VIEWER,
  DASH_URI_VIEWER,
  DCAT_ACCESS_URL,
  DCAT_DOWNLOAD_URL,
  SIO_IS_ABOUT,
  SIO_IS_RELATED_TO,
} from './vocabularies'
import { useRdfLoader, isPrimaryDomainNode, type ChildSummary } from './useRdfLoader'

type LinkValue = {
  text: string
  href?: string
  internal?: boolean
}

type BlankNodeProperty = {
  label: string
  values: LinkValue[]
}

type MetadataRow = {
  predicate: string
  label: string
  kind: 'literal' | 'link' | 'blank-node'
  values: LinkValue[]
  blankNodes?: BlankNodeProperty[][]
}

type ChildSection = {
  predicate: string
  label: string
  items: string[]
}

type ShapeProperty = {
  path: string
  label: string | null
  order: number
  viewer: string | null
  nodeKind: string | null
}

export type { ChildSummary }

const embeddedNodeSkipList = new Set([
  '@id',
  '@type',
  '@graph',
  SIO_IS_ABOUT,
  SIO_IS_RELATED_TO,
])

// Predicates handled elsewhere in the UI — not shown in the metadata table
const metadataSkipList = new Set([
  '@id',
  '@type',
  '@graph',
  // Shown in page header
  DCT_TITLE,
  DCT_DESCRIPTION,
  RDFS_LABEL,
  // Promoted to access/download buttons
  DCAT_ACCESS_URL,
  DCAT_DOWNLOAD_URL,
  // Used for breadcrumbs
  DCT_IS_PART_OF,
  // LDP structural predicates
  LDP_CONTAINS,
  LDP_MEMBERSHIP_RESOURCE,
  LDP_HAS_MEMBER_RELATION,
  // SIO provenance predicates from the server's named graph container, not resource metadata
  SIO_IS_ABOUT,
  SIO_IS_RELATED_TO,
])

export function useResourceView() {
  const route = useRoute()
  const fdpBaseUri = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')

  const fdpUri = computed(() => `${fdpBaseUri}/`)

  const resourceUri = computed(() => {
    const resourceType = route.params.resourceType
    const id = route.params.id

    if (typeof resourceType === 'string' && typeof id === 'string') {
      return `${import.meta.env.VITE_FDP_BASE_URL}/${resourceType}/${id}`
    }

    return `${import.meta.env.VITE_FDP_BASE_URL}/`
  })

  const {
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
  } = useRdfLoader()

  const graph = computed(() => flattenGraph(rawGraph.value))

  function getNodeById(id: string): RdfNode | null {
    return graph.value.find((node) => node['@id'] === id) ?? null
  }

  function resourceLabel(uri: string): string {
    return uriLabel(uri, getNodeById(uri))
  }

  function isInternalUri(uri: string): boolean {
    const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
    const normalized = uri.replace(/\/$/, '')
    return normalized === base || normalized.startsWith(`${base}/`)
  }

  const currentNode = computed(() => {
    const exact = graph.value.find((node) => node['@id'] === resourceUri.value)

    if (exact && !hasType(exact, LDP_DIRECT_CONTAINER)) return exact

    const preferred = graph.value.find((node) => isPrimaryDomainNode(node))
    if (preferred) return preferred

    if (exact) return exact

    return graph.value.find((node) => typeof node['@id'] === 'string') ?? null
  })

  const shapePropertyMap = computed<Map<string, ShapeProperty>>(() => {
    const map = new Map<string, ShapeProperty>()

    const currentTypes = new Set<string>(
      Array.isArray(currentNode.value?.['@type']) ? (currentNode.value!['@type'] as string[]) : [],
    )
    if (currentTypes.size === 0) return map

    for (const shapeGraph of Object.values(shapeGraphs.value)) {
      const relevantPropertyIds = new Set<string>()
      for (const node of shapeGraph) {
        if (!hasType(node, SHACL_NODE_SHAPE)) continue
        const targetClasses = getIdValues(node, SHACL_TARGET_CLASS)
        if (!targetClasses.some((tc) => currentTypes.has(tc))) continue
        getIdValues(node, SHACL_PROPERTY).forEach((id) => relevantPropertyIds.add(id))
      }

      for (const node of shapeGraph) {
        const nodeId = node['@id']
        if (typeof nodeId !== 'string' || !relevantPropertyIds.has(nodeId)) continue

        const path = getIdValues(node, SHACL_PATH)[0]
        if (!path) continue

        const label = getFirstLiteral(node, SHACL_NAME)
        const orderRaw = node[SHACL_ORDER]
        const order =
          Array.isArray(orderRaw) && orderRaw.length > 0
            ? parseInt((orderRaw[0] as RdfValue)['@value'] ?? '999', 10)
            : 999
        const viewer = getIdValues(node, DASH_VIEWER)[0] ?? null
        const nodeKind = getIdValues(node, SHACL_NODE_KIND)[0] ?? null

        // Lowest order wins — most specific ordering takes precedence
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

  const title = computed(() => {
    const node = currentNode.value
    if (!node) return null

    const explicit = getFirstLiteral(node, DCT_TITLE) ?? getFirstLiteral(node, RDFS_LABEL)
    if (explicit) return explicit

    if (hasType(node, SHACL_NODE_SHAPE)) {
      const targetClass = getIdValues(node, SHACL_TARGET_CLASS)[0]
      if (targetClass) return `Shape: ${compactUri(targetClass)}`
    }

    return null
  })

  const description = computed(() => getFirstLiteral(currentNode.value, DCT_DESCRIPTION))

  const accessUrl = computed(() => getIdValues(currentNode.value, DCAT_ACCESS_URL)[0] ?? null)
  const downloadUrl = computed(() => getIdValues(currentNode.value, DCAT_DOWNLOAD_URL)[0] ?? null)

  const breadcrumbs = computed(() => {
    const items: { text: string; uri: string }[] = []

    const fdpTitle = getFirstLiteral(getNodeById(fdpUri.value), DCT_TITLE) ?? 'FAIR Data Point'
    items.push({ text: fdpTitle, uri: fdpUri.value })

    const normalizedFdpUri = fdpUri.value.replace(/\/$/, '')
    const ancestors: { text: string; uri: string }[] = []
    const visited = new Set<string>()

    let uri: string | undefined = getIdValues(currentNode.value, DCT_IS_PART_OF)[0]
    while (uri && uri.replace(/\/$/, '') !== normalizedFdpUri && !visited.has(uri)) {
      visited.add(uri)
      ancestors.unshift({
        text: parentSummaries.value[uri]?.title ?? resourceLabel(uri),
        uri,
      })
      // Walk up using the isPartOf stored during recursive fetch
      uri = parentSummaries.value[uri]?.isPartOf ?? undefined
    }

    items.push(...ancestors)

    const normalizedResourceUri = resourceUri.value.replace(/\/$/, '')
    if (normalizedResourceUri !== normalizedFdpUri) {
      items.push({
        text: title.value ?? resourceLabel(resourceUri.value),
        uri: resourceUri.value,
      })
    }

    return items
  })

  function resolveBlankNode(id: string): BlankNodeProperty[] {
    const node = getNodeById(id)
    if (!node) return []

    const props: BlankNodeProperty[] = []

    const predicates = Object.keys(node)
      .filter((p) => !embeddedNodeSkipList.has(p))
      .sort((a, b) => predicateLabel(a).localeCompare(predicateLabel(b)))

    for (const predicate of predicates) {
      const raw = node[predicate]
      if (!Array.isArray(raw) || raw.length === 0) continue

      const literalValues = raw
        .map((item) => item as RdfValue)
        .map(formatLiteralValue)
        .filter((v): v is string => v !== null)

      if (literalValues.length > 0) {
        props.push({
          label: predicateLabel(predicate),
          values: literalValues.map((text) => ({ text })),
        })
        continue
      }

      const linkValues = raw
        .map((item) => item as RdfValue)
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

  function buildRow(predicate: string, raw: unknown[], viewer?: string | null, nodeKind?: string | null): MetadataRow | null {
    const literalValues = [
      ...new Set(
        raw
          .map((item) => item as RdfValue)
          .map(formatLiteralValue)
          .filter((value): value is string => typeof value === 'string'),
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
        raw
          .map((item) => item as RdfValue)
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
          text: viewer === DASH_URI_VIEWER || (viewer == null && nodeKind === SHACL_IRI) ? href : resourceLabel(href),
          href,
          internal: isInternalUri(href),
        })),
      }
    }

    return null
  }

  function buildRowsFor(node: RdfNode, predicates: string[]): MetadataRow[] {
    const rows: MetadataRow[] = []
    for (const predicate of predicates) {
      const raw = node[predicate]
      if (!Array.isArray(raw) || raw.length === 0) continue
      const shape = shapePropertyMap.value.get(predicate)
      const viewer = shape?.viewer ?? null
      const nodeKind = shape?.nodeKind ?? null
      const row = buildRow(predicate, raw, viewer, nodeKind)
      if (row) rows.push(row)
    }
    return rows
  }

  const childSections = computed<ChildSection[]>(() => {
    const node = currentNode.value
    if (!node || typeof node['@id'] !== 'string') return []

    return graph.value
      .filter((candidate) => hasType(candidate, LDP_DIRECT_CONTAINER))
      .filter((candidate) =>
        getIdValues(candidate, LDP_MEMBERSHIP_RESOURCE).includes(node['@id'] as string),
      )
      .map((candidate) => {
        const relation = getIdValues(candidate, LDP_HAS_MEMBER_RELATION)[0] ?? LDP_CONTAINS
        const items = getIdValues(candidate, LDP_CONTAINS)
        return { predicate: relation, label: predicateLabel(relation), items }
      })
  })

  const nodePredicateSets = computed(() => {
    const node = currentNode.value
    if (!node) return null

    const childSectionPredicates = new Set(childSections.value.map((s) => s.predicate))
    const allPredicates = Object.keys(node).filter(
      (p) => !metadataSkipList.has(p) && !childSectionPredicates.has(p),
    )
    const shapeLoaded = shapePropertyMap.value.size > 0

    const shapeOrdered = allPredicates
      .filter((p) => shapePropertyMap.value.get(p)?.viewer != null)
      .sort((a, b) => shapePropertyMap.value.get(a)!.order - shapePropertyMap.value.get(b)!.order)

    const unknown = allPredicates
      .filter((p) => !shapePropertyMap.value.get(p)?.viewer)
      .sort((a, b) => predicateLabel(a).localeCompare(predicateLabel(b)))
    return { node, allPredicates, shapeLoaded, shapeOrdered, unknown }
  })

  const metadataRows = computed<MetadataRow[]>(() => {
    const sets = nodePredicateSets.value
    if (!sets) return []
    const { node, allPredicates, shapeLoaded, shapeOrdered } = sets

    let predicates: string[]
    if (shapeLoaded) {
      predicates = shapeOrdered
    } else {
      const prioritized = metadataPredicatePriority.filter((p) => allPredicates.includes(p))
      const prioritySet = new Set(prioritized)
      predicates = [...prioritized, ...allPredicates.filter((p) => !prioritySet.has(p))]
    }

    return buildRowsFor(node, predicates)
  })

  const unknownMetadataRows = computed<MetadataRow[]>(() => {
    const sets = nodePredicateSets.value
    if (!sets || !sets.shapeLoaded) return []
    return buildRowsFor(sets.node, sets.unknown)
  })

  watch(
    resourceUri,
    async (uri) => {
      await loadResource(uri)
    },
    { immediate: true },
  )

  watch(
    childSections,
    (sections) => {
      const uris = [...new Set(sections.flatMap((section) => section.items))]
      uris.forEach((uri) => {
        void loadChildSummary(uri)
      })
    },
    { immediate: true },
  )

  watch(
    currentNode,
    (node) => {
      if (!node) return
      const parentUri = getIdValues(node, DCT_IS_PART_OF)[0]
      if (parentUri && parentUri !== fdpUri.value) {
        void loadParentChain(parentUri)
      }
    },
    { immediate: true },
  )

  watch(
    currentNode,
    (node) => {
      if (!node) return
      const profileUri = getIdValues(node, DCT_CONFORMS_TO)[0]
      if (profileUri) void loadProfile(profileUri)
    },
    { immediate: true },
  )

  return {
    loading,
    error,
    activeFormat,
    activeRawText,
    resourceUri,
    currentNode,
    title,
    description,
    accessUrl,
    downloadUrl,
    breadcrumbs,
    graph,
    metadataRows,
    unknownMetadataRows,
    childSections,
    childSummaries,
    resourceLabel,
    internalHref,
  }
}
