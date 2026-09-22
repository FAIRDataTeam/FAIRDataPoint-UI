import { describe, expect, it } from 'vitest'
import { parseTurtle } from '../../src/composables/rdfUtils'
import { getEditableFields, getShapePropertyMap } from '../../src/composables/shaclUtils'
import {
  seedValues,
  type NestedValue,
  type NodeValues,
  type TermValue,
} from '../../src/composables/shapeForm'
import { buildResourceGraph } from '../../src/composables/shapeGraph'

const SUBJECT = 'urn:resource'
const TITLE = 'urn:title'
const EXTRA = 'urn:extra'
const ISSUED = 'urn:issued'
const LINK = 'urn:link'
const PUBLISHER = 'urn:publisher'
const NAME = 'urn:name'

const shapes = parseTurtle(`
  @prefix sh: <http://www.w3.org/ns/shacl#> .
  @prefix dash: <http://datashapes.org/dash#> .
  @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
  <urn:Shape> a sh:NodeShape; sh:targetClass <urn:Resource>;
    sh:property
      [ sh:path <${TITLE}>; sh:maxCount 1; dash:editor dash:TextFieldEditor ],
      [ sh:path <${ISSUED}>; sh:maxCount 1; sh:datatype xsd:dateTime;
        dash:editor dash:DateTimePickerEditor ],
      [ sh:path <${LINK}>; sh:maxCount 1; dash:editor dash:URIEditor ],
      [ sh:path <${PUBLISHER}>; sh:maxCount 3; sh:node <urn:AgentShape>;
        dash:editor dash:BlankNodeEditor ] .
  <urn:AgentShape> a sh:NodeShape;
    sh:property [ sh:path <${NAME}>; sh:maxCount 1; dash:editor dash:TextFieldEditor ] .
`)

/** A fresh resource store, seeded fields and form values, and one publisher blank node's id. */
function setup(resourceTurtle: string) {
  const store = parseTurtle(resourceTurtle)
  const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [shapes]))
  const values = seedValues(store, SUBJECT, fields)
  return { store, fields, values }
}

const RESOURCE = `
  @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
  <${SUBJECT}> a <urn:Resource>;
    <${TITLE}> "Old title"@en;
    <${EXTRA}> "not in the shape";
    <${ISSUED}> "2026-01-01T00:00:00Z"^^xsd:dateTime;
    <${LINK}> <urn:old-link>;
    <${PUBLISHER}> [ <${NAME}> "Old agent"@en; <${EXTRA}> "keep me too" ] .
  <urn:other> <urn:p> <urn:o> .
`

describe('buildResourceGraph', () => {
  it('rejects a cleared required field before it can be saved', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === TITLE)!,
      { minCount: 1, label: 'Title' },
    )
    ;(values[TITLE]![0] as TermValue).value = ''
    expect(() => buildResourceGraph(store, SUBJECT, fields, values)).toThrow(
      'Title requires at least 1 value.',
    )
    expect(store.getObjects(SUBJECT, TITLE, null)[0]?.value).toBe('Old title')
  })

  it('counts distinct saved values for repeatable required fields', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === TITLE)!,
      { minCount: 2, maxCount: 3, label: 'Title' },
    )
    values[TITLE] = [{ value: 'Same' }, { value: 'Same' }, { value: '' }]
    expect(() => buildResourceGraph(store, SUBJECT, fields, values)).toThrow(
      'Title requires at least 2 values.',
    )
    values[TITLE]![1] = { value: 'Different' }
    expect(() => buildResourceGraph(store, SUBJECT, fields, values)).not.toThrow()
  })

  it('identifies missing required values inside a nested record', () => {
    const { store, fields, values } = setup(RESOURCE)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    publisher.label = 'Publisher'
    Object.assign(publisher.nested[0]!, { minCount: 1, label: 'Name' })
    ;((values[PUBLISHER]![0] as NestedValue).values[NAME]![0] as TermValue).value = ''
    expect(() => buildResourceGraph(store, SUBJECT, fields, values)).toThrow(
      'Publisher: Name requires at least 1 value.',
    )
  })

  it('leaves validation of unsupported editors to the server', () => {
    const { store, fields, values } = setup(RESOURCE)
    fields.push({
      ...fields[0]!,
      path: 'urn:unsupported',
      minCount: 1,
      editor: 'urn:UnsupportedEditor',
    })
    expect(() => buildResourceGraph(store, SUBJECT, fields, values)).not.toThrow()
  })

  it('leaves an untouched value equal to the original, and preserves what the shape does not cover', () => {
    const { store, fields, values } = setup(RESOURCE)
    const graph = buildResourceGraph(store, SUBJECT, fields, values)

    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([
      { value: 'Old title', language: 'en' },
    ])
    expect(graph.getObjects(SUBJECT, EXTRA, null)).toMatchObject([{ value: 'not in the shape' }])
    expect(graph.getObjects('urn:other', 'urn:p', null)).toMatchObject([{ value: 'urn:o' }])
  })

  it('keeps the original datatype and language when the edited text changes', () => {
    const { store, fields, values } = setup(RESOURCE)
    ;(values[ISSUED]![0] as TermValue).value = '2026-02-02T00:00:00Z'
    ;(values[TITLE]![0] as TermValue).value = 'New title'

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, ISSUED, null)).toMatchObject([
      {
        value: '2026-02-02T00:00:00Z',
        datatype: { value: 'http://www.w3.org/2001/XMLSchema#dateTime' },
      },
    ])
    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([
      { value: 'New title', language: 'en' },
    ])
  })

  it('builds an IRI for a URIEditor field, not a literal', () => {
    const { store, fields, values } = setup(RESOURCE)
    ;(values[LINK]![0] as TermValue).value = 'urn:new-link'

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    const [link] = graph.getObjects(SUBJECT, LINK, null)
    expect(link?.termType).toBe('NamedNode')
    expect(link?.value).toBe('urn:new-link')
  })

  it('drops a cleared value instead of writing an empty term', () => {
    const { store, fields, values } = setup(RESOURCE)
    ;(values[TITLE]![0] as TermValue).value = ''

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toEqual([])
  })

  it('gives a brand new value the field-declared datatype', () => {
    const { store, fields, values } = setup(RESOURCE)
    values[ISSUED]!.push({ value: '2026-03-03T00:00:00Z' })

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, ISSUED, null)).toMatchObject([
      { value: '2026-01-01T00:00:00Z' },
      {
        value: '2026-03-03T00:00:00Z',
        datatype: { value: 'http://www.w3.org/2001/XMLSchema#dateTime' },
      },
    ])
  })

  it('defaults a brand new plain value to a plain literal, with no language', () => {
    const { store, fields, values } = setup(RESOURCE)
    values[TITLE]![0] = { value: 'Replaced title' }

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([
      { value: 'Replaced title', language: '' },
    ])
  })

  it('edits a nested record in place, keeping its blank-node identity and unshaped properties', () => {
    const { store, fields, values } = setup(RESOURCE)
    const publisher = values[PUBLISHER]![0] as NestedValue
    ;(publisher.values[NAME]![0] as TermValue).value = 'New agent'

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    const [publisherTerm] = graph.getObjects(SUBJECT, PUBLISHER, null)
    expect(publisherTerm).toEqual(publisher.originalTerm)
    expect(graph.getObjects(publisherTerm!, NAME, null)).toMatchObject([{ value: 'New agent' }])
    expect(graph.getObjects(publisherTerm!, EXTRA, null)).toMatchObject([{ value: 'keep me too' }])
  })

  it('gives a newly added nested record a fresh blank node', () => {
    const { store, fields, values } = setup(RESOURCE)
    values[PUBLISHER]!.push({ values: { [NAME]: [{ value: 'Second agent' }] } })

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    const publishers = graph.getObjects(SUBJECT, PUBLISHER, null)
    expect(publishers).toHaveLength(2)
    const names = publishers.map((p) => graph.getObjects(p, NAME, null)[0]?.value).sort()
    expect(names).toEqual(['Old agent', 'Second agent'].sort((a, b) => a.localeCompare(b)))
  })

  it('purges a removed record entirely, including a further nested record inside it', () => {
    const store = parseTurtle(`
      <${SUBJECT}> a <urn:Resource>;
        <${PUBLISHER}> [ <${NAME}> "Agent"; <urn:employer> [ <${NAME}> "Employer" ] ] .
    `)
    const shapesWithEmployer = parseTurtle(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      <urn:Shape> a sh:NodeShape; sh:targetClass <urn:Resource>;
        sh:property [ sh:path <${PUBLISHER}>; sh:maxCount 1; sh:node <urn:AgentShape>;
          dash:editor dash:BlankNodeEditor ] .
      <urn:AgentShape> a sh:NodeShape;
        sh:property [ sh:path <${NAME}>; sh:maxCount 1; dash:editor dash:TextFieldEditor ],
          [ sh:path <urn:employer>; sh:maxCount 1; sh:node <urn:OrgShape>;
            dash:editor dash:BlankNodeEditor ] .
      <urn:OrgShape> a sh:NodeShape;
        sh:property [ sh:path <${NAME}>; sh:maxCount 1; dash:editor dash:TextFieldEditor ] .
    `)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [shapesWithEmployer]))
    const values = seedValues(store, SUBJECT, fields)
    const publisher = values[PUBLISHER]![0] as NestedValue
    const employerTerm = (publisher.values['urn:employer']![0] as NestedValue).originalTerm!
    values[PUBLISHER] = []

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(publisher.originalTerm!, null, null)).toEqual([])
    expect(graph.getObjects(employerTerm, null, null)).toEqual([])
  })

  it('purges a removed record entirely, including what the shape does not cover', () => {
    const { store, fields, values } = setup(RESOURCE)
    const publisher = values[PUBLISHER]![0] as NestedValue
    const originalTerm = publisher.originalTerm!
    values[PUBLISHER] = []

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, PUBLISHER, null)).toEqual([])
    expect(graph.getObjects(originalTerm, NAME, null)).toEqual([])
    expect(graph.getObjects(originalTerm, EXTRA, null)).toEqual([])
  })

  it('leaves a field untouched when its editor has no widget, even an IRI value', () => {
    const store = parseTurtle(`<${SUBJECT}> a <urn:Resource>; <urn:vocab> <urn:controlled-term> .`)
    const withUnbuilt = parseTurtle(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      <urn:Shape> a sh:NodeShape; sh:targetClass <urn:Resource>;
        sh:property [ sh:path <urn:vocab>; sh:maxCount 1; dash:editor dash:AutoCompleteEditor ] .
    `)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [withUnbuilt]))
    const values = seedValues(store, SUBJECT, fields)

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, 'urn:vocab', null)).toMatchObject([
      { termType: 'NamedNode', value: 'urn:controlled-term' },
    ])
  })

  it('keeps an untouched value that was already an empty string', () => {
    const store = parseTurtle(`<${SUBJECT}> a <urn:Resource>; <${TITLE}> "" .`)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [shapes]))
    const values = seedValues(store, SUBJECT, fields)

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([{ value: '' }])
  })

  it('does not mutate the original store', () => {
    const { store, fields, values } = setup(RESOURCE)
    ;(values[TITLE]![0] as TermValue).value = 'Changed'
    buildResourceGraph(store, SUBJECT, fields, values)
    expect(store.getObjects(SUBJECT, TITLE, null)).toMatchObject([{ value: 'Old title' }])
  })

  it('adds no triples for a field with no current entries at all', () => {
    const { store, fields } = setup(RESOURCE)
    const values: NodeValues = {}
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toEqual([])
    expect(graph.getObjects('urn:other', 'urn:p', null)).toMatchObject([{ value: 'urn:o' }])
  })
})
