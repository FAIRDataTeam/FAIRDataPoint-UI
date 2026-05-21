import { Parser as N3Parser } from 'n3'
import type { Quad } from 'n3'
import {
  DCT_TITLE,
  RDFS_LABEL,
  DCT_IDENTIFIER,
  FOAF_NAME,
  RDF_TYPE,
  prefixes,
  XSD_DATE,
  XSD_DATETIME,
} from './vocabularies'

export type RdfValue = {
  '@id'?: string
  '@value'?: string
  '@type'?: string
  '@language'?: string
}

export type RdfNode = {
  '@id'?: string
  '@type'?: string[]
  [key: string]: unknown
}

export type RdfFormat = 'turtle' | 'unknown'

export type FetchRdfResult = {
  nodes: RdfNode[]
  format: RdfFormat
  rawText: string
}

export function hasType(node: RdfNode, type: string): boolean {
  return Array.isArray(node['@type']) && node['@type'].includes(type)
}

export function compactUri(uri: string): string {
  for (const [base, prefix] of Object.entries(prefixes)) {
    if (uri.startsWith(base)) {
      return `${prefix}:${uri.slice(base.length)}`
    }
  }

  return uri
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()
  return `${day}-${month}-${year}`
}

export function formatLiteralValue(value: RdfValue): string | null {
  if (typeof value['@value'] !== 'string') return null
  const datatype = value['@type']
  if (datatype === XSD_DATETIME || datatype === XSD_DATE) {
    return formatDate(value['@value'])
  }
  return value['@value']
}

export function getFirstLiteral(node: RdfNode | null, predicate: string): string | null {
  if (!node) return null

  const raw = node[predicate]
  if (!Array.isArray(raw)) return null

  for (const item of raw) {
    const text = formatLiteralValue(item as RdfValue)
    if (text) return text
  }

  return null
}

export function getIdValues(node: RdfNode | null, predicate: string): string[] {
  if (!node) return []

  const raw = node[predicate]
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => item as RdfValue)
    .filter((item) => typeof item['@id'] === 'string')
    .map((item) => item['@id'] as string)
}

export function uriLabel(uri: string, graphNode: RdfNode | null): string {
  const title =
    getFirstLiteral(graphNode, DCT_TITLE) ??
    getFirstLiteral(graphNode, RDFS_LABEL) ??
    getFirstLiteral(graphNode, FOAF_NAME) ??
    getFirstLiteral(graphNode, DCT_IDENTIFIER)

  if (title) return title

  const lastSegment = uri.split('/').filter(Boolean).pop()
  return lastSegment || uri
}

export function parseTurtle(turtle: string): RdfNode[] {
  const parser = new N3Parser()
  const quads: Quad[] = parser.parse(turtle)

  const nodeMap = new Map<string, RdfNode>()

  function getOrCreate(id: string): RdfNode {
    if (!nodeMap.has(id)) nodeMap.set(id, { '@id': id })
    return nodeMap.get(id)!
  }

  for (const quad of quads) {
    const subjectId =
      quad.subject.termType === 'BlankNode' ? `_:${quad.subject.value}` : quad.subject.value

    const node = getOrCreate(subjectId)
    const predicate = quad.predicate.value

    if (predicate === RDF_TYPE) {
      const typeUri = quad.object.value
      const existing = Array.isArray(node['@type']) ? node['@type'] : []
      if (!existing.includes(typeUri)) {
        node['@type'] = [...existing, typeUri]
      }
      continue
    }

    const existing = Array.isArray(node[predicate]) ? (node[predicate] as RdfValue[]) : []

    if (quad.object.termType === 'NamedNode') {
      node[predicate] = [...existing, { '@id': quad.object.value }]
    } else if (quad.object.termType === 'BlankNode') {
      node[predicate] = [...existing, { '@id': `_:${quad.object.value}` }]
    } else if (quad.object.termType === 'Literal') {
      const entry: RdfValue = { '@value': quad.object.value }
      if (quad.object.datatype?.value) entry['@type'] = quad.object.datatype.value
      if (quad.object.language) entry['@language'] = quad.object.language
      node[predicate] = [...existing, entry]
    }
  }

  return [...nodeMap.values()]
}

type VisNode = { id: string; label: string; color?: object; title?: string }
type VisEdge = { id: string; from: string; to: string; label: string }

export type GraphColors = {
  subject: object
  type: object
  blank: object
  external: object
  literal: object
}

const GRAPH_SKIP = new Set(['@id', '@type'])

export function buildGraphData(
  graph: RdfNode[],
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

  for (const node of graph) {
    const subjectId = node['@id']
    if (typeof subjectId !== 'string') continue

    ensureNode(subjectId, colors.subject)

    if (Array.isArray(node['@type'])) {
      for (const typeUri of node['@type'] as string[]) {
        ensureNode(typeUri, colors.type)
        edges.push({ id: `e${edgeId++}`, from: subjectId, to: typeUri, label: 'a' })
      }
    }

    for (const predicate of Object.keys(node)) {
      if (GRAPH_SKIP.has(predicate)) continue
      const values = node[predicate]
      if (!Array.isArray(values)) continue

      const predicateLabel = compactUri(predicate)

      for (const raw of values as RdfValue[]) {
        if (typeof raw['@id'] === 'string') {
          const objectId = raw['@id']
          ensureNode(objectId, objectId.startsWith('_:') ? colors.blank : colors.external)
          edges.push({ id: `e${edgeId++}`, from: subjectId, to: objectId, label: predicateLabel })
        } else if (typeof raw['@value'] === 'string') {
          const litId = `_lit_${edgeId}`
          const litText = raw['@value']
          nodes.push({
            id: litId,
            label: litText.length > 60 ? litText.slice(0, 57) + '…' : litText,
            title: litText,
            color: colors.literal,
          })
          edges.push({ id: `e${edgeId++}`, from: subjectId, to: litId, label: predicateLabel })
        }
      }
    }
  }

  return { nodes, edges }
}

export function internalHref(uri: string): string {
  const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
  const normalized = uri.replace(/\/$/, '')
  if (normalized === base) return '/'
  const prefix = `${base}/`
  if (normalized.startsWith(prefix)) {
    const parts = normalized.slice(prefix.length).split('/')
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`
    return '/'
  }
  return uri
}

export async function fetchRdfRaw(uri: string, accept: string): Promise<string> {
  const response = await fetch(uri, { headers: { Accept: accept } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

export async function fetchRdf(
  uri: string,
  headers?: Record<string, string>,
): Promise<FetchRdfResult> {
  const response = await fetch(uri, {
    headers: { Accept: 'text/turtle', ...headers },
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const text = await response.text()

  return { nodes: parseTurtle(text), format: 'turtle', rawText: text }
}
