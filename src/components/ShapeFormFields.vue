<script setup lang="ts">
import { computed, reactive, useId } from 'vue'
import { fieldValidationMessages, type ValidationResult } from '../composables/validationReport'
import { satisfiesLeafMinCount } from '../composables/shapeGraph'
import DateInput from './DateInput.vue'
import type { EditableField } from '../composables/shaclUtils'
import {
  createEmptyEntry,
  isSupportedValueEditor,
  isNestedField,
  isUriField,
  isLiteralField,
  invalidUriMessage,
  requiredFieldMessage,
  type FieldValue,
  type NodeValues,
  type NestedValue,
  type TermValue,
} from '../composables/shapeForm'
import { predicateLabel } from '../composables/shaclFallback'
import { compactUri } from '../composables/rdfUtils'
import IconPlus from '../assets/icons/plus.svg?component'
import IconX from '../assets/icons/x.svg?component'
import { isAbsoluteIri } from '../composables/urlUtils'
import { dateZoneLabel, toDateInputValue, toDateTimeInputValue } from '../composables/formUtils'
import {
  DASH_DATE_PICKER_EDITOR,
  DASH_DATE_TIME_PICKER_EDITOR,
  DASH_TEXT_AREA_EDITOR,
  DASH_TEXT_FIELD_EDITOR,
} from '../composables/vocabularies'

const props = defineProps<{
  fields: EditableField[]
  /** Shared form state, mutated in place by inputs and Add/Remove actions at every nesting level. */
  values: NodeValues
  subjectUri?: string
  validationResults?: ValidationResult[]
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

const fieldErrors = (path: string) =>
  fieldValidationMessages(props.validationResults ?? [], props.subjectUri, path)
const errorId = (path: string) => `${controlId(path, -1)}-errors`
const errorDescription = (path: string) => (fieldErrors(path).length ? errorId(path) : undefined)

/** Blurring any entry marks the whole field as touched. */
const touchedFields = reactive(new Set<string>())
const markTouched = (path: string) => touchedFields.add(path)

/** After blur, show an unmet minimum unless validation already provides a message. */
const showRequiredHint = (row: Row) =>
  row.kind === 'leaf' &&
  touchedFields.has(row.field.path) &&
  !satisfiesLeafMinCount(row.field, row.entries) &&
  !fieldErrors(row.field.path).length

const requiredHintText = (row: Row) => requiredFieldMessage(row.field, fieldLabel(row.field))

const isInvalidUriEntry = (entry: TermValue) => entry.value !== '' && !isAbsoluteIri(entry.value)

/** Show the hint after blur when a URI cannot be saved as a Turtle IRI. */
const showInvalidUriHint = (row: Row) =>
  row.kind === 'leaf' &&
  isUriField(row.field) &&
  touchedFields.has(row.field.path) &&
  row.entries.some(isInvalidUriEntry) &&
  !fieldErrors(row.field.path).length

const invalidUriHintText = (row: Row) => invalidUriMessage(fieldLabel(row.field))

/** New entries start blank; existing entries are compared with their stored value. */
const isChanged = (entry: TermValue) => entry.value !== (entry.originalTerm?.value ?? '')

/** Restore the stored value, or blank for new entries, then show any unmet requirement. */
function restoreEntry(field: EditableField, entry: TermValue) {
  entry.value = entry.originalTerm?.value ?? ''
  markTouched(field.path)
}

/** Connects the control to its requirement, hint, errors and optional date-zone description. */
function describedBy(row: Row, extra?: string, entry?: TermValue): string | undefined {
  return (
    [
      isGroup(row) && isRequired(row.field) ? requirementId(row.field.path) : '',
      showRequiredHint(row) || (showInvalidUriHint(row) && (!entry || isInvalidUriEntry(entry)))
        ? hintId(row.field.path)
        : '',
      extra ?? '',
      errorDescription(row.field.path) ?? '',
    ]
      .filter(Boolean)
      .join(' ') || undefined
  )
}

const fieldLabel = (field: EditableField) => field.label ?? predicateLabel(field.path)

/** Describes whether the shape expects an IRI or a plain literal. */
const placeholderFor = (field: EditableField) =>
  isUriField(field) ? 'Enter IRI' : isLiteralField(field) ? 'Enter a literal' : undefined
const isRequired = (field: EditableField) => (field.minCount ?? 0) > 0
const cardinality = (field: EditableField) => `${field.minCount ?? 0}..${field.maxCount ?? '*'}`

const isTextField = (editor: string) => editor === DASH_TEXT_FIELD_EDITOR
const isTextArea = (editor: string) => editor === DASH_TEXT_AREA_EDITOR
const isDatePicker = (editor: string) => editor === DASH_DATE_PICKER_EDITOR
const isDateTimePicker = (editor: string) => editor === DASH_DATE_TIME_PICKER_EDITOR

const pickerFormatter = (editor: string) =>
  isDatePicker(editor) ? toDateInputValue : isDateTimePicker(editor) ? toDateTimeInputValue : null

/** Use the original value so the input type stays fixed while editing. Blank entries use a picker. */
function usesPicker(editor: string, entry: TermValue): boolean {
  const format = pickerFormatter(editor)
  return format !== null && format(entry.originalTerm?.value ?? '') !== null
}

/** Single-value leaf fields are cleared in place; nested records use Add/Remove. */
const isList = (field: EditableField) => field.maxCount !== 1

function entriesOf(field: EditableField): FieldValue[] {
  const entries = props.values[field.path]
  if (!entries) throw new Error(`Missing form state for ${field.path}`)
  return entries
}

function addEntry(field: EditableField) {
  entriesOf(field).push(createEmptyEntry(field))
}

/** Add is offered for nested or repeatable fields still below sh:maxCount. */
const canAddTo = (row: Row) =>
  (row.kind === 'node' || isSupportedValueEditor(row.field.editor)) &&
  (row.kind === 'node' || isList(row.field)) &&
  (row.field.maxCount === null || row.entries.length < row.field.maxCount)

/** Remove is offered for nested or repeatable fields still above sh:minCount. */
const canRemoveFrom = (row: Row) =>
  (row.kind === 'node' || isList(row.field)) && row.entries.length > (row.field.minCount ?? 0)

function removeEntry(field: EditableField, index: number) {
  entriesOf(field).splice(index, 1)
}

// Stable keys keep touched state with its record when another record is removed.
const nestedEntryKeys = new WeakMap<NestedValue, number>()
let nextNestedEntryKey = 0
function nestedEntryKey(entry: NestedValue): number {
  let key = nestedEntryKeys.get(entry)
  if (key === undefined) {
    key = nextNestedEntryKey++
    nestedEntryKeys.set(entry, key)
  }
  return key
}

const idPrefix = useId()
/** A unique control id per entry; index -1 is reserved for field-level descriptions. */
const controlId = (path: string, index: number) =>
  `${idPrefix}-${encodeURIComponent(path)}-${index}`
const requirementId = (path: string) => `${controlId(path, -1)}-requirement`
const hintId = (path: string) => `${controlId(path, -1)}-hint`
/** Nested, repeatable or multi-entry fields render as a fieldset with a legend. */
const isGroup = (row: Row) => row.kind === 'node' || isList(row.field) || row.entries.length > 1
/** A legend for a fieldset, a label when there is one control to point at, otherwise a div. */
function labelTag(row: Row) {
  if (isGroup(row)) return 'legend'
  return isSupportedValueEditor(row.field.editor) && row.entries.length > 0 ? 'label' : 'div'
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
    :aria-describedby="describedBy(row)"
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
      :id="requirementId(row.field.path)"
      class="user-form__visually-hidden"
    >
      At least {{ row.field.minCount }}
      {{ row.field.minCount === 1 ? 'value is' : 'values are' }} required.
    </span>
    <template v-if="row.kind === 'node'">
      <div
        v-for="(nestedValue, index) in row.entries"
        :key="nestedEntryKey(nestedValue)"
        class="user-form__value user-form__value--top"
      >
        <div class="user-form__nested">
          <ShapeFormFields
            :fields="row.field.nested"
            :values="nestedValue.values"
            :subject-uri="
              nestedValue.originalTerm?.termType === 'NamedNode'
                ? nestedValue.originalTerm.value
                : undefined
            "
            :validation-results="validationResults"
          />
        </div>
        <button
          v-if="canRemoveFrom(row)"
          type="button"
          class="user-form__remove"
          :aria-label="`Remove ${fieldLabel(row.field)}`"
          @click="removeEntry(row.field, index)"
        >
          <IconX />
        </button>
      </div>
    </template>

    <template v-else-if="isSupportedValueEditor(row.field.editor)">
      <component :is="isList(row.field) ? 'ul' : 'div'" class="user-form__values">
        <component
          :is="isList(row.field) ? 'li' : 'div'"
          v-for="(entry, index) in row.entries"
          :key="`${row.field.path}.${index}`"
        >
          <div
            class="user-form__value"
            :class="{
              'user-form__value--changed': isChanged(entry),
              // sh:nodeKind sh:IRI outranks a TextAreaEditor hint (see isUriField); only a
              // field actually rendered as a textarea should keep its buttons top-aligned.
              'user-form__value--top': isTextArea(row.field.editor) && !isUriField(row.field),
            }"
          >
            <label
              v-if="isGroup(row)"
              :for="controlId(row.field.path, index)"
              class="user-form__visually-hidden"
            >
              {{ fieldLabel(row.field) }} {{ index + 1 }}
            </label>
            <input
              v-if="isUriField(row.field)"
              v-model="entry.value"
              @blur="markTouched(row.field.path)"
              type="text"
              :placeholder="placeholderFor(row.field)"
              :id="controlId(row.field.path, index)"
              :aria-required="inputRequired(row)"
              :aria-invalid="
                fieldErrors(row.field.path).length ||
                showRequiredHint(row) ||
                (showInvalidUriHint(row) && isInvalidUriEntry(entry))
                  ? true
                  : undefined
              "
              :aria-describedby="describedBy(row, undefined, entry)"
            />
            <input
              v-else-if="isTextField(row.field.editor)"
              v-model="entry.value"
              @blur="markTouched(row.field.path)"
              type="text"
              :placeholder="placeholderFor(row.field)"
              :id="controlId(row.field.path, index)"
              :aria-required="inputRequired(row)"
              :aria-invalid="
                fieldErrors(row.field.path).length || showRequiredHint(row) ? true : undefined
              "
              :aria-describedby="describedBy(row)"
            />
            <textarea
              v-else-if="isTextArea(row.field.editor)"
              v-model="entry.value"
              @blur="markTouched(row.field.path)"
              rows="3"
              :placeholder="placeholderFor(row.field)"
              :id="controlId(row.field.path, index)"
              :aria-required="inputRequired(row)"
              :aria-invalid="
                fieldErrors(row.field.path).length || showRequiredHint(row) ? true : undefined
              "
              :aria-describedby="describedBy(row)"
            />
            <template
              v-else-if="isDatePicker(row.field.editor) && usesPicker(row.field.editor, entry)"
            >
              <DateInput
                v-model="entry.value"
                @blur="markTouched(row.field.path)"
                type="date"
                :id="controlId(row.field.path, index)"
                :aria-describedby="
                  describedBy(
                    row,
                    dateZoneLabel(entry.value)
                      ? `${controlId(row.field.path, index)}-zone`
                      : undefined,
                  )
                "
                :aria-required="inputRequired(row)"
                :aria-invalid="
                  fieldErrors(row.field.path).length || showRequiredHint(row) ? true : undefined
                "
              />
              <span
                v-if="dateZoneLabel(entry.value)"
                :id="`${controlId(row.field.path, index)}-zone`"
                class="user-form__zone"
                >{{ dateZoneLabel(entry.value) }}</span
              >
            </template>
            <DateInput
              v-else-if="isDateTimePicker(row.field.editor) && usesPicker(row.field.editor, entry)"
              v-model="entry.value"
              @blur="markTouched(row.field.path)"
              type="datetime-local"
              :id="controlId(row.field.path, index)"
              :aria-required="inputRequired(row)"
              :aria-invalid="
                fieldErrors(row.field.path).length || showRequiredHint(row) ? true : undefined
              "
              :aria-describedby="describedBy(row)"
            />
            <!-- A stored date no native picker can show is edited as text rather than shown blank. -->
            <input
              v-else
              v-model="entry.value"
              @blur="markTouched(row.field.path)"
              type="text"
              :id="controlId(row.field.path, index)"
              :aria-required="inputRequired(row)"
              :aria-invalid="
                fieldErrors(row.field.path).length || showRequiredHint(row) ? true : undefined
              "
              :aria-describedby="describedBy(row)"
            />
            <button
              v-if="isChanged(entry)"
              type="button"
              class="text-link user-form__restore"
              @click="restoreEntry(row.field, entry)"
            >
              Restore
            </button>
            <button
              v-if="canRemoveFrom(row)"
              type="button"
              class="user-form__remove"
              :aria-label="`Remove ${fieldLabel(row.field)}`"
              @click="removeEntry(row.field, index)"
            >
              <IconX />
            </button>
          </div>
        </component>
      </component>
    </template>

    <p v-else class="user-form__pending">
      {{ compactUri(row.field.editor) }} is not built yet ({{ cardinality(row.field) }})
    </p>

    <p v-if="showRequiredHint(row)" :id="hintId(row.field.path)" class="user-form__hint">
      {{ requiredHintText(row) }}
    </p>
    <p v-else-if="showInvalidUriHint(row)" :id="hintId(row.field.path)" class="user-form__hint">
      {{ invalidUriHintText(row) }}
    </p>
    <div v-else-if="fieldErrors(row.field.path).length" :id="errorId(row.field.path)">
      <p
        v-for="(message, index) in fieldErrors(row.field.path)"
        :key="index"
        class="user-form__hint"
      >
        {{ message }}
      </p>
    </div>

    <button
      v-if="canAddTo(row)"
      type="button"
      class="text-link user-form__add"
      @click="addEntry(row.field)"
    >
      <IconPlus />
      Add
    </button>
  </component>
</template>
