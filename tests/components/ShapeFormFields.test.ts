import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ShapeFormFields from '../../src/components/ShapeFormFields.vue'
import { parseTurtle } from '../../src/composables/rdfUtils'
import { getEditableFields, getShapePropertyMap } from '../../src/composables/shaclUtils'
import { seedValues } from '../../src/composables/shapeForm'

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
