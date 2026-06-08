import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { DataFactory } from 'n3'
import type { Store } from 'n3'
import {
  parseTurtle,
  hasType,
  compactUri,
  formatLiteralValue,
  getFirstLiteral,
  resolveSubjectUri,
  getNodeRefs,
  uriLabel,
} from '../../src/composables/rdfUtils'
import { internalHref } from '../../src/composables/urlUtils'
import {
  DCT_TITLE,
  DCT_DESCRIPTION,
  DCT_PUBLISHER,
  DCT_LICENSE,
  FDP_METADATA_ISSUED,
  FDP_METADATA_MODIFIED,
  FDP_METADATA_CATALOG,
  FDP_TYPE,
  RDFS_LABEL,
  FOAF_NAME,
  LDP_DIRECT_CONTAINER,
  LDP_CONTAINS,
  LDP_HAS_MEMBER_RELATION,
  LDP_MEMBERSHIP_RESOURCE,
  XSD_DATE,
  XSD_DATETIME,
} from '../../src/composables/vocabularies'

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'

let rootStore: Store
let catalogStore: Store

beforeAll(() => {
  rootStore = parseTurtle(readFileSync(resolve(__dirname, '../fixtures/fdp-root.ttl'), 'utf-8'))
  catalogStore = parseTurtle(readFileSync(resolve(__dirname, '../fixtures/catalog.ttl'), 'utf-8'))
})

describe('parseTurtle', () => {
  it('returns an empty Store for empty input', () => {
    expect(parseTurtle('').size).toBe(0)
  })

  it('throws on invalid Turtle', () => {
    expect(() => parseTurtle('this is not valid turtle @@')).toThrow()
  })

  it('contains all top-level named subject IRIs', () => {
    const uris = rootStore
      .getSubjects(null, null, null)
      .filter((s) => s.termType === 'NamedNode')
      .map((s) => s.value)
    expect(uris).toContain('http://localhost')
    expect(uris).toContain('http://localhost/catalog/')
    expect(uris).toContain('http://localhost/profile/77aaad6a-0136-4c6e-88b9-07ffccd0ee4c')
    expect(uris).toContain('http://localhost#accessRights')
    expect(uris).toContain('http://localhost#publisher')
    expect(uris).toContain('http://localhost#identifier')
    expect(uris).toContain('http://localhost/metrics/445c0a70d1e214e545b261559e2842f4')
    expect(uris).toContain('http://localhost/metrics/5d27e854a9e78eb3f663331cd47cdc13')
  })

  it('makes rdf:type values queryable for the root node', () => {
    expect(
      hasType(rootStore, 'http://localhost', 'https://w3id.org/fdp/fdp-o#MetadataService'),
    ).toBe(true)
    expect(hasType(rootStore, 'http://localhost', 'http://www.w3.org/ns/dcat#DataService')).toBe(
      true,
    )
    expect(hasType(rootStore, 'http://localhost', 'http://www.w3.org/ns/dcat#Resource')).toBe(true)
    expect(hasType(rootStore, 'http://localhost', 'https://w3id.org/fdp/fdp-o#FAIRDataPoint')).toBe(
      true,
    )
  })

  it('makes string literals queryable', () => {
    expect(getFirstLiteral(rootStore, 'http://localhost', DCT_TITLE)).toBe('My FAIR Data Point')
    expect(getFirstLiteral(rootStore, 'http://localhost#publisher', FOAF_NAME)).toBe(
      'Default Publisher',
    )
    expect(getFirstLiteral(rootStore, 'http://localhost/catalog/', DCT_TITLE)).toBe('Catalogs')
  })

  it('makes dateTime literals queryable (formatted as DD-MM-YYYY)', () => {
    expect(getFirstLiteral(rootStore, 'http://localhost', FDP_METADATA_ISSUED)).toBe('23-04-2026')
    expect(getFirstLiteral(rootStore, 'http://localhost', FDP_METADATA_MODIFIED)).toBe('23-04-2026')
  })

  it('makes named node links queryable', () => {
    expect(getNodeRefs(rootStore, 'http://localhost', FDP_METADATA_CATALOG)).toContain(
      'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    )
    expect(getNodeRefs(rootStore, 'http://localhost', DCT_PUBLISHER)).toContain(
      'http://localhost#publisher',
    )
    expect(getNodeRefs(rootStore, 'http://localhost', DCT_LICENSE)).toContain(
      'http://purl.org/NET/rdflicense/cc-zero1.0',
    )
  })

  it('represents sub-resources with their own types and properties', () => {
    expect(
      hasType(rootStore, 'http://localhost#publisher', 'http://xmlns.com/foaf/0.1/Agent'),
    ).toBe(true)
    expect(
      hasType(
        rootStore,
        'http://localhost#accessRights',
        'http://purl.org/dc/terms/RightsStatement',
      ),
    ).toBe(true)
    expect(getFirstLiteral(rootStore, 'http://localhost#accessRights', DCT_DESCRIPTION)).toBe(
      'This resource has no access restriction',
    )
  })

  it('represents the LDP container with its structure and links', () => {
    expect(hasType(rootStore, 'http://localhost/catalog/', LDP_DIRECT_CONTAINER)).toBe(true)
    expect(getNodeRefs(rootStore, 'http://localhost/catalog/', LDP_MEMBERSHIP_RESOURCE)).toContain(
      'http://localhost',
    )
    expect(getNodeRefs(rootStore, 'http://localhost/catalog/', LDP_HAS_MEMBER_RELATION)).toContain(
      FDP_METADATA_CATALOG,
    )
    expect(getNodeRefs(rootStore, 'http://localhost/catalog/', LDP_CONTAINS)).toContain(
      'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    )
  })

  it('returns blank node IDs prefixed with _: for blank node object values', () => {
    const publisherRefs = getNodeRefs(
      catalogStore,
      'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
      DCT_PUBLISHER,
    )
    expect(publisherRefs).toHaveLength(1)
    expect(publisherRefs[0]).toMatch(/^_:/)
  })

  it('stores blank node triples queryable by their term', () => {
    const catalog = DataFactory.namedNode(
      'http://localhost/catalog/37691d1d-94b4-4376-80a9-e49cab8e676f',
    )
    const publisherTerms = catalogStore.getObjects(
      catalog,
      DataFactory.namedNode(DCT_PUBLISHER),
      null,
    )
    expect(publisherTerms).toHaveLength(1)
    expect(publisherTerms[0].termType).toBe('BlankNode')

    const foafName = catalogStore
      .getObjects(publisherTerms[0], DataFactory.namedNode(FOAF_NAME), null)
      .find((o) => o.termType === 'Literal')
    expect(foafName?.value).toBe('Default Publisher')
  })
})

describe('hasType', () => {
  it('returns true when the subject has the given type among multiple types', () => {
    const store = parseTurtle(`<http://ex/a> a <${FDP_TYPE}>, <${LDP_DIRECT_CONTAINER}> .`)
    expect(hasType(store, 'http://ex/a', FDP_TYPE)).toBe(true)
  })

  it('returns false when the subject does not have the given type', () => {
    const store = parseTurtle(`<http://ex/a> a <${LDP_DIRECT_CONTAINER}> .`)
    expect(hasType(store, 'http://ex/a', FDP_TYPE)).toBe(false)
  })

  it('returns false when the subject has no rdf:type', () => {
    const store = parseTurtle(`<http://ex/a> <${DCT_TITLE}> "test" .`)
    expect(hasType(store, 'http://ex/a', FDP_TYPE)).toBe(false)
  })

  it('returns false for a URI not present in the store', () => {
    const store = parseTurtle(`<http://ex/b> a <${FDP_TYPE}> .`)
    expect(hasType(store, 'http://ex/a', FDP_TYPE)).toBe(false)
  })
})

describe('resolveSubjectUri', () => {
  it('matches the preferred URI without a trailing slash when the store subject omits it', () => {
    expect(resolveSubjectUri(rootStore, 'http://localhost/')).toBe('http://localhost')
  })

  it('matches the preferred URI with a trailing slash when the store subject includes it', () => {
    const store = parseTurtle(`<http://ex/root/> a <${FDP_TYPE}> .`)
    expect(resolveSubjectUri(store, 'http://ex/root')).toBe('http://ex/root/')
  })

  it('returns null when neither preferred URI variant is a subject', () => {
    const store = parseTurtle(`<http://ex/other> a <${FDP_TYPE}> .`)
    expect(resolveSubjectUri(store, 'http://ex/root')).toBeNull()
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
    const lit = DataFactory.literal('My FAIR Data Point', DataFactory.namedNode(XSD_STRING))
    expect(formatLiteralValue(lit)).toBe('My FAIR Data Point')
  })

  it('returns the string value for a plain literal (xsd:string default)', () => {
    const lit = DataFactory.literal('My FAIR Data Point')
    expect(formatLiteralValue(lit)).toBe('My FAIR Data Point')
  })

  it('formats an xsd:dateTime value as DD-MM-YYYY', () => {
    const lit = DataFactory.literal(
      '2026-04-23T12:31:46.89141577Z',
      DataFactory.namedNode(XSD_DATETIME),
    )
    expect(formatLiteralValue(lit)).toBe('23-04-2026')
  })

  it('formats an xsd:date value as DD-MM-YYYY', () => {
    const lit = DataFactory.literal('2026-04-23', DataFactory.namedNode(XSD_DATE))
    expect(formatLiteralValue(lit)).toBe('23-04-2026')
  })
})

describe('getFirstLiteral', () => {
  it('returns the first literal value for a given predicate', () => {
    const store = parseTurtle(`<http://ex/a> <${DCT_TITLE}> "Hello" .`)
    expect(getFirstLiteral(store, 'http://ex/a', DCT_TITLE)).toBe('Hello')
  })

  it('returns null when the predicate is not present', () => {
    const store = parseTurtle(`<http://ex/a> a <http://ex/Type> .`)
    expect(getFirstLiteral(store, 'http://ex/a', DCT_TITLE)).toBeNull()
  })

  it('returns null for a URI not in the store', () => {
    const store = parseTurtle(`<http://ex/b> <${DCT_TITLE}> "Hello" .`)
    expect(getFirstLiteral(store, 'http://ex/a', DCT_TITLE)).toBeNull()
  })

  it('skips named node values and returns the first literal', () => {
    const store = parseTurtle(
      `<http://ex/a> <${DCT_TITLE}> <http://ex/link> ; <${DCT_TITLE}> "Hello" .`,
    )
    expect(getFirstLiteral(store, 'http://ex/a', DCT_TITLE)).toBe('Hello')
  })

  it('returns null when only named node values are present', () => {
    const store = parseTurtle(`<http://ex/a> <${DCT_TITLE}> <http://ex/link> .`)
    expect(getFirstLiteral(store, 'http://ex/a', DCT_TITLE)).toBeNull()
  })
})

describe('getNodeRefs', () => {
  it('returns the named node values for a given predicate', () => {
    const store = parseTurtle(`<http://ex/a> <${DCT_PUBLISHER}> <http://ex/publisher> .`)
    expect(getNodeRefs(store, 'http://ex/a', DCT_PUBLISHER)).toEqual(['http://ex/publisher'])
  })

  it('returns an empty array when the predicate is not present', () => {
    const store = parseTurtle(`<http://ex/a> a <http://ex/Type> .`)
    expect(getNodeRefs(store, 'http://ex/a', DCT_PUBLISHER)).toEqual([])
  })

  it('returns an empty array for a URI not in the store', () => {
    const store = parseTurtle(`<http://ex/b> <${DCT_PUBLISHER}> <http://ex/publisher> .`)
    expect(getNodeRefs(store, 'http://ex/a', DCT_PUBLISHER)).toEqual([])
  })

  it('skips literal values and returns only named node IRIs', () => {
    const store = parseTurtle(
      `<http://ex/a> <${DCT_PUBLISHER}> "not a link" ; <${DCT_PUBLISHER}> <http://ex/publisher> .`,
    )
    expect(getNodeRefs(store, 'http://ex/a', DCT_PUBLISHER)).toEqual(['http://ex/publisher'])
  })

  it('returns blank node IDs prefixed with _:', () => {
    const store = parseTurtle(`<http://ex/a> <${DCT_PUBLISHER}> [] .`)
    const ids = getNodeRefs(store, 'http://ex/a', DCT_PUBLISHER)
    expect(ids).toHaveLength(1)
    expect(ids[0]).toMatch(/^_:/)
  })
})

describe('uriLabel', () => {
  it('returns dct:title when available', () => {
    const store = parseTurtle(`<http://ex/catalog> <${DCT_TITLE}> "My Catalog" .`)
    expect(uriLabel(store, 'http://ex/catalog')).toBe('My Catalog')
  })

  it('returns rdfs:label when dct:title is not present', () => {
    const store = parseTurtle(`<http://ex/catalog> <${RDFS_LABEL}> "My Label" .`)
    expect(uriLabel(store, 'http://ex/catalog')).toBe('My Label')
  })

  it('returns foaf:name when no title or label is present', () => {
    const store = parseTurtle(`<http://ex/pub> <${FOAF_NAME}> "Default Publisher" .`)
    expect(uriLabel(store, 'http://ex/pub')).toBe('Default Publisher')
  })

  it('falls back to the last URI path segment when the store has no label for the URI', () => {
    const store = parseTurtle('')
    expect(uriLabel(store, 'http://ex/some/resource')).toBe('resource')
  })

  it('falls back to the last URI path segment for an unrelated store', () => {
    const store = parseTurtle(`<http://ex/other> <${DCT_TITLE}> "Other" .`)
    expect(uriLabel(store, 'http://ex/some/resource')).toBe('resource')
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
    expect(internalHref('http://localhost/catalog/some-id')).toBe('/catalog/some-id')
  })

  it('returns / for a one-segment URL under the base', () => {
    expect(internalHref('http://localhost/catalog')).toBe('/')
  })

  it('returns the URI unchanged for an external URL', () => {
    expect(internalHref('https://external.example.org/resource')).toBe(
      'https://external.example.org/resource',
    )
  })
})
