import { DataFactory } from 'n3'
import type { Literal, Store, Term } from 'n3'
import {
  DASH_EDITOR,
  DASH_VIEWER,
  RDF_TYPE,
  SHACL_DATATYPE,
  SHACL_DESCRIPTION,
  SHACL_MAX_COUNT,
  SHACL_MIN_COUNT,
  SHACL_NAME,
  SHACL_NODE,
  SHACL_NODE_KIND,
  SHACL_NODE_SHAPE,
  SHACL_ORDER,
  SHACL_PATH,
  SHACL_PROPERTY,
  SHACL_TARGET_CLASS,
} from './vocabularies'
import { formatLiteralValue, getNodeRefs } from './rdfUtils'

/**
 * One SHACL property shape. `viewer` drives display, `editor` drives editing: a property is
 * offered in a given UI only when the shape declares the matching DASH hint.
 */
export type ShapeProperty = {
  path: string
  label: string | null
  description: string | null
  order: number
  viewer: string | null
  editor: string | null
  nodeKind: string | null
  datatype: string | null
  /** IRI of the nested shape referenced by sh:node. */
  node: string | null
  minCount: number | null
  maxCount: number | null
}

export type EditableField = ShapeProperty & { editor: string }

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

/** Parses a SHACL cardinality literal; absent or unparseable means no constraint. */
function readCount(shapeGraph: Store, propTerm: Term, predicate: string): number | null {
  const raw = getObjectLiteral(shapeGraph, propTerm, predicate)
  if (raw === null) return null
  const count = parseInt(raw, 10)
  return Number.isNaN(count) ? null : count
}

/**
 * Reads a SHACL property shape node into a ShapeProperty struct.
 * Returns null if the node has no shacl:path.
 * shacl:order defaults to MAX_SAFE_INTEGER when absent, so unordered properties sort last.
 */
function readShapeProperty(shapeGraph: Store, propTerm: Term): ShapeProperty | null {
  const path = getObjectNamedNode(shapeGraph, propTerm, SHACL_PATH)
  if (!path) return null

  const orderStr = getObjectLiteral(shapeGraph, propTerm, SHACL_ORDER)

  return {
    path,
    label: getObjectLiteral(shapeGraph, propTerm, SHACL_NAME),
    description: getObjectLiteral(shapeGraph, propTerm, SHACL_DESCRIPTION),
    order: orderStr ? parseInt(orderStr, 10) : Number.MAX_SAFE_INTEGER,
    viewer: getObjectNamedNode(shapeGraph, propTerm, DASH_VIEWER),
    editor: getObjectNamedNode(shapeGraph, propTerm, DASH_EDITOR),
    nodeKind: getObjectNamedNode(shapeGraph, propTerm, SHACL_NODE_KIND),
    datatype: getObjectNamedNode(shapeGraph, propTerm, SHACL_DATATYPE),
    node: getObjectNamedNode(shapeGraph, propTerm, SHACL_NODE),
    minCount: readCount(shapeGraph, propTerm, SHACL_MIN_COUNT),
    maxCount: readCount(shapeGraph, propTerm, SHACL_MAX_COUNT),
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
      description: merged.description ?? prop.description,
      order: merged.order,
      viewer: merged.viewer ?? prop.viewer,
      editor: merged.editor ?? prop.editor,
      nodeKind: merged.nodeKind ?? prop.nodeKind,
      datatype: merged.datatype ?? prop.datatype,
      node: merged.node ?? prop.node,
      minCount: mergeCardinalityBound(merged.minCount, prop.minCount, Math.max),
      maxCount: mergeCardinalityBound(merged.maxCount, prop.maxCount, Math.min),
    }))
}

/**
 * Builds a map of shacl:path -> ShapeProperty for the current resource's RDF types.
 * Searches all provided shape graphs for NodeShapes whose shacl:targetClass matches one of
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

  // Collect per path first so hints can be merged in shacl:order.
  const byPath = new Map<string, ShapeProperty[]>()

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

        const collected = byPath.get(prop.path)
        if (collected) collected.push(prop)
        else byPath.set(prop.path, [prop])
      }
    }
  }

  return new Map([...byPath].map(([path, properties]) => [path, mergeShapeProperties(properties)]))
}

/**
 * Shape properties an edit form offers, in shacl:order. A property is editable only when the
 * shape declares a dash:editor, as dash:viewer decides what the metadata table shows.
 */
export function getEditableFields(
  shapePropertyMap: ReadonlyMap<string, ShapeProperty>,
): EditableField[] {
  return [...shapePropertyMap.values()]
    .filter((property): property is EditableField => property.editor !== null)
    .sort((a, b) => a.order - b.order)
}
