import { Parser as N3Parser } from 'n3'
import type { Quad } from 'n3'
import { RDF_TYPE, prefixes } from './vocabularies'

export type RdfValue = {
  '@id'?: string
  '@value'?: string
  '@type'?: string
  '@language'?: string
}

export type RdfNode = {
  '@id'?: string
  '@type'?: string[]
  '@graph'?: RdfNode[]
  [key: string]: unknown
}

export type FetchRdfResult = {
  nodes: RdfNode[]
}

function isRdfNodeArray(value: unknown): value is RdfNode[] {
  return Array.isArray(value)
}

export function flattenGraph(nodes: RdfNode[]): RdfNode[] {
  const flattened: RdfNode[] = []

  function visit(node: RdfNode) {
    flattened.push(node)
    if (Array.isArray(node['@graph'])) {
      node['@graph'].forEach(visit)
    }
  }

  nodes.forEach(visit)

  const mergedById = new Map<string, RdfNode>()
  const anonymousNodes: RdfNode[] = []

  for (const node of flattened) {
    const id = node['@id']

    if (typeof id !== 'string') {
      anonymousNodes.push(node)
      continue
    }

    const existing = mergedById.get(id)

    if (!existing) {
      mergedById.set(id, { ...node })
      continue
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === '@id' || key === '@graph') continue

      if (key === '@type') {
        const existingTypes = Array.isArray(existing['@type']) ? existing['@type'] : []
        const newTypes = Array.isArray(value) ? value : []
        existing['@type'] = [...new Set([...existingTypes, ...newTypes])]
        continue
      }

      const existingValues = Array.isArray(existing[key]) ? (existing[key] as unknown[]) : []
      const newValues = Array.isArray(value) ? value : []
      const combined = [...existingValues, ...newValues]
      const seen = new Set<string>()
      existing[key] = combined.filter((v) => {
        const serialized = JSON.stringify(v)
        if (seen.has(serialized)) return false
        seen.add(serialized)
        return true
      })
    }
  }

  return [...mergedById.values(), ...anonymousNodes]
}

export function compactUri(uri: string): string {
  for (const [base, prefix] of Object.entries(prefixes)) {
    if (uri.startsWith(base)) {
      return `${prefix}:${uri.slice(base.length)}`
    }
  }
  return uri
}

export function getFirstLiteral(node: RdfNode | null, predicate: string): string | null {
  if (!node) return null

  const raw = node[predicate]
  if (!Array.isArray(raw)) return null

  for (const item of raw) {
    const value = (item as RdfValue)['@value']
    if (typeof value === 'string') return value
  }

  return null
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

export async function fetchRdf(uri: string): Promise<FetchRdfResult> {
  const accept = 'text/turtle, application/ld+json;q=0.9, */*;q=0.1'

  const response = await fetch(uri, { headers: { Accept: accept } })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()

  if (contentType.includes('text/turtle') || contentType.includes('application/x-turtle')) {
    return { nodes: parseTurtle(text) }
  }

  if (contentType.includes('application/ld+json')) {
    const data: unknown = JSON.parse(text)
    if (!isRdfNodeArray(data)) throw new Error('Expected a JSON-LD graph array')
    return { nodes: data }
  }

  try {
    return { nodes: parseTurtle(text) }
  } catch {
    // not Turtle
  }

  try {
    const data: unknown = JSON.parse(text)
    if (isRdfNodeArray(data)) return { nodes: data }
  } catch {
    // not JSON
  }

  throw new Error('Could not fetch RDF: server returned no supported format')
}
