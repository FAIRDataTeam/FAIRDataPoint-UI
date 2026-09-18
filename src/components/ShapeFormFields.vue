<script setup lang="ts">
import { computed, useId } from 'vue'
import type { EditableField } from '../composables/shaclUtils'
import {
  emptyValues,
  isNestedField,
  type FieldValue,
  type NodeValues,
  type NestedValue,
  type TermValue,
} from '../composables/shapeForm'
import { predicateLabel } from '../composables/shaclFallback'
import { compactUri } from '../composables/rdfUtils'
import {
  DASH_TEXT_AREA_EDITOR,
  DASH_TEXT_FIELD_EDITOR,
  DASH_URI_EDITOR,
} from '../composables/vocabularies'

const props = defineProps<{
  fields: EditableField[]
  /** Shared form state, mutated in place by inputs and Add/Remove actions at every nesting level. */
  values: NodeValues
}>()

type Row =
  | { field: EditableField; kind: 'leaf'; entries: TermValue[] }
  | { field: EditableField; kind: 'node'; entries: NestedValue[] }

const rows = computed<Row[]>(() =>
  props.fields.map((field) => {
    const entries = props.values[field.path] ?? []
    // Seeding uses the same isNestedField check, so the value types match.
    return isNestedField(field)
      ? { field, kind: 'node', entries: entries as NestedValue[] }
      : { field, kind: 'leaf', entries: entries as TermValue[] }
  }),
)

const fieldLabel = (field: EditableField) => field.label ?? predicateLabel(field.path)
const isRequired = (field: EditableField) => (field.minCount ?? 0) > 0
const cardinality = (field: EditableField) => `${field.minCount ?? 0}..${field.maxCount ?? '*'}`

const isTextField = (editor: string) => editor === DASH_TEXT_FIELD_EDITOR
const isTextArea = (editor: string) => editor === DASH_TEXT_AREA_EDITOR
const isUri = (editor: string) => editor === DASH_URI_EDITOR
const isBuilt = (editor: string) => isTextField(editor) || isTextArea(editor) || isUri(editor)

/** Single-value fields are cleared in place; repeatable fields use Add/Remove. */
const isList = (field: EditableField) => field.maxCount !== 1

function entriesOf(field: EditableField): FieldValue[] {
  const entries = props.values[field.path]
  if (!entries) throw new Error(`Missing form state for ${field.path}`)
  return entries
}

function addEntry(field: EditableField) {
  entriesOf(field).push(
    isNestedField(field) ? { values: emptyValues(field.nested) } : { value: '' },
  )
}

/** Add is offered for renderable repeatable fields still below sh:maxCount. */
const canAddTo = (row: Row) =>
  (row.kind === 'node' || isBuilt(row.field.editor)) &&
  isList(row.field) &&
  (row.field.maxCount === null || row.entries.length < row.field.maxCount)

/** Remove is offered for repeatable fields still above sh:minCount. */
const canRemoveFrom = (row: Row) =>
  isList(row.field) && row.entries.length > (row.field.minCount ?? 0)

function removeEntry(field: EditableField, index: number) {
  entriesOf(field).splice(index, 1)
}
const idPrefix = useId()
/** A unique control id per entry; index -1 names the field's requirement description. */
const controlId = (path: string, index: number) =>
  `${idPrefix}-${encodeURIComponent(path)}-${index}`
/** Nested, repeatable or multi-entry fields render as a fieldset with a legend. */
const isGroup = (row: Row) => row.kind === 'node' || isList(row.field) || row.entries.length > 1
/** A legend for a fieldset, a label when there is one control to point at, otherwise a div. */
function labelTag(row: Row) {
  if (isGroup(row)) return 'legend'
  return isBuilt(row.field.editor) && row.entries.length > 0 ? 'label' : 'div'
}

/** When more entries than the minimum are present, the group describes the requirement instead. */
const inputRequired = (row: Row) =>
  isRequired(row.field) && row.entries.length <= (row.field.minCount ?? 0)
</script>

<template>
  <component
    :is="isGroup(row) ? 'fieldset' : 'div'"
    v-for="row in rows"
    :key="row.field.path"
    class="user-form__group"
    :aria-describedby="
      isGroup(row) && isRequired(row.field) ? controlId(row.field.path, -1) : undefined
    "
  >
    <component
      :is="labelTag(row)"
      :for="labelTag(row) === 'label' ? controlId(row.field.path, 0) : undefined"
      class="user-form__label"
    >
      {{ fieldLabel(row.field)
      }}<span v-if="isRequired(row.field)" class="user-form__required" aria-hidden="true">*</span>
    </component>
    <span
      v-if="isGroup(row) && isRequired(row.field)"
      :id="controlId(row.field.path, -1)"
      class="user-form__visually-hidden"
    >
      At least {{ row.field.minCount }}
      {{ row.field.minCount === 1 ? 'value is' : 'values are' }} required.
    </span>

    <template v-if="row.kind === 'node'">
      <div
        v-for="(nestedValue, index) in row.entries"
        :key="`${row.field.path}.${index}`"
        class="user-form__value"
      >
        <div class="user-form__nested">
          <ShapeFormFields :fields="row.field.nested" :values="nestedValue.values" />
        </div>
        <button
          v-if="canRemoveFrom(row)"
          type="button"
          class="user-form__remove"
          :aria-label="`Remove ${fieldLabel(row.field)}`"
          @click="removeEntry(row.field, index)"
        >
          &times;
        </button>
      </div>
    </template>

    <template v-else-if="isBuilt(row.field.editor)">
      <div
        v-for="(entry, index) in row.entries"
        :key="`${row.field.path}.${index}`"
        class="user-form__value"
      >
        <label
          v-if="isGroup(row)"
          :for="controlId(row.field.path, index)"
          class="user-form__visually-hidden"
        >
          {{ fieldLabel(row.field) }} {{ index + 1 }}
        </label>
        <input
          v-if="isTextField(row.field.editor)"
          v-model="entry.value"
          type="text"
          :id="controlId(row.field.path, index)"
          :aria-required="inputRequired(row)"
        />
        <textarea
          v-else-if="isTextArea(row.field.editor)"
          v-model="entry.value"
          rows="3"
          :id="controlId(row.field.path, index)"
          :aria-required="inputRequired(row)"
        />
        <input
          v-else-if="isUri(row.field.editor)"
          v-model="entry.value"
          type="text"
          placeholder="Enter IRI"
          :id="controlId(row.field.path, index)"
          :aria-required="inputRequired(row)"
        />
        <button
          v-if="canRemoveFrom(row)"
          type="button"
          class="user-form__remove"
          :aria-label="`Remove ${fieldLabel(row.field)}`"
          @click="removeEntry(row.field, index)"
        >
          &times;
        </button>
      </div>
    </template>

    <p v-else class="user-form__pending">
      {{ compactUri(row.field.editor) }} is not built yet ({{ cardinality(row.field) }})
    </p>

    <button
      v-if="canAddTo(row)"
      type="button"
      class="text-link user-form__add"
      @click="addEntry(row.field)"
    >
      + Add
    </button>
  </component>
</template>
