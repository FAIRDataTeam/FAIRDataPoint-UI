import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ShapeFormFields from '../../src/components/ShapeFormFields.vue'
import { parseTurtle } from '../../src/composables/rdfUtils'
import { getEditableFields, getShapePropertyMap } from '../../src/composables/shaclUtils'
import { seedValues, type TermValue } from '../../src/composables/shapeForm'

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

  it('marks mandatory controls and describes the minimum for a repeated field', async () => {
    const html = await renderFields()
    const input = (value: string) =>
      [...html.matchAll(/<input\b[^>]*>/g)].find(([tag]) => tag.includes(`value="${value}"`))?.[0]
    expect(input('Title')).toContain('aria-required="true"')
    expect(input('First agent')).toContain('aria-required="true"')
    expect(input('one')).toContain('aria-required="false"')
    expect(input('two')).toContain('aria-required="false"')
    expect(html).toContain('At least 1 value is required.')
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(descriptionId).toBeDefined()
    expect(html).toContain(`id="${descriptionId}"`)
    expect(html.match(/<textarea\b[^>]*>/)?.[0]).toContain('aria-required="false"')
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
