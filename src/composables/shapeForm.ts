import type { Store, Term } from 'n3'
import { computed, markRaw, ref, watch, type Ref } from 'vue'
import { getObjectTerms } from './rdfUtils'
import {
  DASH_BLANK_NODE_EDITOR,
  DASH_DATE_PICKER_EDITOR,
  DASH_DATE_TIME_PICKER_EDITOR,
  DASH_TEXT_AREA_EDITOR,
  DASH_TEXT_FIELD_EDITOR,
  DASH_URI_EDITOR,
  SHACL_IRI,
  SHACL_LITERAL,
} from './vocabularies'
import { predicateLabel } from './shaclFallback'
import type { EditableField } from './shaclUtils'

/** Editable text plus the original RDF term, retained unchanged for later persistence. */
export type TermValue = {
  value: string
  originalTerm?: Term
}

/** Form state keyed by property path, with an array of term or nested-record entries per field. */
export type NodeValues = { [path: string]: FieldValue[] }
export type NestedValue = {
  originalTerm?: Term
  values: NodeValues
}
export type FieldValue = TermValue | NestedValue

export function requiredFieldMessage(
  field: Pick<EditableField, 'minCount' | 'maxCount'>,
  label: string,
): string {
  const minimum = field.minCount ?? 0
  return field.maxCount === 1
    ? `${label} is required.`
    : `${label} requires at least ${minimum} ${minimum === 1 ? 'value' : 'values'}.`
}

export function invalidUriMessage(label: string): string {
  return `${label} must be a valid absolute IRI.`
}

/**
 * Renders a nested record only for BlankNodeEditor with resolved nested fields.
 * sh:node alone can also constrain a URIEditor's target.
 */
export function isNestedField(field: EditableField): boolean {
  return field.editor === DASH_BLANK_NODE_EDITOR && field.nested.length > 0
}

const SUPPORTED_VALUE_EDITORS = new Set([
  DASH_TEXT_FIELD_EDITOR,
  DASH_TEXT_AREA_EDITOR,
  DASH_URI_EDITOR,
  DASH_DATE_PICKER_EDITOR,
  DASH_DATE_TIME_PICKER_EDITOR,
])

/** Identifies value editors supported for both rendering and saving. */
export function isSupportedValueEditor(editor: string): boolean {
  return SUPPORTED_VALUE_EDITORS.has(editor)
}

/**
 * Treats URIEditor and sh:IRI fields as IRI inputs that save as named nodes,
 * even when sh:IRI is paired with a text editor hint.
 */
export function isUriField(field: Pick<EditableField, 'editor' | 'nodeKind'>): boolean {
  return field.editor === DASH_URI_EDITOR || field.nodeKind === SHACL_IRI
}

/** A blank hint for a field the shape explicitly types as a plain RDF literal. */
export function isLiteralField(field: Pick<EditableField, 'nodeKind'>): boolean {
  return field.nodeKind === SHACL_LITERAL
}

/** Uppercases the first letter without changing intentional capitalization in the rest. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Uses the shape name when present, capitalized consistently with predicate-derived labels. */
export function fieldLabel(field: Pick<EditableField, 'label' | 'path'>): string {
  return field.label !== null ? capitalize(field.label) : predicateLabel(field.path)
}

/**
 * Identifies the paths, cardinality, and nesting that determine initial form state.
 * Presentation changes and fresh field arrays must not reset the user's edits.
 */
export function fieldsSignature(fields: EditableField[]): string {
  return JSON.stringify(
    [...fields]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((field) => [
        field.path,
        field.minCount ?? 0,
        field.maxCount,
        isNestedField(field) ? fieldsSignature(field.nested) : null,
      ]),
  )
}

/** Re-seeds on record or structural changes, preserving edits through presentation changes. */
export function useShapeForm(
  store: Ref<Store>,
  subjectUri: Ref<string | null>,
  fields: Ref<EditableField[]>,
) {
  const values = ref<NodeValues>({})
  // The store is read but not watched, so a store change alone does not re-seed. A full reload
  // still resets: loadResource empties the store first, so the subject briefly resolves to null.
  watch(
    [subjectUri, computed(() => fieldsSignature(fields.value))],
    ([uri]) => {
      values.value = uri ? seedValues(store.value, uri, fields.value) : {}
    },
    { immediate: true },
  )
  return values
}

/** Keeps the original term identity separate from the editable lexical value. */
function toTermValue(term: Term): TermValue {
  return { value: term.value, originalTerm: markRaw(term) }
}

/**
 * Preserves every existing entry. Adds blanks up to at least one or sh:minCount,
 * capped by sh:maxCount.
 */
function entryCount(field: EditableField, present: number): number {
  const maxCount = field.maxCount ?? Number.POSITIVE_INFINITY
  return Math.max(present, Math.min(Math.max(field.minCount ?? 0, 1), maxCount))
}

/** A fresh blank entry per slot, so no two entries share one object. */
function blankEntries<T>(count: number, blank: () => T): T[] {
  return Array.from({ length: Math.max(0, count) }, blank)
}

/** Creates a fresh value or nested record for initialization and Add. */
export function createEmptyEntry(field: EditableField): FieldValue {
  return isNestedField(field) ? { values: emptyValues(field.nested) } : { value: '' }
}

/** Blank state mirroring the field structure, for a record that has no values yet. */
export function emptyValues(fields: EditableField[]): NodeValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.path,
      blankEntries(entryCount(field, 0), () => createEmptyEntry(field)),
    ]),
  )
}

/**
 * Seeds form state from all matching RDF terms, preserving their original values
 * and adding blank entries according to cardinality. Recurses into nested records.
 */
export function seedValues(
  store: Store,
  subject: Term | string,
  fields: EditableField[],
): NodeValues {
  return Object.fromEntries(
    fields.map((field) => {
      const terms = getObjectTerms(store, subject, field.path)
      const missing = entryCount(field, terms.length) - terms.length

      if (isNestedField(field)) {
        const nested = terms.map((term) => ({
          originalTerm: markRaw(term),
          values: seedValues(store, term, field.nested),
        }))
        return [field.path, [...nested, ...blankEntries(missing, () => createEmptyEntry(field))]]
      }

      const values = terms.map(toTermValue)
      return [field.path, [...values, ...blankEntries(missing, () => createEmptyEntry(field))]]
    }),
  )
}
