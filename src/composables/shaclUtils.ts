import { DataFactory } from 'n3'
import type { Store, Term } from 'n3'
import {
  DASH_EDITOR,
  DASH_VIEWER,
  RDF_TYPE,
  SHACL_MAX_COUNT,
  SHACL_MIN_COUNT,
  SHACL_DATATYPE,
  SHACL_NAME,
  SHACL_NODE,
  SHACL_NODE_KIND,
  SHACL_NODE_SHAPE,
  SHACL_ORDER,
  SHACL_PATH,
  SHACL_PROPERTY,
  SHACL_TARGET_CLASS,
} from './vocabularies'
import { getFirstLiteral, getNodeRefs } from './rdfUtils'

/** SHACL constraints and UI hints for one property path. */
export type ShapeProperty = {
  path: string
  label: string | null
  order: number
  viewer: string | null
  editor: string | null
  nodeKind: string | null
  datatype: string | null
  /** IRI of the nested shape referenced by sh:node. */
  node: string | null
  /** Resolved properties of the referenced shape; empty when unavailable or at the depth limit. */
  nested: ReadonlyMap<string, ShapeProperty>
  minCount: number | null
  maxCount: number | null
}

/** An editor-enabled property with recursively filtered and ordered nested fields. */
export type EditableField = Omit<ShapeProperty, 'nested'> & {
  editor: string
  nested: EditableField[]
}

/** Returns the first named-node object's IRI. */
function getObjectNamedNode(store: Store, subject: Term, predicate: string): string | null {
  return (
    store
      .getObjects(subject, DataFactory.namedNode(predicate), null)
      .find((o) => o.termType === 'NamedNode')?.value ?? null
  )
}

/** Parses a SHACL cardinality literal; absent or unparseable means no constraint. */
function readCount(shapeGraph: Store, propTerm: Term, predicate: string): number | null {
  const raw = getFirstLiteral(shapeGraph, propTerm, predicate)
  if (raw === null) return null
  const count = parseInt(raw, 10)
  return Number.isNaN(count) ? null : count
}

/**
 * Reads a SHACL property shape, returning null unless sh:path is a named node.
 * sh:order defaults to MAX_SAFE_INTEGER when absent, so unordered properties sort last.
 */
function readShapeProperty(shapeGraph: Store, propTerm: Term): ShapeProperty | null {
  const path = getObjectNamedNode(shapeGraph, propTerm, SHACL_PATH)
  if (!path) return null

  const orderStr = getFirstLiteral(shapeGraph, propTerm, SHACL_ORDER)

  return {
    path,
    label: getFirstLiteral(shapeGraph, propTerm, SHACL_NAME),
    order: orderStr ? parseInt(orderStr, 10) : Number.MAX_SAFE_INTEGER,
    viewer: getObjectNamedNode(shapeGraph, propTerm, DASH_VIEWER),
    editor: getObjectNamedNode(shapeGraph, propTerm, DASH_EDITOR),
    nodeKind: getObjectNamedNode(shapeGraph, propTerm, SHACL_NODE_KIND),
    datatype: getObjectNamedNode(shapeGraph, propTerm, SHACL_DATATYPE),
    node: getObjectNamedNode(shapeGraph, propTerm, SHACL_NODE),
    minCount: readCount(shapeGraph, propTerm, SHACL_MIN_COUNT),
    maxCount: readCount(shapeGraph, propTerm, SHACL_MAX_COUNT),
    nested: new Map(),
  }
}

/** Returns the stricter of two cardinality bounds; null means the shape set no bound. */
function mergeCardinalityBound(
  a: number | null,
  b: number | null,
  pick: (x: number, y: number) => number,
) {
  if (a === null) return b
  if (b === null) return a
  return pick(a, b)
}

/**
 * Merges shapes for one path using the strictest cardinality bounds.
 * Each hint comes from the lowest-order shape that declares it;
 * ties use encounter order.
 */
function mergeShapeProperties(properties: ShapeProperty[]): ShapeProperty {
  return [...properties]
    .sort((a, b) => a.order - b.order)
    .reduce((merged, prop) => ({
      path: merged.path,
      label: merged.label ?? prop.label,
      order: merged.order,
      viewer: merged.viewer ?? prop.viewer,
      editor: merged.editor ?? prop.editor,
      nodeKind: merged.nodeKind ?? prop.nodeKind,
      datatype: merged.datatype ?? prop.datatype,
      node: merged.node ?? prop.node,
      minCount: mergeCardinalityBound(merged.minCount, prop.minCount, Math.max),
      maxCount: mergeCardinalityBound(merged.maxCount, prop.maxCount, Math.min),
      nested: merged.nested,
    }))
}

/** Bounds nested-shape traversal, including cyclic references. */
const MAX_SHAPE_DEPTH = 2

/** Groups property shapes by path for NodeShapes accepted by the selection callback. */
function collectByPath(
  shapeGraphs: Store[],
  accepts: (shapeGraph: Store, shapeIri: string) => boolean,
): Map<string, ShapeProperty[]> {
  const byPath = new Map<string, ShapeProperty[]>()

  for (const shapeGraph of shapeGraphs) {
    for (const subject of shapeGraph.getSubjects(
      DataFactory.namedNode(RDF_TYPE),
      DataFactory.namedNode(SHACL_NODE_SHAPE),
      null,
    )) {
      if (subject.termType !== 'NamedNode') continue
      if (!accepts(shapeGraph, subject.value)) continue

      for (const propTerm of shapeGraph.getObjects(
        subject,
        DataFactory.namedNode(SHACL_PROPERTY),
        null,
      )) {
        const prop = readShapeProperty(shapeGraph, propTerm)
        if (!prop) continue

        const collected = byPath.get(prop.path)
        if (collected) collected.push(prop)
        else byPath.set(prop.path, [prop])
      }
    }
  }

  return byPath
}

/** Merges constraints by path, then resolves the selected sh:node recursively up to the depth limit. */
function buildPropertyMap(
  shapeGraphs: Store[],
  accepts: (shapeGraph: Store, shapeIri: string) => boolean,
  depth: number,
): Map<string, ShapeProperty> {
  return new Map(
    [...collectByPath(shapeGraphs, accepts)].map(([path, properties]) => {
      const merged = mergeShapeProperties(properties)
      const nested =
        merged.node && depth < MAX_SHAPE_DEPTH
          ? buildPropertyMap(shapeGraphs, (_graph, iri) => iri === merged.node, depth + 1)
          : new Map<string, ShapeProperty>()
      return [path, { ...merged, nested }]
    }),
  )
}

/**
 * Builds a map of sh:path -> ShapeProperty for the current resource's RDF types.
 * Searches all provided shape graphs for NodeShapes whose sh:targetClass matches one of
 * the resource's types. Shapes that constrain the same path are merged, see
 * mergeShapeProperties.
 */
export function getShapePropertyMap(
  resourceStore: Store,
  subjectUri: string | null,
  shapeGraphs: Store[],
): Map<string, ShapeProperty> {
  if (!subjectUri) return new Map()

  const currentTypes = new Set<string>(getNodeRefs(resourceStore, subjectUri, RDF_TYPE))
  if (currentTypes.size === 0) return new Map()

  return buildPropertyMap(
    shapeGraphs,
    (shapeGraph, shapeIri) =>
      getNodeRefs(shapeGraph, shapeIri, SHACL_TARGET_CLASS).some((tc) => currentTypes.has(tc)),
    0,
  )
}

/**
 * Selects properties with dash:editor and sorts them by sh:order,
 * recursively including nested fields.
 */
export function getEditableFields(
  shapePropertyMap: ReadonlyMap<string, ShapeProperty>,
): EditableField[] {
  return [...shapePropertyMap.values()]
    .filter((property): property is ShapeProperty & { editor: string } => property.editor !== null)
    .sort((a, b) => a.order - b.order)
    .map((property) => ({ ...property, nested: getEditableFields(property.nested) }))
}
