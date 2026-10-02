import { describe, it, expect } from 'vitest'
import { parseTurtle } from '../../src/composables/rdfUtils'
import { getShapePropertyMap, getEditableFields } from '../../src/composables/shaclUtils'
import {
  seedValues,
  emptyValues,
  isNestedField,
  fieldsSignature,
  fieldLabel,
  type TermValue,
  type NestedValue,
} from '../../src/composables/shapeForm'

const SUBJECT = 'http://localhost/catalog/c1'
const CATALOG = 'http://www.w3.org/ns/dcat#Catalog'
const AGENT = 'http://xmlns.com/foaf/0.1/Agent'
const TITLE = 'http://purl.org/dc/terms/title'
const ISSUED = 'http://purl.org/dc/terms/issued'
const KEYWORD = 'http://www.w3.org/ns/dcat#keyword'
const PUBLISHER = 'http://purl.org/dc/terms/publisher'
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'
const TEXT_FIELD = 'http://datashapes.org/dash#TextFieldEditor'
const BLANK_NODE = 'http://datashapes.org/dash#BlankNodeEditor'

const shapes = parseTurtle(`
  @prefix sh: <http://www.w3.org/ns/shacl#> .
  @prefix dash: <http://datashapes.org/dash#> .
  <http://ex/CatalogShape> a sh:NodeShape ; sh:targetClass <${CATALOG}> ;
    sh:property [ sh:path <${TITLE}> ; sh:order 1 ; dash:editor <${TEXT_FIELD}> ] ,
      [ sh:path <${KEYWORD}> ; sh:order 2 ; dash:editor <${TEXT_FIELD}> ] ,
      [ sh:path <${ISSUED}> ; sh:order 3 ; dash:editor <${TEXT_FIELD}> ] ,
      [ sh:path <${PUBLISHER}> ; sh:order 4 ; sh:node <http://ex/AgentShape> ;
        dash:editor <${BLANK_NODE}> ] .
  <http://ex/AgentShape> a sh:NodeShape ; sh:targetClass <${AGENT}> ;
    sh:property [ sh:path <${FOAF_NAME}> ; dash:editor <${TEXT_FIELD}> ] .
`)

const fieldsFor = (store: ReturnType<typeof parseTurtle>) =>
  getEditableFields(getShapePropertyMap(store, SUBJECT, [shapes]))

describe('seedValues', () => {
  it('keeps every value of a multi-valued path, and the raw lexical form of a date', () => {
    const store = parseTurtle(`
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      <${SUBJECT}> a <${CATALOG}> ;
        <${TITLE}> "Health & Biomedical Research" ;
        <${KEYWORD}> "one", "two", "three" ;
        <${ISSUED}> "2026-09-15T10:00:00.000+00:00"^^xsd:dateTime .
    `)
    const values = seedValues(store, SUBJECT, fieldsFor(store))

    expect(values[TITLE]).toMatchObject([{ value: 'Health & Biomedical Research' }])
    expect(values[KEYWORD]).toMatchObject([{ value: 'one' }, { value: 'two' }, { value: 'three' }])
    // The editable date stays unformatted; the original term retains its datatype.
    expect(values[ISSUED]).toMatchObject([
      {
        value: '2026-09-15T10:00:00.000+00:00',
        originalTerm: {
          termType: 'Literal',
          datatype: { value: 'http://www.w3.org/2001/XMLSchema#dateTime' },
        },
      },
    ])
  })

  it('follows an sh:node field into its blank node', () => {
    const store = parseTurtle(`
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      <${SUBJECT}> a <${CATALOG}> ;
        <${PUBLISHER}> [ a foaf:Agent ; <${FOAF_NAME}> "University Medical Center" ] .
    `)
    const values = seedValues(store, SUBJECT, fieldsFor(store))

    expect(values[PUBLISHER]).toMatchObject([
      { values: { [FOAF_NAME]: [{ value: 'University Medical Center' }] } },
    ])
  })

  it('gives an absent path one blank entry, nested shapes included', () => {
    const store = parseTurtle(`<${SUBJECT}> a <${CATALOG}> .`)
    const values = seedValues(store, SUBJECT, fieldsFor(store))

    expect(values[TITLE]).toMatchObject([{ value: '' }])
    expect(values[PUBLISHER]).toMatchObject([{ values: { [FOAF_NAME]: [{ value: '' }] } }])
  })

  it('keeps the language tag, which the legacy client drops on every field it rewrites', () => {
    const store = parseTurtle(`
      <${SUBJECT}> a <${CATALOG}> ;
        <${TITLE}> "Health & Biomedical Research"@en ;
        <${KEYWORD}> "surveillance"@en, "toezicht"@nl .
    `)
    const values = seedValues(store, SUBJECT, fieldsFor(store))

    expect(values[TITLE]).toMatchObject([
      { value: 'Health & Biomedical Research', originalTerm: { language: 'en' } },
    ])
    expect(values[KEYWORD]).toMatchObject([
      { value: 'surveillance', originalTerm: { language: 'en' } },
      { value: 'toezicht', originalTerm: { language: 'nl' } },
    ])
  })

  it('retains distinct original terms when an IRI and literal have identical text', () => {
    const store = parseTurtle(`<${SUBJECT}> a <${CATALOG}>;
      <${KEYWORD}> <http://example.org/value>, "http://example.org/value" .`)
    const values = seedValues(store, SUBJECT, fieldsFor(store))[KEYWORD] as TermValue[]
    expect(values.map((entry) => entry.originalTerm?.termType)).toEqual(['NamedNode', 'Literal'])
    values[0]!.value = 'http://example.org/edited'
    expect(values[0]!.originalTerm?.value).toBe('http://example.org/value')
    expect(store.getObjects(SUBJECT, KEYWORD, null).map((term) => term.value)).toEqual([
      'http://example.org/value',
      'http://example.org/value',
    ])
  })

  it('retains original subjects for both blank and named nested records', () => {
    const store = parseTurtle(`<${SUBJECT}> a <${CATALOG}>;
      <${PUBLISHER}> [ <${FOAF_NAME}> "Blank agent" ], <http://example.org/agent> .
      <http://example.org/agent> <${FOAF_NAME}> "Named agent" .`)
    const values = seedValues(store, SUBJECT, fieldsFor(store))[PUBLISHER] as NestedValue[]
    const subjects = store.getObjects(SUBJECT, PUBLISHER, null)
    expect(values.map((entry) => entry.originalTerm)).toEqual(subjects)
    const name = values[0]!.values[FOAF_NAME]![0] as TermValue
    name.value = 'Edited agent'
    expect(name.originalTerm?.value).toBe('Blank agent')
    expect(store.getObjects(subjects[0]!, FOAF_NAME, null)[0]?.value).toBe('Blank agent')
  })

  it('offers sh:minCount entries, not just one, and none at sh:maxCount 0', () => {
    const countShapes = parseTurtle(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      <http://ex/CountShape> a sh:NodeShape ; sh:targetClass <${CATALOG}> ;
        sh:property [ sh:path <${KEYWORD}> ; sh:minCount 3 ; dash:editor <${TEXT_FIELD}> ] ,
          [ sh:path <${TITLE}> ; sh:maxCount 0 ; dash:editor <${TEXT_FIELD}> ] .
    `)
    const store = parseTurtle(`<${SUBJECT}> a <${CATALOG}> .`)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [countShapes]))
    const values = seedValues(store, SUBJECT, fields)

    expect(values[KEYWORD]).toHaveLength(3)
    expect(values[TITLE]).toHaveLength(0)
  })

  it("never truncates values that exceed the shape's own maxCount", () => {
    const cappedShapes = parseTurtle(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      <http://ex/CappedShape> a sh:NodeShape ; sh:targetClass <${CATALOG}> ;
        sh:property [ sh:path <${KEYWORD}> ; sh:maxCount 1 ; dash:editor <${TEXT_FIELD}> ] .
    `)
    const store = parseTurtle(`
      <${SUBJECT}> a <${CATALOG}> ; <${KEYWORD}> "one", "two", "three" .
    `)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [cappedShapes]))

    expect(seedValues(store, SUBJECT, fields)[KEYWORD]).toHaveLength(3)
  })
})

describe('isNestedField', () => {
  it('follows the declared editor, not the mere presence of sh:node', () => {
    // sh:node can constrain what an IRI points at while the shape still asks for a URIEditor.
    const uriWithNode = parseTurtle(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      <http://ex/Shape> a sh:NodeShape ; sh:targetClass <${CATALOG}> ;
        sh:property [ sh:path <${PUBLISHER}> ; sh:node <http://ex/AgentShape> ;
          dash:editor <http://datashapes.org/dash#URIEditor> ] .
      <http://ex/AgentShape> a sh:NodeShape ; sh:targetClass <${AGENT}> ;
        sh:property [ sh:path <${FOAF_NAME}> ; dash:editor <${TEXT_FIELD}> ] .
    `)
    const store = parseTurtle(`
      <${SUBJECT}> a <${CATALOG}> ; <${PUBLISHER}> <http://example.org/agent/1> .
    `)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [uriWithNode]))

    expect(fields[0]!.nested).toHaveLength(1)
    expect(isNestedField(fields[0]!)).toBe(false)
    // Seeded as an IRI to edit, not as a sub-record to fill in.
    expect(seedValues(store, SUBJECT, fields)[PUBLISHER]).toMatchObject([
      { value: 'http://example.org/agent/1' },
    ])
  })

  it('is nested when the shape asks for a BlankNodeEditor and the sub-shape resolved', () => {
    const store = parseTurtle(`
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      <${SUBJECT}> a <${CATALOG}> ;
        <${PUBLISHER}> [ a foaf:Agent ; <${FOAF_NAME}> "University Medical Center" ] .
    `)
    expect(isNestedField(fieldsFor(store).find((f) => f.path === PUBLISHER)!)).toBe(true)
  })
})

describe('fieldsSignature', () => {
  const store = parseTurtle(`<${SUBJECT}> a <${CATALOG}> .`)

  it('is stable across evaluations, so re-seeding does not discard typed values', () => {
    // getEditableFields returns a fresh array each time; the signature must not notice.
    expect(fieldsSignature(fieldsFor(store))).toBe(fieldsSignature(fieldsFor(store)))
    expect(fieldsFor(store)).not.toBe(fieldsFor(store))
  })

  it('changes when the form itself changes', () => {
    const fewer = parseTurtle(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      <http://ex/Fewer> a sh:NodeShape ; sh:targetClass <${CATALOG}> ;
        sh:property [ sh:path <${TITLE}> ; dash:editor <${TEXT_FIELD}> ] .
    `)
    const other = getEditableFields(getShapePropertyMap(store, SUBJECT, [fewer]))
    expect(fieldsSignature(other)).not.toBe(fieldsSignature(fieldsFor(store)))
  })

  it('ignores presentation order at every level without reordering the fields', () => {
    const fields = fieldsFor(store)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    publisher.nested.push({ ...publisher.nested[0]!, path: 'urn:other' })
    const paths = fields.map((field) => field.path)
    const reordered = [...fields].reverse().map((field) => ({
      ...field,
      label: 'New label',
      order: 99,
      nested: [...field.nested].reverse(),
    }))

    expect(fieldsSignature(reordered)).toBe(fieldsSignature(fields))
    expect(fields.map((field) => field.path)).toEqual(paths)
    expect(publisher.nested.map((field) => field.path)).toEqual([FOAF_NAME, 'urn:other'])
  })

  it.each(['minCount', 'maxCount'] as const)('includes %s at every level', (bound) => {
    const fields = fieldsFor(store)
    const signature = fieldsSignature(fields)
    fields[0]![bound] = 3
    expect(fieldsSignature(fields)).not.toBe(signature)

    const nestedFields = fieldsFor(store)
    nestedFields.find((field) => field.path === PUBLISHER)!.nested[0]![bound] = 3
    expect(fieldsSignature(nestedFields)).not.toBe(signature)
  })

  it('distinguishes punctuation in paths from field and nesting boundaries', () => {
    const leaf = fieldsFor(store)[0]!
    expect(fieldsSignature([{ ...leaf, path: 'urn:a,urn:b' }])).not.toBe(
      fieldsSignature([
        { ...leaf, path: 'urn:a' },
        { ...leaf, path: 'urn:b' },
      ]),
    )
    expect(fieldsSignature([{ ...leaf, path: 'urn:a(urn:b)' }])).not.toBe(
      fieldsSignature([
        { ...leaf, path: 'urn:a', editor: BLANK_NODE, nested: [{ ...leaf, path: 'urn:b' }] },
      ]),
    )
  })

  it('distinguishes a nested record from an IRI that merely has an sh:node', () => {
    const shapeFor = (editor: string) =>
      parseTurtle(`
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix dash: <http://datashapes.org/dash#> .
        <http://ex/S> a sh:NodeShape ; sh:targetClass <${CATALOG}> ;
          sh:property [ sh:path <${PUBLISHER}> ; sh:node <http://ex/AgentShape> ;
            dash:editor <${editor}> ] .
        <http://ex/AgentShape> a sh:NodeShape ; sh:targetClass <${AGENT}> ;
          sh:property [ sh:path <${FOAF_NAME}> ; dash:editor <${TEXT_FIELD}> ] .
      `)
    const fieldsWith = (editor: string) =>
      getEditableFields(getShapePropertyMap(store, SUBJECT, [shapeFor(editor)]))

    // Same paths, but one holds sub-records and the other plain IRIs, so the state differs.
    expect(fieldsSignature(fieldsWith(BLANK_NODE))).not.toBe(
      fieldsSignature(fieldsWith('http://datashapes.org/dash#URIEditor')),
    )
  })
})

describe('emptyValues', () => {
  it('mirrors the field structure with blank entries', () => {
    const store = parseTurtle(`<${SUBJECT}> a <${CATALOG}> .`)
    expect(emptyValues(fieldsFor(store))).toEqual({
      [TITLE]: [{ value: '' }],
      [KEYWORD]: [{ value: '' }],
      [ISSUED]: [{ value: '' }],
      [PUBLISHER]: [{ values: { [FOAF_NAME]: [{ value: '' }] } }],
    })
  })
})

describe('fieldLabel', () => {
  it("capitalizes a shape's sh:name without changing the rest", () => {
    expect(fieldLabel({ label: 'version', path: 'http://www.w3.org/ns/dcat#version' })).toBe(
      'Version',
    )
    expect(fieldLabel({ label: 'FASTA ID', path: 'urn:whatever' })).toBe('FASTA ID')
    expect(fieldLabel({ label: '', path: 'urn:whatever' })).toBe('')
  })

  it('falls back to the predicate label when the shape gives no sh:name', () => {
    expect(fieldLabel({ label: null, path: 'http://www.w3.org/ns/dcat#format' })).toBe('Format')
  })
})
