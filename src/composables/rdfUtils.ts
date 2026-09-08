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
  DCAT_ENDPOINT_DESCRIPTION,
  DCAT_ENDPOINT_URL,
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

/** Returns the literal value as a string; date and datetime values are converted to DD-MM-YYYY. */
export function formatLiteralValue(literal: Literal): string {
  const datatype = literal.datatype.value
  if (datatype === XSD_DATETIME || datatype === XSD_DATE) {
    return formatDate(literal.value)
  }
  return literal.value
}

/** Returns true if the subject has the given RDF type in the store. */
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

/**
 * Shortens a full URI to a prefixed form using known vocabulary prefixes;
 * returns the URI unchanged if no prefix matches.
 * @example compactUri('http://purl.org/dc/terms/title') // -> 'dct:title'
 * @example compactUri('https://example.com/unknown')   // -> 'https://example.com/unknown'
 */
export function compactUri(uri: string): string {
  for (const [base, prefix] of Object.entries(prefixes)) {
    if (uri.startsWith(base)) {
      return `${prefix}:${uri.slice(base.length)}`
    }
  }
  return uri
}

/** Returns the first literal value for a subject/predicate pair. */
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

/**
 * Returns all named node and blank node objects for a subject/predicate pair as strings;
 * named nodes as URIs, blank nodes as '_:id'.
 */
export function getNodeRefs(store: Store, subjectUri: string, predicate: string): string[] {
  return store
    .getObjects(DataFactory.namedNode(subjectUri), DataFactory.namedNode(predicate), null)
    .filter((obj) => obj.termType === 'NamedNode' || obj.termType === 'BlankNode')
    .map((obj) => (obj.termType === 'BlankNode' ? `_:${obj.value}` : obj.value))
}

/**
 * Returns a human-readable label for a URI, checking dct:title, rdfs:label, and foaf:name;
 * falls back to the last URI path segment.
 */
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

/** Parses a Turtle string into an N3 Store. */
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

/** Returns the dct:title of a subject, falling back to rdfs:label. */
export function getTitle(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  // Profile resources use rdfs:label instead of dct:title
  return (
    getFirstLiteral(store, subjectUri, DCT_TITLE) ?? getFirstLiteral(store, subjectUri, RDFS_LABEL)
  )
}

/** Returns the dct:description of a subject. */
export function getDescription(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  return getFirstLiteral(store, subjectUri, DCT_DESCRIPTION)
}

/** Returns the dcat:accessURL of a subject. */
export function getAccessUrl(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  return getNodeRefs(store, subjectUri, DCAT_ACCESS_URL)[0] ?? null
}

/** Returns the dcat:downloadURL of a subject. */
export function getDownloadUrl(store: Store, subjectUri: string | null): string | null {
  if (!subjectUri) return null
  return getNodeRefs(store, subjectUri, DCAT_DOWNLOAD_URL)[0] ?? null
}

/** Returns the dct:isPartOf URI of a subject. */
export function getParentUri(store: Store, subjectUri: string): string | null {
  return getNodeRefs(store, subjectUri, DCT_IS_PART_OF)[0] ?? null
}

/** Returns the dct:conformsTo URI of a subject (its profile). */
export function getConformsTo(store: Store, subjectUri: string): string | null {
  return getNodeRefs(store, subjectUri, DCT_CONFORMS_TO)[0] ?? null
}

/** Returns the issued date, checking dct:issued then fdp-o:metadataIssued. */
export function getIssued(store: Store, subjectUri: string): string | null {
  return (
    getFirstLiteral(store, subjectUri, DCT_ISSUED) ??
    getFirstLiteral(store, subjectUri, FDP_METADATA_ISSUED)
  )
}

/** Returns the modified date, checking dct:modified then fdp-o:metadataModified. */
export function getModified(store: Store, subjectUri: string): string | null {
  return (
    getFirstLiteral(store, subjectUri, DCT_MODIFIED) ??
    getFirstLiteral(store, subjectUri, FDP_METADATA_MODIFIED)
  )
}

/** Returns the first dcat:themeTaxonomy URI of a subject. */
export function getTheme(store: Store, subjectUri: string): string | null {
  return getNodeRefs(store, subjectUri, DCAT_THEME_TAXONOMY)[0] ?? null
}

/**
 * Returns all prof:hasArtifact URIs from the store
 * (used to collect SHACL shape documents from a profile).
 */
export function getArtifactUris(store: Store): string[] {
  return store
    .getObjects(null, DataFactory.namedNode(PROF_HAS_ARTIFACT), null)
    .filter((o) => o.termType === 'NamedNode')
    .map((o) => o.value)
}

/**
 * Returns child sections for a resource: each LDP DirectContainer linked via
 * ldp:membershipResource becomes a section with its member relation predicate,
 * a human-readable label, and the list of ldp:contains URIs.
 */
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

/**
 * Builds the breadcrumb trail from the FDP root to the current resource.
 * The root label is taken from the store if present, otherwise falls back to 'FAIR Data Point'.
 * Intermediate ancestors are resolved from parentSummaries (pre-loaded dct:isPartOf chain).
 * The current resource is appended last, unless it is the FDP root itself.
 */
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

/** Like getFirstLiteral but takes an N3 Term as subject; used when iterating SHACL shape nodes. */
function getObjectLiteral(store: Store, subject: Term, predicate: string): string | null {
  const obj = store
    .getObjects(subject, DataFactory.namedNode(predicate), null)
    .find((o) => o.termType === 'Literal')
  return obj ? formatLiteralValue(obj as Literal) : null
}

/** Like getNodeRefs but takes an N3 Term as subject and returns only the first named node value. */
function getObjectNamedNode(store: Store, subject: Term, predicate: string): string | null {
  return (
    store
      .getObjects(subject, DataFactory.namedNode(predicate), null)
      .find((o) => o.termType === 'NamedNode')?.value ?? null
  )
}

/**
 * Reads a SHACL property shape node into a ShapeProperty struct.
 * Returns null if the node has no shacl:path.
 * shacl:order defaults to MAX_SAFE_INTEGER when absent, so unordered properties sort last.
 */
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

/**
 * Builds a map of shacl:path -> ShapeProperty for the current resource's RDF types.
 * Searches all provided shape graphs for NodeShapes whose shacl:targetClass matches one of
 * the resource's types. When multiple shapes define the same path, the lower shacl:order wins;
 * missing fields are filled from the superseded entry.
 */
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

// Predicates excluded from the metadata table: those with dedicated UI sections
// (title, description, access/download URLs), navigation predicates (breadcrumbs,
// child sections), LDP container structure, and FDP-internal SIO provenance.
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

// dcat:endpointURL/endpointDescription describe a dcat:DataService's real API address and its
// docs (e.g. OpenAPI, Swagger UI), not browsable FDP resources. Even when same-origin as this FDP
// instance, they're not resources the router has a matching route for. Always render as external
// links pointing at the actual backend, regardless of which function builds the row.
const alwaysExternalPredicates = new Set([DCAT_ENDPOINT_DESCRIPTION, DCAT_ENDPOINT_URL])

/**
 * Resolves a blank node to its predicate/value pairs for display.
 * Only one level deep; nested blank-node objects are not resolved.
 */
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
          internal: !alwaysExternalPredicates.has(predicate) && isInternalUri(href),
        })),
      })
    }
  }

  return props
}

/**
 * Builds a MetadataRow for a given predicate, classifying it as literal, blank-node, or link.
 * The viewer and nodeKind hints (from SHACL) control how link text is rendered.
 * Returns null if the predicate has no objects in the store.
 */
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
        internal: !alwaysExternalPredicates.has(predicate) && isInternalUri(href),
      })),
    }
  }

  return null
}

function hasDashViewer(shape: ShapeProperty | undefined): shape is ShapeProperty {
  return shape?.viewer != null
}

/**
 * Returns the predicates for a resource that should appear in the metadata table:
 * excludes predicates in metadataSkipList (handled elsewhere in the UI) and child
 * container predicates.
 */
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

/**
 * Partitions a resource's predicates into ordered metadata rows (guided by SHACL shape)
 * and unknown rows (predicates with no dash:viewer). When no shape is loaded, all predicates
 * go into rows ordered by metadataPredicatePriority, and unknownRows is empty.
 */
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
