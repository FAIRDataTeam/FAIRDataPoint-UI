import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseTurtle } from '../../src/composables/rdfUtils'
import {
  DCT_TITLE,
  DCT_DESCRIPTION,
  DCT_IDENTIFIER,
  DCT_PUBLISHER,
  DCT_LICENSE,
  FDP_METADATA_ISSUED,
  FDP_METADATA_MODIFIED,
  FDP_METADATA_CATALOG,
  FOAF_NAME,
  LDP_CONTAINS,
  LDP_HAS_MEMBER_RELATION,
  LDP_MEMBERSHIP_RESOURCE,
  XSD_DATETIME,
} from '../../src/composables/vocabularies'

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'

const rootTtl = readFileSync(resolve(__dirname, '../fixtures/fdp-root.ttl'), 'utf-8')
const rootNodes = parseTurtle(rootTtl)

const catalogTtl = readFileSync(resolve(__dirname, '../fixtures/catalog.ttl'), 'utf-8')
const catalogNodes = parseTurtle(catalogTtl)

type IdRef = { '@id': string }

const getNode = (id: string, nodes = rootNodes) => {
  const node = nodes.find((n) => n['@id'] === id)
  expect(node).toBeDefined()
  return node!
}

describe('parseTurtle', () => {
  it('returns an empty array for empty input', () => {
    expect(parseTurtle('')).toEqual([])
  })

  it('throws on invalid Turtle', () => {
    expect(() => parseTurtle('this is not valid turtle @@')).toThrow()
  })

  it('contains all top-level subject IRIs', () => {
    const ids = rootNodes.map((n) => n['@id'])
    expect(ids).toContain('http://localhost')
    expect(ids).toContain('http://localhost/catalog/')
    expect(ids).toContain('http://localhost/profile/77aaad6a-0136-4c6e-88b9-07ffccd0ee4c')
    expect(ids).toContain('http://localhost#accessRights')
    expect(ids).toContain('http://localhost#publisher')
    expect(ids).toContain('http://localhost#identifier')
    expect(ids).toContain('http://localhost/metrics/445c0a70d1e214e545b261559e2842f4')
    expect(ids).toContain('http://localhost/metrics/5d27e854a9e78eb3f663331cd47cdc13')
  })

  it('contains all rdf:type values for the root node', () => {
    const fdp = getNode('http://localhost')
    expect(fdp['@type']).toContain('https://w3id.org/fdp/fdp-o#MetadataService')
    expect(fdp['@type']).toContain('http://www.w3.org/ns/dcat#DataService')
    expect(fdp['@type']).toContain('http://www.w3.org/ns/dcat#Resource')
    expect(fdp['@type']).toContain('https://w3id.org/fdp/fdp-o#FAIRDataPoint')
  })

  it('represents a string literal as a typed @value object', () => {
    const fdp = getNode('http://localhost')
    expect(fdp[DCT_TITLE]).toContainEqual({ '@value': 'My FAIR Data Point', '@type': XSD_STRING })
    const publisher = getNode('http://localhost#publisher')
    expect(publisher[FOAF_NAME]).toContainEqual({ '@value': 'Default Publisher', '@type': XSD_STRING })
    const container = getNode('http://localhost/catalog/')
    expect(container[DCT_TITLE]).toContainEqual({ '@value': 'Catalogs', '@type': XSD_STRING })
  })

  it('represents a typed dateTime literal as a @value object', () => {
    const fdp = getNode('http://localhost')
    expect(fdp[FDP_METADATA_ISSUED]).toContainEqual(
      { '@value': '2026-04-23T12:31:46.89141577Z', '@type': XSD_DATETIME },
    )
    expect(fdp[FDP_METADATA_MODIFIED]).toContainEqual(
      { '@value': '2026-04-23T12:39:06.394302314Z', '@type': XSD_DATETIME },
    )
  })

  it('represents a linked resource as a @id object', () => {
    const fdp = getNode('http://localhost')
    expect(fdp[FDP_METADATA_CATALOG]).toContainEqual(
      { '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f' },
    )
    expect(fdp[DCT_PUBLISHER]).toContainEqual({ '@id': 'http://localhost#publisher' })
    expect(fdp[DCT_LICENSE]).toContainEqual({ '@id': 'http://purl.org/NET/rdflicense/cc-zero1.0' })
  })

  it('represents sub-resources with their own types and properties', () => {
    const publisher = getNode('http://localhost#publisher')
    expect(publisher['@type']).toContain('http://xmlns.com/foaf/0.1/Agent')

    const accessRights = getNode('http://localhost#accessRights')
    expect(accessRights['@type']).toContain('http://purl.org/dc/terms/RightsStatement')
    expect(accessRights[DCT_DESCRIPTION]).toContainEqual(
      { '@value': 'This resource has no access restriction', '@type': XSD_STRING },
    )

    const identifier = getNode('http://localhost#identifier')
    expect(identifier['@type']).toContain('http://purl.org/spar/datacite/Identifier')
    expect(identifier[DCT_IDENTIFIER]).toContainEqual(
      { '@value': 'http://localhost', '@type': XSD_STRING },
    )
  })

  it('represents the LDP container with its structure and links', () => {
    const container = getNode('http://localhost/catalog/')
    expect(container['@type']).toContain('http://www.w3.org/ns/ldp#DirectContainer')
    expect(container[LDP_MEMBERSHIP_RESOURCE]).toContainEqual({ '@id': 'http://localhost' })
    expect(container[LDP_HAS_MEMBER_RELATION]).toContainEqual({ '@id': FDP_METADATA_CATALOG })
    expect(container[LDP_CONTAINS]).toContainEqual(
      { '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f' },
    )
  })

  it('represents a blank node reference as a @id object with a _: prefixed identifier', () => {
    // catalog.ttl uses inline blank node syntax [] for publisher
    const catalog = getNode(
      'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
      catalogNodes,
    )
    const publisherRef = (catalog[DCT_PUBLISHER] as IdRef[])[0]
    expect(publisherRef).toHaveProperty('@id')
    expect(publisherRef['@id']).toMatch(/^_:/)
  })

  it('represents a blank node with its own type and properties', () => {
    const catalog = getNode(
      'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
      catalogNodes,
    )
    const publisherRef = (catalog[DCT_PUBLISHER] as IdRef[])[0]
    const blankNode = getNode(publisherRef['@id'], catalogNodes)
    expect(blankNode['@type']).toContain('http://xmlns.com/foaf/0.1/Agent')
    expect(blankNode[FOAF_NAME]).toContainEqual({ '@value': 'Default Publisher', '@type': XSD_STRING })
  })
})
