import type { Store } from 'n3'
import { RDF_TYPE } from './vocabularies'
import { compactUri } from './rdfUtils'

export type GraphColors = {
  subject: object
  type: object
  blank: object
  external: object
  literal: object
}

type VisNode = { id: string; label: string; color?: object; title?: string }
type VisEdge = { id: string; from: string; to: string; label: string }

// Converts an RDF quad store into vis-network node/edge data for graph visualization.
export function buildGraphData(
  store: Store,
  colors: GraphColors,
): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = []
  const edges: VisEdge[] = []
  const nodeIds = new Set<string>()
  let edgeId = 0

  function ensureNode(id: string, color?: object) {
    if (!nodeIds.has(id)) {
      nodeIds.add(id)
      nodes.push({ id, label: compactUri(id), color })
    }
  }

  for (const quad of store) {
    const subjectId =
      quad.subject.termType === 'BlankNode' ? `_:${quad.subject.value}` : quad.subject.value

    ensureNode(subjectId, colors.subject)

    const edgeLabel = compactUri(quad.predicate.value)

    if (quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode') {
      ensureNode(quad.object.value, colors.type)
      edges.push({ id: `e${edgeId++}`, from: subjectId, to: quad.object.value, label: 'a' })
    } else if (quad.object.termType === 'NamedNode') {
      ensureNode(quad.object.value, colors.external)
      edges.push({ id: `e${edgeId++}`, from: subjectId, to: quad.object.value, label: edgeLabel })
    } else if (quad.object.termType === 'BlankNode') {
      const objectId = `_:${quad.object.value}`
      ensureNode(objectId, colors.blank)
      edges.push({ id: `e${edgeId++}`, from: subjectId, to: objectId, label: edgeLabel })
    } else if (quad.object.termType === 'Literal') {
      const litId = `_lit_${edgeId}`
      const litText = quad.object.value
      nodes.push({
        id: litId,
        label: litText.length > 60 ? litText.slice(0, 57) + '…' : litText,
        title: litText,
        color: colors.literal,
      })
      edges.push({ id: `e${edgeId++}`, from: subjectId, to: litId, label: edgeLabel })
    }
  }

  return { nodes, edges }
}
