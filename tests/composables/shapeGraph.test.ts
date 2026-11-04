import { describe, expect, it } from 'vitest'
import { DataFactory } from 'n3'
import { parseTurtle } from '../../src/composables/rdfUtils'
import { getEditableFields, getShapePropertyMap } from '../../src/composables/shaclUtils'
import type { EditableField } from '../../src/composables/shaclUtils'
import type { Store } from 'n3'
import {
  seedValues,
  type NestedValue,
  type NodeValues,
  type TermValue,
} from '../../src/composables/shapeForm'
import { buildResourceGraph, validateResourceGraph } from '../../src/composables/shapeGraph'

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

/** Builds the draft graph, then validates it the way save() does. */
function validationFor(store: Store, fields: EditableField[], values: NodeValues) {
  return validateResourceGraph(buildResourceGraph(store, SUBJECT, fields, values), SUBJECT, fields)
}

const messagesFor = (store: Store, fields: EditableField[], values: NodeValues) =>
  validationFor(store, fields, values).flatMap((result) => result.messages)

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
  it.each([1, 3])(
    'does not save an empty optional nested placeholder with maxCount %s',
    (maxCount) => {
      const { store, fields } = setup(`<${SUBJECT}> a <urn:Resource> .`)
      const publisher = fields.find((field) => field.path === PUBLISHER)!
      publisher.maxCount = maxCount
      publisher.nested[0]!.minCount = 1
      const values = seedValues(store, SUBJECT, fields)

      const graph = buildResourceGraph(store, SUBJECT, fields, values)
      expect(graph.getObjects(SUBJECT, PUBLISHER, null)).toEqual([])
      expect(graph.size).toBe(store.size)
    },
  )

  it('still rejects an absent required nested record', () => {
    const { store, fields } = setup(`<${SUBJECT}> a <urn:Resource> .`)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    Object.assign(publisher, { minCount: 1, maxCount: 1, label: 'Publisher' })
    const values = seedValues(store, SUBJECT, fields)
    expect(messagesFor(store, fields, values)).toContain('Publisher is required.')
  })

  it('keeps a populated new optional record, but omits it after its inputs are cleared', () => {
    const { store, fields, values } = setup(`<${SUBJECT}> a <urn:Resource> .`)
    const entry = values[PUBLISHER]![0] as NestedValue
    ;(entry.values[NAME]![0] as TermValue).value = 'New agent'
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    const agent = graph.getObjects(SUBJECT, PUBLISHER, null)[0]!
    expect(graph.getObjects(agent, NAME, null)[0]!.value).toBe('New agent')
    ;(entry.values[NAME]![0] as TermValue).value = ''
    expect(
      buildResourceGraph(store, SUBJECT, fields, values).getObjects(SUBJECT, PUBLISHER, null),
    ).toEqual([])
  })

  it('preserves an originally empty nested record', () => {
    const { store, fields, values } = setup(`<${SUBJECT}> a <urn:Resource>; <${PUBLISHER}> [] .`)
    expect(
      buildResourceGraph(store, SUBJECT, fields, values).getObjects(SUBJECT, PUBLISHER, null),
    ).toEqual(store.getObjects(SUBJECT, PUBLISHER, null))
  })

  it.each(['_:agent', '<urn:agent>'])(
    'preserves a removed publisher %s still used as creator',
    (agent) => {
      const { store, fields, values } = setup(`
      <${SUBJECT}> a <urn:Resource>; <${PUBLISHER}> ${agent}; <urn:creator> ${agent} .
      ${agent} <${NAME}> "Agent"; <${EXTRA}> "Keep" .
    `)
      values[PUBLISHER] = []
      const graph = buildResourceGraph(store, SUBJECT, fields, values)
      const creator = graph.getObjects(SUBJECT, 'urn:creator', null)[0]!
      expect(graph.getObjects(SUBJECT, PUBLISHER, null)).toEqual([])
      expect(graph.getObjects(creator, NAME, null)[0]!.value).toBe('Agent')
      expect(graph.getObjects(creator, EXTRA, null)[0]!.value).toBe('Keep')
    },
  )

  it.each([true, false])('decides cleanup from the final references: keep=%s', (keep) => {
    const { store, fields, values } = setup(`
      <${SUBJECT}> a <urn:Resource>; <${PUBLISHER}> <urn:agent>;
        <${LINK}> <${keep ? 'urn:old-link' : 'urn:agent'}> .
      <urn:agent> <${NAME}> "Agent"; <${EXTRA}> "Keep" .
    `)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    const ordered = [publisher, ...fields.filter((field) => field !== publisher)]
    values[PUBLISHER] = []
    values[LINK] = keep ? [{ value: 'urn:agent' }] : []
    const graph = buildResourceGraph(store, SUBJECT, ordered, values)
    expect(graph.getObjects('urn:agent', EXTRA, null)).toHaveLength(keep ? 1 : 0)
  })

  it('omits recursively empty new records but keeps a populated descendant', () => {
    const { store, fields } = setup(`<${SUBJECT}> a <urn:Resource> .`)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    publisher.nested = [{ ...publisher, path: 'urn:employer' }]
    const values = seedValues(store, SUBJECT, fields)
    expect(buildResourceGraph(store, SUBJECT, fields, values).size).toBe(store.size)

    const agent = values[PUBLISHER]![0] as NestedValue
    const employer = agent.values['urn:employer']![0] as NestedValue
    ;(employer.values[NAME]![0] as TermValue).value = 'Employer'
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    const publisherTerm = graph.getObjects(SUBJECT, PUBLISHER, null)[0]!
    const employerTerm = graph.getObjects(publisherTerm, 'urn:employer', null)[0]!
    expect(graph.getObjects(employerTerm, NAME, null)[0]!.value).toBe('Employer')
  })

  it('validates required children once an optional record has content', () => {
    const { store, fields } = setup(`<${SUBJECT}> a <urn:Resource> .`)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    publisher.label = 'Publisher'
    const name = publisher.nested[0]!
    Object.assign(name, { minCount: 1, label: 'Name' })
    publisher.nested.push({ ...name, path: EXTRA, minCount: 0 })
    const values = seedValues(store, SUBJECT, fields)
    const agent = values[PUBLISHER]![0] as NestedValue
    ;(agent.values[EXTRA]![0] as TermValue).value = 'Some content'
    expect(messagesFor(store, fields, values)).toContain('Publisher: Name is required.')
  })

  it('rejects a cleared required field before it can be saved', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === TITLE)!,
      { minCount: 1, label: 'Title' },
    )
    ;(values[TITLE]![0] as TermValue).value = ''
    expect(messagesFor(store, fields, values)).toContain('Title is required.')
    expect(store.getObjects(SUBJECT, TITLE, null)[0]?.value).toBe('Old title')
  })

  it('exposes the failing field on the thrown error, for a top-level focus node', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === TITLE)!,
      { minCount: 1, label: 'Title' },
    )
    ;(values[TITLE]![0] as TermValue).value = ''
    expect(validationFor(store, fields, values)).toMatchObject([
      {
        focusNode: { termType: 'NamedNode', value: SUBJECT },
        path: { termType: 'NamedNode', value: TITLE },
        messages: ['Title is required.'],
      },
    ])
  })

  it('omits the focus node for a nested required field, whose subject is a blank node', () => {
    const { store, fields, values } = setup(RESOURCE)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    publisher.label = 'Publisher'
    Object.assign(publisher.nested[0]!, { minCount: 1, label: 'Name' })
    ;((values[PUBLISHER]![0] as NestedValue).values[NAME]![0] as TermValue).value = ''
    expect(validationFor(store, fields, values)).toMatchObject([
      { focusNode: undefined, path: { termType: 'NamedNode', value: NAME } },
    ])
  })

  it('reports every missing required field, not just the first', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === TITLE)!,
      { minCount: 1, label: 'Title' },
    )
    Object.assign(
      fields.find((field) => field.path === LINK)!,
      { minCount: 1, label: 'Link' },
    )
    ;(values[TITLE]![0] as TermValue).value = ''
    ;(values[LINK]![0] as TermValue).value = ''
    expect(validationFor(store, fields, values)).toMatchObject([
      { path: { value: TITLE }, messages: ['Title is required.'] },
      { path: { value: LINK }, messages: ['Link is required.'] },
    ])
  })

  it('counts distinct saved values for repeatable required fields', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === TITLE)!,
      { minCount: 2, maxCount: 3, label: 'Title' },
    )
    values[TITLE] = [{ value: 'Same' }, { value: 'Same' }, { value: '' }]
    expect(messagesFor(store, fields, values)).toContain('Title requires at least 2 values.')
    values[TITLE]![1] = { value: 'Different' }
    expect(messagesFor(store, fields, values)).toEqual([])
  })

  it('identifies missing required values inside a nested record', () => {
    const { store, fields, values } = setup(RESOURCE)
    const publisher = fields.find((field) => field.path === PUBLISHER)!
    publisher.label = 'Publisher'
    Object.assign(publisher.nested[0]!, { minCount: 1, label: 'Name' })
    ;((values[PUBLISHER]![0] as NestedValue).values[NAME]![0] as TermValue).value = ''
    expect(messagesFor(store, fields, values)).toContain('Publisher: Name is required.')
  })

  it('rejects a non-absolute value entered into a URIEditor field', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === LINK)!,
      { label: 'Link' },
    )
    ;(values[LINK]![0] as TermValue).value = 'not-a-uri'
    expect(messagesFor(store, fields, values)).toContain('Link must be a valid absolute IRI.')
  })

  it('rejects an absolute URI that would produce invalid Turtle', () => {
    const { store, fields, values } = setup(RESOURCE)
    Object.assign(
      fields.find((field) => field.path === LINK)!,
      { label: 'Link' },
    )
    ;(values[LINK]![0] as TermValue).value = 'https://example.org/has space'
    expect(messagesFor(store, fields, values)).toContain('Link must be a valid absolute IRI.')
  })

  it('leaves validation of unsupported editors to the server', () => {
    const { store, fields, values } = setup(RESOURCE)
    fields.push({
      ...fields[0]!,
      path: 'urn:unsupported',
      minCount: 1,
      editor: 'urn:UnsupportedEditor',
    })
    expect(messagesFor(store, fields, values)).toEqual([])
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

  it.each(['neither', 'publisher', 'employer'])(
    'cleans up removed nested records while retaining shared records: %s',
    (shared) => {
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
      if (shared !== 'neither') {
        store.addQuad(
          DataFactory.namedNode(SUBJECT),
          DataFactory.namedNode('urn:creator'),
          shared === 'publisher' ? publisher.originalTerm! : employerTerm,
        )
      }
      values[PUBLISHER] = []

      const graph = buildResourceGraph(store, SUBJECT, fields, values)
      expect(graph.getObjects(publisher.originalTerm!, null, null)).toHaveLength(
        shared === 'publisher' ? 2 : 0,
      )
      expect(graph.getObjects(employerTerm, NAME, null)).toHaveLength(shared === 'neither' ? 0 : 1)
    },
  )

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

  // FDP's own root shape pairs sh:nodeKind sh:IRI with a TextAreaEditor.
  const iriUnderTextArea = parseTurtle(`
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix dash: <http://datashapes.org/dash#> .
    <urn:Shape> a sh:NodeShape; sh:targetClass <urn:Resource>;
      sh:property [ sh:path <urn:endpoint>; sh:name "Endpoint"; sh:nodeKind sh:IRI;
        dash:editor dash:TextAreaEditor ] .
  `)

  it('keeps an IRI an IRI when sh:nodeKind disagrees with the editor hint', () => {
    const store = parseTurtle(`<${SUBJECT}> a <urn:Resource>; <urn:endpoint> <urn:api-docs> .`)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [iriUnderTextArea]))
    const values = seedValues(store, SUBJECT, fields)

    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, 'urn:endpoint', null)).toMatchObject([
      { termType: 'NamedNode', value: 'urn:api-docs' },
    ])
  })

  it('validates the IRI of such a field, as it would for a URIEditor', () => {
    const store = parseTurtle(`<${SUBJECT}> a <urn:Resource>; <urn:endpoint> <urn:api-docs> .`)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [iriUnderTextArea]))
    const values = seedValues(store, SUBJECT, fields)
    ;(values['urn:endpoint']![0] as TermValue).value = 'not-an-iri'

    expect(messagesFor(store, fields, values)).toContain('Endpoint must be a valid absolute IRI.')
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

// TITLE has a text editor and no sh:nodeKind, so the shape types it neither way.
describe('a field the shape types neither as IRI nor literal', () => {
  const withIri = `<${SUBJECT}> a <urn:Resource>; <${TITLE}> <http://example.org/one> .`

  it('leaves an untouched IRI as the very same term', () => {
    const { store, fields, values } = setup(withIri)
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([
      { termType: 'NamedNode', value: 'http://example.org/one' },
    ])
  })

  it('keeps an IRI an IRI when edited to another absolute one', () => {
    const { store, fields, values } = setup(withIri)
    ;(values[TITLE]![0] as TermValue).value = 'http://example.org/two'
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([
      { termType: 'NamedNode', value: 'http://example.org/two' },
    ])
  })

  it('writes a literal once the text is no longer an absolute IRI', () => {
    const { store, fields, values } = setup(withIri)
    ;(values[TITLE]![0] as TermValue).value = 'Just a title'
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([
      { termType: 'Literal', value: 'Just a title' },
    ])
  })

  it('still writes a literal when nothing was stored before', () => {
    const { store, fields, values } = setup(`<${SUBJECT}> a <urn:Resource> .`)
    ;(values[TITLE]![0] as TermValue).value = 'http://example.org/typed-in'
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, TITLE, null)).toMatchObject([{ termType: 'Literal' }])
  })
})

describe('a field the shape does type as a literal', () => {
  const LITERAL_PATH = 'urn:typed'
  const literalShapes = parseTurtle(`
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix dash: <http://datashapes.org/dash#> .
    <urn:Shape> a sh:NodeShape; sh:targetClass <urn:Resource>;
      sh:property [ sh:path <${LITERAL_PATH}>; sh:maxCount 1; sh:nodeKind sh:Literal;
        dash:editor dash:TextFieldEditor ] .
  `)

  it('writes a literal when sh:nodeKind sh:Literal stored an IRI that is then edited', () => {
    const store = parseTurtle(
      `<${SUBJECT}> a <urn:Resource>; <${LITERAL_PATH}> <http://example.org/one> .`,
    )
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [literalShapes]))
    const values = seedValues(store, SUBJECT, fields)
    ;(values[LITERAL_PATH]![0] as TermValue).value = 'http://example.org/two'
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, LITERAL_PATH, null)).toMatchObject([
      { termType: 'Literal', value: 'http://example.org/two' },
    ])
  })

  it('writes a literal when sh:datatype stored an IRI that is then edited', () => {
    const store = parseTurtle(`<${SUBJECT}> a <urn:Resource>; <${ISSUED}> <http://example.org/a> .`)
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [shapes]))
    const values = seedValues(store, SUBJECT, fields)
    ;(values[ISSUED]![0] as TermValue).value = 'http://example.org/b'
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, ISSUED, null)).toMatchObject([
      {
        termType: 'Literal',
        datatype: { value: 'http://www.w3.org/2001/XMLSchema#dateTime' },
      },
    ])
  })

  it('still leaves such an IRI alone while it is untouched', () => {
    const store = parseTurtle(
      `<${SUBJECT}> a <urn:Resource>; <${LITERAL_PATH}> <http://example.org/one> .`,
    )
    const fields = getEditableFields(getShapePropertyMap(store, SUBJECT, [literalShapes]))
    const values = seedValues(store, SUBJECT, fields)
    const graph = buildResourceGraph(store, SUBJECT, fields, values)
    expect(graph.getObjects(SUBJECT, LITERAL_PATH, null)).toMatchObject([
      { termType: 'NamedNode', value: 'http://example.org/one' },
    ])
  })
})
