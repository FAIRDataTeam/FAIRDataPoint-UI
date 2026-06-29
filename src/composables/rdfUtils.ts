import { Store, Parser, DataFactory } from 'n3'
import type { Literal, Term } from 'n3'
import {
  DCT_TITLE,
  DCT_DESCRIPTION,
  DCT_IS_PART_OF,
  DCT_CONFORMS_TO,
  DCT_ISSUED,
  DCT_MODIFIED,
  DCAT_ACCESS_URL,
  DCAT_DOWNLOAD_URL,
  DCAT_THEME_TAXONOMY,
  FDP_METADATA_ISSUED,
  FDP_METADATA_MODIFIED,
  PROF_HAS_ARTIFACT,
  LDP_DIRECT_CONTAINER,
  LDP_MEMBERSHIP_RESOURCE,
  LDP_HAS_MEMBER_RELATION,
  LDP_CONTAINS,
  RDFS_LABEL,
  FOAF_NAME,
  RDF_TYPE,
  SIO_IS_ABOUT,
  SIO_IS_RELATED_TO,
  DASH_URI_VIEWER,
  DASH_VIEWER,
  SHACL_IRI,
  SHACL_NODE_SHAPE,
  SHACL_TARGET_CLASS,
  SHACL_PROPERTY,
  SHACL_NODE_KIND,
  SHACL_PATH,
  SHACL_NAME,
  SHACL_ORDER,
  prefixes,
  XSD_DATE,
  XSD_DATETIME,
} from './vocabularies'
import { predicateLabel, metadataPredicatePriority } from './shaclFallback'
import { isInternalUri } from './urlUtils'

// --- Types ---

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

type ShapeProperty = {
  path: string
  label: string | null
  order: number
  viewer: string | null
  nodeKind: string | null
}

// --- Low-level helpers ---

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()
  return `${day}-${month}-${year}`
}

export function formatLiteralValue(literal: Literal): string {
  const datatype = literal.datatype.value
  if (datatype === XSD_DATETIME || datatype === XSD_DATE) {
    return formatDate(literal.value)
  }
  return literal.value
}

export function hasType(store: Store, subjectUri: string, type: string): boolean {
  return (
    store.countQuads(
      DataFactory.namedNode(subjectUri),
      DataFactory.namedNode(RDF_TYPE),
      DataFactory.namedNode(type),
      null,
    ) > 0
  )
}

export function compactUri(uri: string): string {
  for (const [base, prefix] of Object.entries(prefixes)) {
    if (uri.startsWith(base)) {
      return `${prefix}:${uri.slice(base.length)}`
    }
  }
  return uri
}

export function getFirstLiteral(
  store: Store,
  subjectUri: string,
  predicate: string,
): string | null {
  const obj = store
    .getObjects(DataFactory.namedNode(subjectUri), DataFactory.namedNode(predicate), null)
    .find((o) => o.termType === 'Literal')
  return obj ? formatLiteralValue(obj as Literal) : null
}

export function getNodeRefs(store: Store, subjectUri: string, predicate: string): string[] {
  return store
    .getObjects(DataFactory.namedNode(subjectUri), DataFactory.namedNode(predicate), null)
    .filter((obj) => obj.termType === 'NamedNode' || obj.termType === 'BlankNode')
    .map((obj) => (obj.termType === 'BlankNode' ? `_:${obj.value}` : obj.value))
}

export function uriLabel(store: Store, uri: string): string {
  // Try the three most common label predicates in order of preference.
  const title =
    getFirstLiteral(store, uri, DCT_TITLE) ??
    getFirstLiteral(store, uri, RDFS_LABEL) ??
    getFirstLiteral(store, uri, FOAF_NAME)

  if (title) return title

  // No label found; fall back to the last URI path segment.
  const lastSegment = uri.split('/').filter(Boolean).pop()
  return lastSegment || uri
}

export function parseTurtle(turtle: string): Store {
  return new Store(new Parser().parse(turtle))
}

// --- Primary subject detection ---

function subjectUriCandidates(preferredUri: string): string[] {
  if (preferredUri.endsWith('/')) {
    return [preferredUri, preferredUri.slice(0, -1)]
  } else {
    return [preferredUri, `${preferredUri}/`]
  }
}

/**
 * FDP responses are inconsistent about trailing slashes on resource subjects, so both
 * variants are tried to find the one that actually exists in the store.
 * @example resolveSubjectUri(store, 'http://localhost/')
 * // -> 'http://localhost'  (if the store has triples for 'http://localhost')
 * @example resolveSubjectUri(store, 'http://localhost')
 * // -> 'http://localhost/' (if the store has triples for 'http://localhost/')
 */
export function resolveSubjectUri(store: Store, preferredUri: string): string | null {
  return (
    subjectUriCandidates(preferredUri).find(
      (uri) => store.countQuads(DataFactory.namedNode(uri), null, null, null) > 0,
    ) ?? null
  )
}

// --- Domain getters ---

export function getTitle(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  // Profile resources use rdfs:label instead of dct:title
  return (
    getFirstLiteral(store, subjectUri, DCT_TITLE) ?? getFirstLiteral(store, subjectUri, RDFS_LABEL)
  )
}

export function getDescription(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  return getFirstLiteral(store, subjectUri, DCT_DESCRIPTION)
}

export function getAccessUrl(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  return getNodeRefs(store, subjectUri, DCAT_ACCESS_URL)[0] ?? null
}

export function getDownloadUrl(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  return getNodeRefs(store, subjectUri, DCAT_DOWNLOAD_URL)[0] ?? null
}

export function getParentUri(store: Store, subjectUri: string): string | null {
  return getNodeRefs(store, subjectUri, DCT_IS_PART_OF)[0] ?? null
}

export function getConformsTo(store: Store, subjectUri: string): string | null {
  return getNodeRefs(store, subjectUri, DCT_CONFORMS_TO)[0] ?? null
}

export function getIssued(store: Store, subjectUri: string): string | null {
  return (
    getFirstLiteral(store, subjectUri, DCT_ISSUED) ??
    getFirstLiteral(store, subjectUri, FDP_METADATA_ISSUED)
  )
}

export function getModified(store: Store, subjectUri: string): string | null {
  return (
    getFirstLiteral(store, subjectUri, DCT_MODIFIED) ??
    getFirstLiteral(store, subjectUri, FDP_METADATA_MODIFIED)
  )
}

export function getTheme(store: Store, subjectUri: string): string | null {
  return getNodeRefs(store, subjectUri, DCAT_THEME_TAXONOMY)[0] ?? null
}

export function getArtifactUris(store: Store): string[] {
  return store
    .getObjects(null, DataFactory.namedNode(PROF_HAS_ARTIFACT), null)
    .filter((o) => o.termType === 'NamedNode')
    .map((o) => o.value)
}

export function getChildSections(
  store: Store,
  subjectUri: string | null,
): { predicate: string; label: string; items: string[] }[] {
  if (!subjectUri) return []
  return store
    .getSubjects(DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(LDP_DIRECT_CONTAINER), null)
    .filter((s) => s.termType === 'NamedNode')
    .map((s) => s.value)
    .filter((containerUri) =>
      getNodeRefs(store, containerUri, LDP_MEMBERSHIP_RESOURCE).includes(subjectUri),
    )
    .map((containerUri) => {
      const pred = getNodeRefs(store, containerUri, LDP_HAS_MEMBER_RELATION)[0] ?? LDP_CONTAINS
      return {
        predicate: pred,
        label: predicateLabel(pred),
        items: getNodeRefs(store, containerUri, LDP_CONTAINS),
      }
    })
}

// --- Breadcrumbs ---

export function getBreadcrumbs(
  store: Store,
  subjectUri: string | null,
  resourceUri: string,
  fdpUri: string,
  parentSummaries: Record<string, { title?: string | null; isPartOf?: string | null }>,
): { text: string; uri: string }[] {
  const items: { text: string; uri: string }[] = []

  const fdpTitle = getTitle(store, fdpUri) ?? 'FAIR Data Point'
  items.push({ text: fdpTitle, uri: fdpUri })

  const normalizedFdpUri = fdpUri.replace(/\/$/, '')
  const ancestors: { text: string; uri: string }[] = []
  const visited = new Set<string>()

  let parentUri: string | null = subjectUri ? getParentUri(store, subjectUri) : null
  while (
    parentUri &&
    parentUri.replace(/\/$/, '') !== normalizedFdpUri &&
    !visited.has(parentUri)
  ) {
    visited.add(parentUri)
    ancestors.unshift({
      text: parentSummaries[parentUri]?.title ?? uriLabel(store, parentUri),
      uri: parentUri,
    })
    parentUri = parentSummaries[parentUri]?.isPartOf ?? null
  }

  items.push(...ancestors)

  if (resourceUri.replace(/\/$/, '') !== normalizedFdpUri) {
    items.push({
      text: (subjectUri ? getTitle(store, subjectUri) : null) ?? uriLabel(store, resourceUri),
      uri: resourceUri,
    })
  }

  return items
}

// --- SHACL/DASH shape properties ---

function getObjectLiteral(store: Store, subject: Term, predicate: string): string | null {
  const obj = store
    .getObjects(subject, DataFactory.namedNode(predicate), null)
    .find((o) => o.termType === 'Literal')
  return obj ? formatLiteralValue(obj as Literal) : null
}

function getObjectNamedNode(store: Store, subject: Term, predicate: string): string | null {
  return (
    store
      .getObjects(subject, DataFactory.namedNode(predicate), null)
      .find((o) => o.termType === 'NamedNode')?.value ?? null
  )
}

function readShapeProperty(shapeGraph: Store, propTerm: Term): ShapeProperty | null {
  const path = getObjectNamedNode(shapeGraph, propTerm, SHACL_PATH)
  if (!path) return null

  const label = getObjectLiteral(shapeGraph, propTerm, SHACL_NAME)
  const orderStr = getObjectLiteral(shapeGraph, propTerm, SHACL_ORDER)
  const order = orderStr ? parseInt(orderStr, 10) : Number.MAX_SAFE_INTEGER
  const viewer = getObjectNamedNode(shapeGraph, propTerm, DASH_VIEWER)
  const nodeKind = getObjectNamedNode(shapeGraph, propTerm, SHACL_NODE_KIND)

  return { path, label, order, viewer, nodeKind }
}

function getShapePropertyMap(
  resourceStore: Store,
  subjectUri: string | null,
  shapeGraphs: Store[],
): Map<string, ShapeProperty> {
  const map = new Map<string, ShapeProperty>()
  if (!subjectUri) return map

  const currentTypes = new Set<string>(getNodeRefs(resourceStore, subjectUri, RDF_TYPE))
  if (currentTypes.size === 0) return map

  for (const shapeGraph of shapeGraphs) {
    for (const subject of shapeGraph.getSubjects(
      DataFactory.namedNode(RDF_TYPE),
      DataFactory.namedNode(SHACL_NODE_SHAPE),
      null,
    )) {
      if (subject.termType !== 'NamedNode') continue
      const targetClasses = getNodeRefs(shapeGraph, subject.value, SHACL_TARGET_CLASS)
      if (!targetClasses.some((tc) => currentTypes.has(tc))) continue

      for (const propTerm of shapeGraph.getObjects(
        subject,
        DataFactory.namedNode(SHACL_PROPERTY),
        null,
      )) {
        const prop = readShapeProperty(shapeGraph, propTerm)
        if (!prop) continue

        // Lower order wins; if the new entry lacks a field, preserve it from the superseded one.
        const existing = map.get(prop.path)
        if (!existing || prop.order < existing.order) {
          map.set(prop.path, {
            path: prop.path,
            label: prop.label ?? existing?.label ?? null,
            order: prop.order,
            viewer: prop.viewer ?? existing?.viewer ?? null,
            nodeKind: prop.nodeKind ?? existing?.nodeKind ?? null,
          })
        }
      }
    }
  }
  return map
}

// --- Metadata rows ---

const embeddedNodeSkipList = new Set([RDF_TYPE, SIO_IS_ABOUT, SIO_IS_RELATED_TO])

// Predicates handled elsewhere in the UI — not shown in the metadata table
const metadataSkipList = new Set([
  RDF_TYPE,
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

// Only one level deep: nested blank-node objects are not resolved.
function resolveBlankNode(store: Store, id: string): BlankNodeProperty[] {
  if (!id.startsWith('_:')) return []
  const subject = DataFactory.blankNode(id.slice(2))

  const predicates = store
    .getPredicates(subject, null, null)
    .map((p) => p.value)
    .filter((p) => !embeddedNodeSkipList.has(p))
    .sort((a, b) => predicateLabel(a).localeCompare(predicateLabel(b)))

  const props: BlankNodeProperty[] = []

  for (const predicate of predicates) {
    const objects = store.getObjects(subject, DataFactory.namedNode(predicate), null)

    const literalValues = objects
      .filter((o) => o.termType === 'Literal')
      .map((o) => formatLiteralValue(o as Literal))

    if (literalValues.length > 0) {
      props.push({
        label: predicateLabel(predicate),
        values: literalValues.map((text) => ({ text })),
      })
      continue
    }

    const linkValues = objects.filter((o) => o.termType === 'NamedNode').map((o) => o.value)

    if (linkValues.length > 0) {
      props.push({
        label: predicateLabel(predicate),
        values: linkValues.map((href) => ({
          text: uriLabel(store, href),
          href,
          internal: isInternalUri(href),
        })),
      })
    }
  }

  return props
}

function buildRow(
  store: Store,
  subjectUri: string,
  predicate: string,
  viewer?: string | null,
  nodeKind?: string | null,
): MetadataRow | null {
  const objects = store.getObjects(
    DataFactory.namedNode(subjectUri),
    DataFactory.namedNode(predicate),
    null,
  )

  const literalValues = [
    ...new Set(
      objects.filter((o) => o.termType === 'Literal').map((o) => formatLiteralValue(o as Literal)),
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
      objects
        .filter((o) => o.termType === 'NamedNode' || o.termType === 'BlankNode')
        .map((o) => (o.termType === 'BlankNode' ? `_:${o.value}` : o.value)),
    ),
  ]

  if (linkValues.length > 0) {
    const blankNodeIds = linkValues.filter((href) => href.startsWith('_:'))

    // If any object is a blank node, named-node siblings for this predicate are dropped.
    // Assumed safe: FDP data does not mix blank nodes and named nodes on the same predicate.
    if (blankNodeIds.length > 0) {
      return {
        predicate,
        label: predicateLabel(predicate),
        kind: 'blank-node',
        values: [],
        blankNodes: blankNodeIds.map((id) => resolveBlankNode(store, id)),
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
            : uriLabel(store, href),
        href,
        internal: isInternalUri(href),
      })),
    }
  }

  return null
}

function hasDashViewer(shape: ShapeProperty | undefined): shape is ShapeProperty {
  return shape?.viewer != null
}

function getFilteredPredicates(store: Store, uri: string): string[] {
  const childPredicates = new Set(getChildSections(store, uri).map((s) => s.predicate))
  return store
    .getPredicates(DataFactory.namedNode(uri), null, null)
    .map((p) => p.value)
    .filter((p) => !metadataSkipList.has(p) && !childPredicates.has(p))
}

function buildRows(
  store: Store,
  uri: string,
  predicates: string[],
  shapePropertyMap: Map<string, ShapeProperty>,
): MetadataRow[] {
  return predicates
    .map((p) => {
      const shape = shapePropertyMap.get(p)
      return buildRow(store, uri, p, shape?.viewer ?? null, shape?.nodeKind ?? null)
    })
    .filter((r): r is MetadataRow => r !== null)
}

export function getMetadataRows(
  store: Store,
  subjectUri: string | null,
  shapeGraphs: Store[],
): { rows: MetadataRow[]; unknownRows: MetadataRow[] } {
  if (!subjectUri) return { rows: [], unknownRows: [] }

  const allPredicates = getFilteredPredicates(store, subjectUri)
  const shapePropertyMap = getShapePropertyMap(store, subjectUri, shapeGraphs)

  if (shapePropertyMap.size === 0) {
    const prioritySet = new Set(metadataPredicatePriority)
    const ordered = [
      ...metadataPredicatePriority.filter((p) => allPredicates.includes(p)),
      ...allPredicates.filter((p) => !prioritySet.has(p)),
    ]
    return { rows: buildRows(store, subjectUri, ordered, shapePropertyMap), unknownRows: [] }
  }

  const shapeOrdered = allPredicates
    .flatMap((p) => {
      const shape = shapePropertyMap.get(p)
      return hasDashViewer(shape) ? [{ p, order: shape.order }] : []
    })
    .sort((a, b) => a.order - b.order)
    .map(({ p }) => p)

  const unknown = allPredicates
    .filter((p) => !hasDashViewer(shapePropertyMap.get(p)))
    .sort((a, b) => predicateLabel(a).localeCompare(predicateLabel(b)))

  return {
    rows: buildRows(store, subjectUri, shapeOrdered, shapePropertyMap),
    unknownRows: buildRows(store, subjectUri, unknown, shapePropertyMap),
  }
}
