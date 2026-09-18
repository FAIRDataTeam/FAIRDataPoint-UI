import type { Store, Term } from 'n3'
import { computed, markRaw, ref, watch, type Ref } from 'vue'
import { getObjectTerms } from './rdfUtils'
import { DASH_BLANK_NODE_EDITOR } from './vocabularies'
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

/**
 * Renders a nested record only for BlankNodeEditor with resolved nested fields.
 * sh:node alone can also constrain a URIEditor's target.
 */
export function isNestedField(field: EditableField): boolean {
  return field.editor === DASH_BLANK_NODE_EDITOR && field.nested.length > 0
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

/** Blank state mirroring the field structure, for a record that has no values yet. */
export function emptyValues(fields: EditableField[]): NodeValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.path,
      isNestedField(field)
        ? blankEntries(entryCount(field, 0), () => ({ values: emptyValues(field.nested) }))
        : blankEntries(entryCount(field, 0), () => ({ value: '' })),
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
        return [
          field.path,
          [...nested, ...blankEntries(missing, () => ({ values: emptyValues(field.nested) }))],
        ]
      }

      const values = terms.map(toTermValue)
      return [field.path, [...values, ...blankEntries(missing, () => ({ value: '' }))]]
    }),
  )
}
