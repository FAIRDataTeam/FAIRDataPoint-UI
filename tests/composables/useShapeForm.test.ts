import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref, shallowRef, type EffectScope } from 'vue'
import { parseTurtle } from '../../src/composables/rdfUtils'
import { getEditableFields, getShapePropertyMap } from '../../src/composables/shaclUtils'
import { useShapeForm, type TermValue } from '../../src/composables/shapeForm'

const SUBJECT = 'urn:resource'
const TITLE = 'urn:title'
const OTHER = 'urn:other'
const store = parseTurtle(`<${SUBJECT}> a <urn:Resource>; <${TITLE}> "Original title" .`)
const shapes = parseTurtle(`
  @prefix sh: <http://www.w3.org/ns/shacl#> .
  @prefix dash: <http://datashapes.org/dash#> .
  <urn:Shape> a sh:NodeShape; sh:targetClass <urn:Resource>;
    sh:property [ sh:path <${TITLE}>; sh:maxCount 1; dash:editor dash:TextFieldEditor ],
      [ sh:path <${OTHER}>; sh:maxCount 0; dash:editor dash:TextFieldEditor ] .
`)
const freshFields = () => getEditableFields(getShapePropertyMap(store, SUBJECT, [shapes]))
let scope: EffectScope

beforeEach(() => {
  scope = effectScope()
})
afterEach(() => scope.stop())

function setup() {
  const fields = ref(freshFields())
  const subjectUri = ref<string | null>(SUBJECT)
  const values = scope.run(() => useShapeForm(shallowRef(store), subjectUri, fields))!
  return { fields, subjectUri, values }
}

describe('useShapeForm', () => {
  it('preserves typed values through equivalent fields and presentation changes', async () => {
    const { fields, values } = setup()
    const initial = values.value
    const title = initial[TITLE]![0] as TermValue
    title.value = 'Typed title'

    fields.value = freshFields()
    await nextTick()
    expect(values.value).toBe(initial)
    expect(values.value[TITLE]).toMatchObject([{ value: 'Typed title' }])

    fields.value = freshFields()
      .reverse()
      .map((field) => ({ ...field, label: 'New label' }))
    await nextTick()
    expect(values.value).toBe(initial)
    expect(values.value[TITLE]).toMatchObject([{ value: 'Typed title' }])
  })

  it('initializes a newly allowed singleton and applies a changed minimum', async () => {
    const { fields, values } = setup()
    expect(values.value[OTHER]).toEqual([])
    fields.value = freshFields().map((field) =>
      field.path === OTHER ? { ...field, maxCount: 1 } : field,
    )
    await nextTick()
    expect(values.value[OTHER]).toEqual([{ value: '' }])

    fields.value = freshFields().map((field) =>
      field.path === OTHER ? { ...field, minCount: 3, maxCount: null } : field,
    )
    await nextTick()
    expect(values.value[OTHER]).toEqual([{ value: '' }, { value: '' }, { value: '' }])
  })

  it('does not re-seed when only the store changes', async () => {
    const storeRef = shallowRef(store)
    const values = scope.run(() => useShapeForm(storeRef, ref(SUBJECT), ref(freshFields())))!
    const initial = values.value
    ;(initial[TITLE]![0] as TermValue).value = 'Typed title'

    // A different title, so a re-seed would show up as the new store's value.
    storeRef.value = parseTurtle(`<${SUBJECT}> a <urn:Resource>; <${TITLE}> "Reloaded title" .`)
    await nextTick()

    expect(values.value).toBe(initial)
    expect(values.value[TITLE]).toMatchObject([{ value: 'Typed title' }])
  })

  it('seeds a different record even when the fields are unchanged', async () => {
    const { subjectUri, values } = setup()
    const title = values.value[TITLE]![0] as TermValue
    title.value = 'Typed title'
    subjectUri.value = 'urn:another-resource'
    await nextTick()
    expect(values.value[TITLE]).toEqual([{ value: '' }])

    subjectUri.value = null
    await nextTick()
    expect(values.value).toEqual({})
  })
})
