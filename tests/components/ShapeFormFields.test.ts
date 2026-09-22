import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { mountComponentSetup } from '../helpers/mountComponentSetup'
import { DataFactory } from 'n3'
import { renderToString } from 'vue/server-renderer'
import { parseValidationReport } from '../../src/composables/validationReport'
import ShapeFormFields from '../../src/components/ShapeFormFields.vue'
import { parseTurtle } from '../../src/composables/rdfUtils'
import {
  getEditableFields,
  getShapePropertyMap,
  type EditableField,
} from '../../src/composables/shaclUtils'
import {
  seedValues,
  type TermValue,
  type NestedValue,
  type NodeValues,
} from '../../src/composables/shapeForm'

async function renderFields() {
  const subject = 'http://example.org/resource'
  const store = parseTurtle(`
    @prefix ex: <http://example.org/> .
    ex:resource a ex:Resource;
      ex:title "Title"; ex:keyword "one", "two";
      ex:publisher [ ex:name "First agent" ], [ ex:name "Second agent" ] .
  `)
  const shapes = parseTurtle(`
    @prefix ex: <http://example.org/> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix dash: <http://datashapes.org/dash#> .
    ex:Shape a sh:NodeShape; sh:targetClass ex:Resource;
      sh:property [ sh:path ex:title; sh:name "Title"; sh:minCount 1; sh:maxCount 1;
        dash:editor dash:TextFieldEditor ],
      [ sh:path ex:keyword; sh:name "Keyword"; sh:minCount 1; sh:maxCount 3;
        dash:editor dash:TextFieldEditor ],
      [ sh:path ex:description; sh:name "Description"; sh:maxCount 1;
        dash:editor dash:TextAreaEditor ],
      [ sh:path ex:link; sh:name "Link"; sh:maxCount 1; dash:editor dash:URIEditor ],
      [ sh:path ex:publisher; sh:name "Publisher"; sh:node ex:Agent;
        dash:editor dash:BlankNodeEditor ] .
    ex:Agent a sh:NodeShape; sh:property [ sh:path ex:name; sh:name "Name";
      sh:minCount 1; sh:maxCount 1; dash:editor dash:TextFieldEditor ] .
  `)
  const fields = getEditableFields(getShapePropertyMap(store, subject, [shapes]))
  const values = seedValues(store, subject, fields)
  return renderToString(createSSRApp({ render: () => h(ShapeFormFields, { fields, values }) }))
}

describe('ShapeFormFields accessibility', () => {
  it('associates labels with unique controls, including repeated nested records', async () => {
    const html = await renderFields()
    const controls = [...html.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map(([tag]) => tag)
    expect(controls).toHaveLength(7)
    const ids = controls.map((tag) => tag.match(/\bid="([^"]+)"/)?.[1])
    expect(new Set(ids).size).toBe(controls.length)
    for (const id of ids) {
      expect(id).toBeDefined()
      expect(html).toContain(`for="${id}"`)
    }
    expect(html).toMatch(/<fieldset\b/)
    expect(html).toMatch(/<legend[^>]*>\s*Publisher\s*</)
    expect(html).toMatch(/<legend[^>]*>\s*Keyword/)
  })

  it('marks mandatory controls and describes repeatable requirements before interaction', async () => {
    const html = await renderFields()
    const input = (value: string) =>
      [...html.matchAll(/<input\b[^>]*>/g)].find(([tag]) => tag.includes(`value="${value}"`))?.[0]
    expect(input('Title')).toContain('aria-required="true"')
    expect(input('First agent')).toContain('aria-required="true"')
    expect(input('one')).toContain('aria-required="false"')
    expect(input('two')).toContain('aria-required="false"')
    expect(html.match(/<textarea\b[^>]*>/)?.[0]).toContain('aria-required="false"')
    expect(html).toContain('At least 1 value is required.')
    const keyword = input('one')!
    const requirementId = keyword.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(requirementId).toBeDefined()
    expect(html).toContain(`id="${requirementId}"`)
    expect(html).not.toContain('class="user-form__hint"')
  })
})

describe('ShapeFormFields dates', () => {
  const originalTimeZone = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'Europe/Amsterdam'
  })
  afterAll(() => {
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  async function renderDates(values: string) {
    const subject = 'http://example.org/resource'
    const store = parseTurtle(`
      @prefix ex: <http://example.org/> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      ex:resource a ex:Resource; ${values} .
    `)
    const shapes = parseTurtle(`
      @prefix ex: <http://example.org/> .
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      ex:Shape a sh:NodeShape; sh:targetClass ex:Resource;
        sh:property [ sh:path ex:issued; sh:name "Issued"; sh:maxCount 1;
          sh:datatype xsd:dateTime; dash:editor dash:DateTimePickerEditor ],
        [ sh:path ex:start; sh:name "Start"; sh:maxCount 1;
          sh:datatype xsd:date; dash:editor dash:DatePickerEditor ] .
    `)
    const fields = getEditableFields(getShapePropertyMap(store, subject, [shapes]))
    const formValues = seedValues(store, subject, fields)
    return renderToString(
      createSSRApp({ render: () => h(ShapeFormFields, { fields, values: formValues }) }),
    )
  }
  const inputOfType = (html: string, type: string) =>
    [...html.matchAll(/<input\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(`type="${type}"`))

  it('shows date-times in local time without a zone selector', async () => {
    const html = await renderDates(
      'ex:issued "2026-09-15T10:00:00+05:30"^^xsd:dateTime; ex:start "2026-09-15"^^xsd:date',
    )
    // 10:00 at +05:30 is 06:30 in Amsterdam in September.
    expect(inputOfType(html, 'datetime-local')).toContain('value="2026-09-15T06:30:00"')
    expect(html).not.toContain('<select')
    expect(inputOfType(html, 'date')).toContain('value="2026-09-15"')
  })

  it('connects the date offset description to the input', async () => {
    const html = await renderDates('ex:start "2026-09-15+02:00"^^xsd:date')
    const input = inputOfType(html, 'date')!
    const descriptionId = input.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(descriptionId).toBeDefined()
    expect(html).toContain(`id="${descriptionId}" class="user-form__zone">UTC+02:00</span>`)
  })

  it('drops fractional seconds a datetime-local input cannot hold, keeping the whole-second precision it can', async () => {
    const html = await renderDates('ex:issued "2026-09-17T07:37:59.257199467Z"^^xsd:dateTime')
    expect(inputOfType(html, 'datetime-local')).toContain('value="2026-09-17T09:37:59"')
  })

  it('keeps the text control once chosen, even once the edited text becomes representable', async () => {
    const subject = 'http://example.org/resource'
    const store = parseTurtle(`
      @prefix ex: <http://example.org/> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      ex:resource a ex:Resource; ex:issued "2026-09-15T24:00:00Z"^^xsd:dateTime .
    `)
    const shapes = parseTurtle(`
      @prefix ex: <http://example.org/> .
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      ex:Shape a sh:NodeShape; sh:targetClass ex:Resource;
        sh:property [ sh:path ex:issued; sh:name "Issued"; sh:maxCount 1;
          sh:datatype xsd:dateTime; dash:editor dash:DateTimePickerEditor ] .
    `)
    const fields = getEditableFields(getShapePropertyMap(store, subject, [shapes]))
    const values = seedValues(store, subject, fields)
    // The hour-24 stored value starts as text. Simulate the user typing over it into a value a
    // picker could show, without a re-seed: the control must not swap mid-edit.
    const entry = values[fields[0]!.path]![0] as TermValue
    entry.value = '2026-09-15T23:00:00Z'
    const html = await renderToString(
      createSSRApp({ render: () => h(ShapeFormFields, { fields, values }) }),
    )
    expect(inputOfType(html, 'datetime-local')).toBeUndefined()
    expect(inputOfType(html, 'text')).toContain('value="2026-09-15T23:00:00Z"')
  })

  it.each(['-0001-01-01T00:00:00', '2026-09-15T24:00:00', '2026-02-30T10:00:00Z'])(
    'falls back to text for unsupported datetime %s',
    async (lexical) => {
      const html = await renderDates(`ex:issued "${lexical}"^^xsd:dateTime`)
      expect(inputOfType(html, 'datetime-local')).toBeUndefined()
      expect(inputOfType(html, 'text')).toContain(`value="${lexical}"`)
    },
  )

  it('falls back to text for an invalid calendar date', async () => {
    const html = await renderDates('ex:start "2026-02-30Z"^^xsd:date')
    expect(inputOfType(html, 'date')).toBeUndefined()
    expect(inputOfType(html, 'text')).toContain('value="2026-02-30Z"')
  })
})

describe('ShapeFormFields validation messages', () => {
  it('attaches messages only to the matching record and links them to the input', async () => {
    const name = 'http://example.org/name'
    const subject = 'http://example.org/resource'
    const field = {
      path: name,
      label: 'Name',
      editor: 'http://datashapes.org/dash#TextFieldEditor',
      minCount: 0,
      maxCount: 1,
      nested: [],
    }
    const validationResults = parseValidationReport(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      [] a sh:ValidationReport; sh:result
        [ sh:focusNode <${subject}>; sh:resultPath <${name}>; sh:resultMessage "Use <plain> text" ],
        [ sh:focusNode <http://example.org/other>; sh:resultPath <${name}>; sh:resultMessage "Other record" ].
    `)
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ShapeFormFields, {
            fields: [field],
            values: { [name]: [{ value: 'Kept' }] },
            subjectUri: subject,
            validationResults,
          }),
      }),
    )
    const input = html.match(/<input[^>]*>/)![0]
    const errorId = input.match(/aria-describedby="([^"]+)"/)![1]
    expect(input).toContain('aria-invalid="true"')
    expect(html).toContain(`id="${errorId}"`)
    expect(html).toContain('Use &lt;plain&gt; text')
    expect(html).not.toContain('Other record')
    expect(input).toContain('value="Kept"')
  })

  it('shows a nested error only on the named record targeted by the report', async () => {
    const resource = 'http://example.org/resource'
    const name = 'http://example.org/name'
    const store = parseTurtle(`
      @prefix ex: <http://example.org/> .
      ex:resource a ex:Resource; ex:publisher ex:first, ex:second .
      ex:first ex:name "First agent" .
      ex:second ex:name "Second agent" .
    `)
    const shapes = parseTurtle(`
      @prefix ex: <http://example.org/> .
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix dash: <http://datashapes.org/dash#> .
      ex:ResourceShape a sh:NodeShape; sh:targetClass ex:Resource;
        sh:property [ sh:path ex:publisher; sh:node ex:AgentShape;
          dash:editor dash:BlankNodeEditor ] .
      ex:AgentShape a sh:NodeShape;
        sh:property [ sh:path ex:name; sh:maxCount 1; dash:editor dash:TextFieldEditor ] .
    `)
    const fields = getEditableFields(getShapePropertyMap(store, resource, [shapes]))
    const values = seedValues(store, resource, fields)
    const validationResults = parseValidationReport(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      [] a sh:ValidationReport; sh:result
        [ sh:focusNode <http://example.org/second>; sh:resultPath <${name}>;
          sh:resultMessage "Second name rejected" ] .
    `)
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ShapeFormFields, { fields, values, subjectUri: resource, validationResults }),
      }),
    )
    const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag)
    const first = inputs.find((tag) => tag.includes('value="First agent"'))!
    const second = inputs.find((tag) => tag.includes('value="Second agent"'))!
    expect(first).not.toContain('aria-invalid="true"')
    expect(second).toContain('aria-invalid="true"')
    const errorId = second.match(/aria-describedby="([^"]+)"/)![1]
    expect(html).toContain(`id="${errorId}"`)
    expect(html).toContain('Second name rejected')
    expect(html.match(/Second name rejected/g)).toHaveLength(1)
  })
})

type LeafRow = { field: EditableField; kind: 'leaf'; entries: TermValue[] }

function mountFields(fields: EditableField[], values: NodeValues) {
  return mountComponentSetup<{
    markTouched: (path: string) => void
    showRequiredHint: (row: LeafRow) => boolean
    requiredHintText: (row: LeafRow) => string
    nestedEntryKey: (entry: NestedValue) => number
    removeEntry: (field: EditableField, index: number) => void
    isChanged: (entry: TermValue) => boolean
    restoreEntry: (field: EditableField, entry: TermValue) => void
  }>(ShapeFormFields, { fields, values })
}

describe('ShapeFormFields required hint (touched)', () => {
  const path = 'http://example.org/title'
  const field = {
    path,
    label: 'Title',
    editor: 'http://datashapes.org/dash#TextFieldEditor',
    minCount: 1,
    maxCount: 1,
    nested: [],
  }
  const emptyRow = { field, kind: 'leaf' as const, entries: [{ value: '' } as TermValue] }

  it('stays hidden until the field has been left, then shows once it is', () => {
    const { state, unmount } = mountFields([field], { [path]: [{ value: '' }] })
    try {
      expect(state.showRequiredHint(emptyRow)).toBe(false)
      state.markTouched(path)
      expect(state.showRequiredHint(emptyRow)).toBe(true)
    } finally {
      unmount()
    }
  })

  it('hides again once the value satisfies the minimum', () => {
    const { state, unmount } = mountFields([field], { [path]: [{ value: '' }] })
    try {
      state.markTouched(path)
      expect(state.showRequiredHint(emptyRow)).toBe(true)
      const filledRow = { ...emptyRow, entries: [{ value: 'Filled' } as TermValue] }
      expect(state.showRequiredHint(filledRow)).toBe(false)
    } finally {
      unmount()
    }
  })

  it('accepts an untouched original empty literal, as save does', () => {
    const values = { [path]: [{ value: '', originalTerm: DataFactory.literal('') }] }
    const { state, unmount } = mountFields([field], values)
    try {
      state.markTouched(path)
      expect(state.showRequiredHint({ ...emptyRow, entries: values[path] })).toBe(false)
    } finally {
      unmount()
    }
  })

  it('counts duplicate RDF terms only once', () => {
    const repeatable = { ...field, minCount: 2, maxCount: 3 }
    const entries = [{ value: 'Same' }, { value: 'Same' }]
    const { state, unmount } = mountFields([repeatable], { [path]: entries })
    try {
      state.markTouched(path)
      expect(state.showRequiredHint({ field: repeatable, kind: 'leaf', entries })).toBe(true)
    } finally {
      unmount()
    }
  })

  it('says "is required" for a single-valued field, not a count', () => {
    const { state, unmount } = mountFields([field], { [path]: [{ value: '' }] })
    try {
      expect(state.requiredHintText(emptyRow)).toBe('Title is required.')
    } finally {
      unmount()
    }
  })

  it('keeps the count phrasing for a field that can hold more than one value', () => {
    const repeatable = { ...field, label: 'Keyword', minCount: 2, maxCount: 3 }
    const { state, unmount } = mountFields([repeatable], { [path]: [{ value: '' }] })
    try {
      expect(
        state.requiredHintText({ field: repeatable, kind: 'leaf' as const, entries: [] }),
      ).toBe('Keyword requires at least 2 values.')
    } finally {
      unmount()
    }
  })
})

describe('ShapeFormFields nested record keys', () => {
  it('keeps surviving record keys stable when an earlier record is removed', () => {
    const field: EditableField = {
      path: 'urn:publisher',
      label: 'Publisher',
      editor: 'http://datashapes.org/dash#BlankNodeEditor',
      minCount: 0,
      maxCount: null,
      nested: [],
    }
    const first: NestedValue = { values: {} }
    const second: NestedValue = { values: {} }
    const third: NestedValue = { values: {} }
    const values = { [field.path]: [first, second, third] }
    const { state, unmount } = mountFields([field], values)
    try {
      const originalKeys = values[field.path].map(state.nestedEntryKey)
      expect(new Set(originalKeys).size).toBe(3)
      state.removeEntry(field, 0)
      expect(values[field.path].map(state.nestedEntryKey)).toEqual(originalKeys.slice(1))
      expect(originalKeys).not.toContain(state.nestedEntryKey({ values: {} }))
    } finally {
      unmount()
    }
  })
})

describe('ShapeFormFields restore', () => {
  const path = 'http://example.org/title'
  const field: EditableField = {
    path,
    label: 'Title',
    editor: 'http://datashapes.org/dash#TextFieldEditor',
    minCount: 0,
    maxCount: 1,
    nested: [],
  }

  it('is unchanged until the text differs from what was loaded', () => {
    const entry: TermValue = { value: 'Original', originalTerm: DataFactory.literal('Original') }
    const { state, unmount } = mountFields([field], { [path]: [entry] })
    try {
      expect(state.isChanged(entry)).toBe(false)
      entry.value = 'Edited'
      expect(state.isChanged(entry)).toBe(true)
    } finally {
      unmount()
    }
  })

  it('treats a freshly added entry as changed once it has text, unchanged while blank', () => {
    const entry: TermValue = { value: '' }
    const { state, unmount } = mountFields([field], { [path]: [entry] })
    try {
      expect(state.isChanged(entry)).toBe(false)
      entry.value = 'New title'
      expect(state.isChanged(entry)).toBe(true)
    } finally {
      unmount()
    }
  })

  it('restores the original text', () => {
    const entry: TermValue = { value: 'Edited', originalTerm: DataFactory.literal('Original') }
    const { state, unmount } = mountFields([field], { [path]: [entry] })
    try {
      state.restoreEntry(field, entry)
      expect(entry.value).toBe('Original')
      expect(state.isChanged(entry)).toBe(false)
    } finally {
      unmount()
    }
  })

  it('counts restoring as leaving the field, surfacing a still-unmet requirement immediately', () => {
    const requiredField: EditableField = { ...field, minCount: 1 }
    // No originalTerm: a blank padding entry that was never backed by a stored value.
    const entry: TermValue = { value: 'Typed then reconsidered' }
    const { state, unmount } = mountFields([requiredField], { [path]: [entry] })
    try {
      state.restoreEntry(requiredField, entry)
      expect(entry.value).toBe('')
      expect(
        state.showRequiredHint({ field: requiredField, kind: 'leaf', entries: [entry] }),
      ).toBe(true)
    } finally {
      unmount()
    }
  })

  it('restores a brand new entry back to blank', () => {
    const entry: TermValue = { value: 'Typed before realising it was unwanted' }
    const { state, unmount } = mountFields([field], { [path]: [entry] })
    try {
      state.restoreEntry(field, entry)
      expect(entry.value).toBe('')
    } finally {
      unmount()
    }
  })
})
