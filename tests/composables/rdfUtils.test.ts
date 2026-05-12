import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  parseTurtle,
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
} from '../../src/composables/rdfUtils'
import {
  DCT_TITLE,
  DCT_DESCRIPTION,
  DCT_IDENTIFIER,
  DCT_PUBLISHER,
  DCT_LICENSE,
  DCT_CONFORMS_TO,
  FDP_METADATA_ISSUED,
  FDP_METADATA_MODIFIED,
  FDP_METADATA_CATALOG,
  FDP_SOFTWARE_VERSION,
  FDP_TYPE,
  RDFS_LABEL,
  FOAF_NAME,
  DCAT_ENDPOINT_URL,
  DCAT_THEME_TAXONOMY,
  LDP_DIRECT_CONTAINER,
  LDP_CONTAINS,
  LDP_HAS_MEMBER_RELATION,
  LDP_MEMBERSHIP_RESOURCE,
  XSD_DATE,
  XSD_DATETIME,
} from '../../src/composables/vocabularies'

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'

const rootNodes = parseTurtle(readFileSync(resolve(__dirname, '../fixtures/fdp-root.ttl'), 'utf-8'))

type IdRef = { '@id': string }

const getNode = (id: string, nodes = rootNodes) => {
  const node = nodes.find((n) => n['@id'] === id)
  expect(node).toBeDefined()
  return node!
}

describe('parseTurtle', () => {
  const catalogNodes = parseTurtle(
    readFileSync(resolve(__dirname, '../fixtures/catalog.ttl'), 'utf-8'),
  )

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
    expect(publisher[FOAF_NAME]).toContainEqual({
      '@value': 'Default Publisher',
      '@type': XSD_STRING,
    })
    const container = getNode('http://localhost/catalog/')
    expect(container[DCT_TITLE]).toContainEqual({ '@value': 'Catalogs', '@type': XSD_STRING })
  })

  it('represents a typed dateTime literal as a @value object', () => {
    const fdp = getNode('http://localhost')
    expect(fdp[FDP_METADATA_ISSUED]).toContainEqual({
      '@value': '2026-04-23T12:31:46.89141577Z',
      '@type': XSD_DATETIME,
    })
    expect(fdp[FDP_METADATA_MODIFIED]).toContainEqual({
      '@value': '2026-04-23T12:39:06.394302314Z',
      '@type': XSD_DATETIME,
    })
  })

  it('represents a linked resource as a @id object', () => {
    const fdp = getNode('http://localhost')
    expect(fdp[FDP_METADATA_CATALOG]).toContainEqual({
      '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    })
    expect(fdp[DCT_PUBLISHER]).toContainEqual({ '@id': 'http://localhost#publisher' })
    expect(fdp[DCT_LICENSE]).toContainEqual({ '@id': 'http://purl.org/NET/rdflicense/cc-zero1.0' })
  })

  it('represents sub-resources with their own types and properties', () => {
    const publisher = getNode('http://localhost#publisher')
    expect(publisher['@type']).toContain('http://xmlns.com/foaf/0.1/Agent')

    const accessRights = getNode('http://localhost#accessRights')
    expect(accessRights['@type']).toContain('http://purl.org/dc/terms/RightsStatement')
    expect(accessRights[DCT_DESCRIPTION]).toContainEqual({
      '@value': 'This resource has no access restriction',
      '@type': XSD_STRING,
    })

    const identifier = getNode('http://localhost#identifier')
    expect(identifier['@type']).toContain('http://purl.org/spar/datacite/Identifier')
    expect(identifier[DCT_IDENTIFIER]).toContainEqual({
      '@value': 'http://localhost',
      '@type': XSD_STRING,
    })
  })

  it('represents the LDP container with its structure and links', () => {
    const container = getNode('http://localhost/catalog/')
    expect(container['@type']).toContain(LDP_DIRECT_CONTAINER)
    expect(container[LDP_MEMBERSHIP_RESOURCE]).toContainEqual({ '@id': 'http://localhost' })
    expect(container[LDP_HAS_MEMBER_RELATION]).toContainEqual({ '@id': FDP_METADATA_CATALOG })
    expect(container[LDP_CONTAINS]).toContainEqual({
      '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    })
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
    expect(blankNode[FOAF_NAME]).toContainEqual({
      '@value': 'Default Publisher',
      '@type': XSD_STRING,
    })
  })
})

describe('flattenGraph (JSON-LD input)', () => {
  const rootJsonLd = JSON.parse(
    readFileSync(resolve(__dirname, '../fixtures/fdp-root.jsonld'), 'utf-8'),
  )
  const catalogJsonLd = JSON.parse(
    readFileSync(resolve(__dirname, '../fixtures/catalog.jsonld'), 'utf-8'),
  )
  const flatNodes = flattenGraph(rootJsonLd)

  it('contains all subject IRIs from top-level and nested @graph nodes', () => {
    const ids = flatNodes.map((n) => n['@id'])
    expect(ids).toContain('http://localhost')
    expect(ids).toContain('http://localhost/catalog/')
    expect(ids).toContain('http://localhost/profile/77aaad6a-0136-4c6e-88b9-07ffccd0ee4c')
    expect(ids).toContain('http://localhost#accessRights')
    expect(ids).toContain('http://localhost#publisher')
    expect(ids).toContain('http://localhost#identifier')
    expect(ids).toContain('http://localhost/metrics/445c0a70d1e214e545b261559e2842f4')
    expect(ids).toContain('http://localhost/metrics/5d27e854a9e78eb3f663331cd47cdc13')
  })

  it('merges nodes with the same @id into a single node', () => {
    const ids = flatNodes.map((n) => n['@id'])
    expect(ids.filter((id) => id === 'http://localhost')).toHaveLength(1)
    expect(ids.filter((id) => id === 'http://localhost/catalog/')).toHaveLength(1)
    expect(
      ids.filter((id) => id === 'http://localhost/profile/77aaad6a-0136-4c6e-88b9-07ffccd0ee4c'),
    ).toHaveLength(1)
  })

  it('deduplicates property values when merging nodes with the same @id', () => {
    const fdp = getNode('http://localhost', flatNodes)
    expect(fdp[DCT_CONFORMS_TO]).toHaveLength(1)
    expect(fdp[FDP_SOFTWARE_VERSION]).toHaveLength(1)
    expect(fdp[DCAT_ENDPOINT_URL]).toHaveLength(1)
  })

  it('preserves properties that only appear on the outer named graph node', () => {
    // conformsTo and themeTaxonomy are on the outer named graph node, not inside @graph.
    const catalogId = 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f'
    const catalogFlatNodes = flattenGraph(catalogJsonLd)
    const catalog = getNode(catalogId, catalogFlatNodes)
    expect(catalog[DCT_CONFORMS_TO]).toContainEqual({
      '@id': 'http://localhost/profile/a0949e72-4466-4d53-8900-9436d1049a4b',
    })
    expect(catalog[DCAT_THEME_TAXONOMY]).toContainEqual({ '@id': 'http://example.org/theme/test' })
  })

  it.todo(
    'produces consistent node structure regardless of input format ' +
      '(backend currently seems to serialize conformsTo and themeTaxonomy differently in Turtle vs JSON-LD)',
  )

  it('contains all rdf:type values for the root node', () => {
    // Types exist only on the inner @graph node, not the outer one.
    // They must survive merging onto the result.
    const fdp = getNode('http://localhost', flatNodes)
    expect(fdp['@type']).toContain('https://w3id.org/fdp/fdp-o#MetadataService')
    expect(fdp['@type']).toContain('http://www.w3.org/ns/dcat#DataService')
    expect(fdp['@type']).toContain('http://www.w3.org/ns/dcat#Resource')
    expect(fdp['@type']).toContain('https://w3id.org/fdp/fdp-o#FAIRDataPoint')
  })

  it('represents a string literal as a bare @value object without @type', () => {
    // JSON-LD plain strings have no @type, unlike Turtle where parseTurtle
    // adds @type: xsd:string via n3.js.
    const fdp = getNode('http://localhost', flatNodes)
    expect(fdp[DCT_TITLE]).toContainEqual({ '@value': 'My FAIR Data Point' })
    const publisher = getNode('http://localhost#publisher', flatNodes)
    expect(publisher[FOAF_NAME]).toContainEqual({ '@value': 'Default Publisher' })
    const container = getNode('http://localhost/catalog/', flatNodes)
    expect(container[DCT_TITLE]).toContainEqual({ '@value': 'Catalogs' })
  })

  it('represents a typed dateTime literal as a @value object', () => {
    const fdp = getNode('http://localhost', flatNodes)
    expect(fdp[FDP_METADATA_ISSUED]).toContainEqual({
      '@value': '2026-04-23T12:31:46.89141577Z',
      '@type': XSD_DATETIME,
    })
    expect(fdp[FDP_METADATA_MODIFIED]).toContainEqual({
      '@value': '2026-04-23T12:39:06.394302314Z',
      '@type': XSD_DATETIME,
    })
  })

  it('represents a linked resource as a @id object', () => {
    const fdp = getNode('http://localhost', flatNodes)
    expect(fdp[FDP_METADATA_CATALOG]).toContainEqual({
      '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    })
    expect(fdp[DCT_PUBLISHER]).toContainEqual({ '@id': 'http://localhost#publisher' })
    expect(fdp[DCT_LICENSE]).toContainEqual({ '@id': 'http://purl.org/NET/rdflicense/cc-zero1.0' })
  })

  it('represents sub-resources with their own types and properties', () => {
    const publisher = getNode('http://localhost#publisher', flatNodes)
    expect(publisher['@type']).toContain('http://xmlns.com/foaf/0.1/Agent')
    expect(publisher[FOAF_NAME]).toContainEqual({ '@value': 'Default Publisher' })

    const accessRights = getNode('http://localhost#accessRights', flatNodes)
    expect(accessRights['@type']).toContain('http://purl.org/dc/terms/RightsStatement')
    expect(accessRights[DCT_DESCRIPTION]).toContainEqual({
      '@value': 'This resource has no access restriction',
    })

    const identifier = getNode('http://localhost#identifier', flatNodes)
    expect(identifier['@type']).toContain('http://purl.org/spar/datacite/Identifier')
    expect(identifier[DCT_IDENTIFIER]).toContainEqual({ '@value': 'http://localhost' })
  })

  it('represents the LDP container with its structure and links', () => {
    const container = getNode('http://localhost/catalog/', flatNodes)
    expect(container['@type']).toContain(LDP_DIRECT_CONTAINER)
    expect(container[LDP_MEMBERSHIP_RESOURCE]).toContainEqual({ '@id': 'http://localhost' })
    expect(container[LDP_HAS_MEMBER_RELATION]).toContainEqual({ '@id': FDP_METADATA_CATALOG })
    expect(container[LDP_CONTAINS]).toContainEqual({
      '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    })
  })
})

describe('flattenGraph (Turtle input)', () => {
  const flatTtlNodes = flattenGraph(rootNodes)

  it('contains all subject IRIs', () => {
    const ids = flatTtlNodes.map((n) => n['@id'])
    expect(ids).toContain('http://localhost')
    expect(ids).toContain('http://localhost/catalog/')
    expect(ids).toContain('http://localhost#publisher')
    expect(ids).toContain('http://localhost#accessRights')
    expect(ids).toContain('http://localhost#identifier')
  })

  it('contains all rdf:type values for the root node', () => {
    const fdp = getNode('http://localhost', flatTtlNodes)
    expect(fdp['@type']).toContain('https://w3id.org/fdp/fdp-o#MetadataService')
    expect(fdp['@type']).toContain('http://www.w3.org/ns/dcat#DataService')
    expect(fdp['@type']).toContain('http://www.w3.org/ns/dcat#Resource')
    expect(fdp['@type']).toContain('https://w3id.org/fdp/fdp-o#FAIRDataPoint')
  })

  it('represents a string literal as a typed @value object with @type xsd:string', () => {
    const fdp = getNode('http://localhost', flatTtlNodes)
    expect(fdp[DCT_TITLE]).toContainEqual({ '@value': 'My FAIR Data Point', '@type': XSD_STRING })
    const publisher = getNode('http://localhost#publisher', flatTtlNodes)
    expect(publisher[FOAF_NAME]).toContainEqual({
      '@value': 'Default Publisher',
      '@type': XSD_STRING,
    })
  })

  it('represents a linked resource as a @id object', () => {
    const fdp = getNode('http://localhost', flatTtlNodes)
    expect(fdp[FDP_METADATA_CATALOG]).toContainEqual({
      '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    })
    expect(fdp[DCT_PUBLISHER]).toContainEqual({ '@id': 'http://localhost#publisher' })
    expect(fdp[DCT_LICENSE]).toContainEqual({
      '@id': 'http://purl.org/NET/rdflicense/cc-zero1.0',
    })
  })

  it('represents the LDP container with its structure and links', () => {
    const container = getNode('http://localhost/catalog/', flatTtlNodes)
    expect(container['@type']).toContain(LDP_DIRECT_CONTAINER)
    expect(container[LDP_MEMBERSHIP_RESOURCE]).toContainEqual({ '@id': 'http://localhost' })
    expect(container[LDP_HAS_MEMBER_RELATION]).toContainEqual({ '@id': FDP_METADATA_CATALOG })
    expect(container[LDP_CONTAINS]).toContainEqual({
      '@id': 'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    })
  })
})

describe('hasType', () => {
  it('returns true when the node has the given type among multiple types', () => {
    const node = { '@id': 'http://ex/a', '@type': [FDP_TYPE, LDP_DIRECT_CONTAINER] }
    expect(hasType(node, FDP_TYPE)).toBe(true)
  })

  it('returns false when the node does not have the given type', () => {
    const node = { '@id': 'http://ex/a', '@type': [LDP_DIRECT_CONTAINER] }
    expect(hasType(node, FDP_TYPE)).toBe(false)
  })

  it('returns false when the node has no @type', () => {
    const node = { '@id': 'http://ex/a' }
    expect(hasType(node, FDP_TYPE)).toBe(false)
  })

  it('returns false when @type is an empty array', () => {
    const node = { '@id': 'http://ex/a', '@type': [] }
    expect(hasType(node, FDP_TYPE)).toBe(false)
  })

  it('returns false when @type is not an array', () => {
    const node = { '@id': 'http://ex/a', '@type': 'http://ex/TypeA' } as unknown as RdfNode
    expect(hasType(node, FDP_TYPE)).toBe(false)
  })
})

describe('compactUri', () => {
  it('compacts a slash-namespace URI to a prefixed name', () => {
    expect(compactUri('http://purl.org/dc/terms/title')).toBe('dct:title')
  })

  it('compacts a hash-namespace URI to a prefixed name', () => {
    expect(compactUri('http://www.w3.org/ns/ldp#DirectContainer')).toBe('ldp:DirectContainer')
  })

  it('compacts a URI whose prefix alias contains a hyphen', () => {
    expect(compactUri('https://w3id.org/fdp/fdp-o#FAIRDataPoint')).toBe('fdp-o:FAIRDataPoint')
  })

  it('returns the full URI unchanged when no prefix matches', () => {
    expect(compactUri('http://purl.org/NET/rdflicense/cc-zero1.0')).toBe(
      'http://purl.org/NET/rdflicense/cc-zero1.0',
    )
  })
})

describe('formatLiteralValue', () => {
  it('returns the string value for a typed xsd:string literal', () => {
    expect(formatLiteralValue({ '@value': 'My FAIR Data Point', '@type': XSD_STRING })).toBe(
      'My FAIR Data Point',
    )
  })

  it('returns the string value for a bare literal without @type', () => {
    expect(formatLiteralValue({ '@value': 'My FAIR Data Point' })).toBe('My FAIR Data Point')
  })

  it('formats an xsd:dateTime value as DD-MM-YYYY', () => {
    expect(
      formatLiteralValue({ '@value': '2026-04-23T12:31:46.89141577Z', '@type': XSD_DATETIME }),
    ).toBe('23-04-2026')
  })

  it('formats an xsd:date value as DD-MM-YYYY', () => {
    expect(formatLiteralValue({ '@value': '2026-04-23', '@type': XSD_DATE })).toBe('23-04-2026')
  })

  it('returns null for a linked resource reference with no @value', () => {
    expect(formatLiteralValue({ '@id': 'http://localhost#publisher' })).toBeNull()
  })

  it('returns null when @value is not a string', () => {
    expect(formatLiteralValue({ '@value': 42 } as unknown as RdfValue)).toBeNull()
  })
})

describe('getFirstLiteral', () => {
  it('returns the first literal value for a given predicate', () => {
    const node = { [DCT_TITLE]: [{ '@value': 'Hello', '@type': XSD_STRING }] }
    expect(getFirstLiteral(node, DCT_TITLE)).toBe('Hello')
  })

  it('returns null when node is null', () => {
    expect(getFirstLiteral(null, DCT_TITLE)).toBeNull()
  })

  it('returns null when the predicate is not present on the node', () => {
    const node = { '@id': 'http://ex/a' }
    expect(getFirstLiteral(node, DCT_TITLE)).toBeNull()
  })

  it('skips non-literal values and returns the first literal', () => {
    const node = {
      [DCT_TITLE]: [{ '@id': 'http://ex/link' }, { '@value': 'Hello', '@type': XSD_STRING }],
    }
    expect(getFirstLiteral(node, DCT_TITLE)).toBe('Hello')
  })

  it('returns null when no literal values are present', () => {
    const node = { [DCT_TITLE]: [{ '@id': 'http://ex/link' }] }
    expect(getFirstLiteral(node, DCT_TITLE)).toBeNull()
  })
})

describe('getIdValues', () => {
  it('returns the @id values for a given predicate', () => {
    const node = { [DCT_PUBLISHER]: [{ '@id': 'http://ex/publisher' }] }
    expect(getIdValues(node, DCT_PUBLISHER)).toEqual(['http://ex/publisher'])
  })

  it('returns an empty array when node is null', () => {
    expect(getIdValues(null, DCT_PUBLISHER)).toEqual([])
  })

  it('returns an empty array when the predicate is not present on the node', () => {
    const node = { '@id': 'http://ex/a' }
    expect(getIdValues(node, DCT_PUBLISHER)).toEqual([])
  })

  it('skips literal values and returns only @id strings', () => {
    const node = {
      [DCT_PUBLISHER]: [
        { '@value': 'not a link', '@type': XSD_STRING },
        { '@id': 'http://ex/publisher' },
      ],
    }
    expect(getIdValues(node, DCT_PUBLISHER)).toEqual(['http://ex/publisher'])
  })

  it('returns an empty array when no @id values are present', () => {
    const node = { [DCT_PUBLISHER]: [{ '@value': 'not a link', '@type': XSD_STRING }] }
    expect(getIdValues(node, DCT_PUBLISHER)).toEqual([])
  })
})

describe('uriLabel', () => {
  it('returns dct:title when node has one', () => {
    const node = { [DCT_TITLE]: [{ '@value': 'My Catalog' }] }
    expect(uriLabel('http://ex/catalog', node)).toBe('My Catalog')
  })

  it('returns rdfs:label when node has no dct:title', () => {
    const node = { [RDFS_LABEL]: [{ '@value': 'My Label' }] }
    expect(uriLabel('http://ex/catalog', node)).toBe('My Label')
  })

  it('returns foaf:name when node has no title or label', () => {
    const node = { [FOAF_NAME]: [{ '@value': 'Default Publisher' }] }
    expect(uriLabel('http://ex/publisher', node)).toBe('Default Publisher')
  })

  it('falls back to the last URI path segment when node has no known label predicate', () => {
    // 'http://ex/some/resource' -> 'resource'
    expect(uriLabel('http://ex/some/resource', { '@id': 'http://ex/some/resource' })).toBe(
      'resource',
    )
  })

  it('falls back to the last URI path segment when node is null', () => {
    expect(uriLabel('http://ex/some/resource', null)).toBe('resource')
  })
})

describe('internalHref', () => {
  beforeAll(() => vi.stubEnv('VITE_FDP_BASE_URL', 'http://localhost'))
  afterAll(() => vi.unstubAllEnvs())

  it('returns / for the base URL', () => {
    expect(internalHref('http://localhost')).toBe('/')
  })

  it('returns / for the base URL with a trailing slash', () => {
    expect(internalHref('http://localhost/')).toBe('/')
  })

  it('returns the two-segment path for a resource URL', () => {
    // 'http://localhost/catalog/some-id' -> '/catalog/some-id'
    expect(internalHref('http://localhost/catalog/some-id')).toBe('/catalog/some-id')
  })

  it('returns / for a one-segment URL under the base', () => {
    // Only one path segment after the base, not enough to identify a resource.
    expect(internalHref('http://localhost/catalog')).toBe('/')
  })

  it('returns the URI unchanged for an external URL', () => {
    expect(internalHref('https://external.example.org/resource')).toBe(
      'https://external.example.org/resource',
    )
  })
})
