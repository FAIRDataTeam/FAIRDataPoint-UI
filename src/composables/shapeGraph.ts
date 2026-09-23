import { DataFactory, Store } from 'n3'
import type { BlankNode, Literal, NamedNode, Term } from 'n3'
import type { EditableField } from './shaclUtils'
import {
  isSupportedValueEditor,
  isNestedField,
  invalidUriMessage,
  requiredFieldMessage,
  type NestedValue,
  type NodeValues,
  type TermValue,
} from './shapeForm'
import { DASH_URI_EDITOR } from './vocabularies'
import { predicateLabel } from './shaclFallback'
import { isAbsoluteIri } from './urlUtils'
import type { ValidationResult } from './validationReport'

const { namedNode, literal, blankNode, quad } = DataFactory

/** A record's own subject: never a literal, so it can hold further triples about itself. */
type RecordSubject = NamedNode | BlankNode
type RemovedRecord = { subject: RecordSubject; fields: EditableField[] }

const keepsLeafEntry = (entry: TermValue) => entry.value !== '' || entry.originalTerm?.value === ''

/** Preserve existing records; a new record needs at least one value the editor can write. */
function keepsNestedEntry(entry: NestedValue, fields: EditableField[]): boolean {
  if (entry.originalTerm) return true
  return fields.some((field) => {
    const entries = entry.values[field.path] ?? []
    return isNestedField(field)
      ? (entries as NestedValue[]).some((child) => keepsNestedEntry(child, field.nested))
      : isSupportedValueEditor(field.editor) && (entries as TermValue[]).some(keepsLeafEntry)
  })
}

/** Checks sh:minCount using the distinct RDF terms that saving would keep. */
export function satisfiesLeafMinCount(field: EditableField, entries: TermValue[]): boolean {
  const terms: (NamedNode | Literal)[] = []
  for (const entry of entries) {
    if (!keepsLeafEntry(entry)) continue
    const term = termFor(entry, field)
    if (!terms.some((stored) => stored.equals(term))) terms.push(term)
  }
  return terms.length >= (field.minCount ?? 0)
}

/** Carries local validation failures in the same format as parsed server results. */
export class RequiredFieldsError extends Error {
  constructor(readonly results: ValidationResult[]) {
    super(results[0]!.messages[0])
    this.name = 'RequiredFieldsError'
  }
}

/**
 * Applies supported form edits to a copy of the graph, preserving literal language and datatype.
 * Throws if supported fields lack required values.
 */
export function buildResourceGraph(
  store: Store,
  subjectUri: string,
  fields: EditableField[],
  values: NodeValues,
): Store {
  const graph = new Store(store.getQuads(null, null, null, null))
  const subject = namedNode(subjectUri)
  const removed: RemovedRecord[] = []
  replaceFields(graph, subject, fields, values, removed)
  removeUnreferencedRecords(graph, subject, removed)
  const results: ValidationResult[] = []
  checkFieldConstraints(graph, subject, fields, results)
  if (results.length) throw new RequiredFieldsError(results)
  return graph
}

/**
 * Checks required-count and absolute-IRI constraints in the outgoing RDF graph, where omitted
 * blanks and duplicate values are already resolved.
 */
function checkFieldConstraints(
  store: Store,
  subject: RecordSubject,
  fields: EditableField[],
  results: ValidationResult[],
  parentLabel = '',
) {
  for (const field of fields) {
    const nested = isNestedField(field)
    if (!nested && !isSupportedValueEditor(field.editor)) continue
    const label = parentLabel + (field.label ?? predicateLabel(field.path))
    const terms = store.getObjects(subject, namedNode(field.path), null)
    const minimum = field.minCount ?? 0
    if (terms.length < minimum) {
      results.push({
        focusNode: subject.termType === 'NamedNode' ? subject : undefined,
        path: namedNode(field.path),
        messages: [requiredFieldMessage(field, label)],
      })
    }
    // A namedNode built from non-absolute text (see termFor) would otherwise be silently
    // resolved into an unrelated absolute URI by the server's Turtle parser on save.
    if (field.editor === DASH_URI_EDITOR && terms.some((term) => !isAbsoluteIri(term.value))) {
      results.push({
        focusNode: subject.termType === 'NamedNode' ? subject : undefined,
        path: namedNode(field.path),
        messages: [invalidUriMessage(label)],
      })
    }
    if (nested) {
      for (const term of terms) {
        const child = asRecordSubject(term)
        if (child) checkFieldConstraints(store, child, field.nested, results, `${label}: `)
      }
    }
  }
}

/** Replaces each field's stored terms with its current form entries, recursing into sh:node records. */
function replaceFields(
  store: Store,
  subject: RecordSubject,
  fields: EditableField[],
  values: NodeValues,
  removed: RemovedRecord[],
) {
  for (const field of fields) {
    const nested = isNestedField(field)
    // Preserve fields whose editors are not implemented.
    if (!nested && !isSupportedValueEditor(field.editor)) continue

    const path = namedNode(field.path)
    const previous = store.getObjects(subject, path, null)
    store.removeQuads(store.getQuads(subject, path, null, null))
    const entries = values[field.path] ?? []

    if (nested) {
      // Compare RDF term type and value, not JavaScript object identity.
      const kept = new Set<string>()
      for (const entry of entries as NestedValue[]) {
        if (!keepsNestedEntry(entry, field.nested)) continue
        const term = asRecordSubject(entry.originalTerm) ?? blankNode()
        kept.add(termKey(term))
        store.addQuad(quad(subject, path, term))
        replaceFields(store, term, field.nested, entry.values, removed)
      }
      // Defer cleanup until every field's final references have been written.
      for (const term of previous) {
        const stale = !kept.has(termKey(term)) && asRecordSubject(term)
        if (stale) removed.push({ subject: stale, fields: field.nested })
      }
    } else {
      for (const entry of entries as TermValue[]) {
        // Omit blank inputs, but preserve originally empty literals.
        if (keepsLeafEntry(entry)) {
          store.addQuad(quad(subject, path, termFor(entry, field)))
        }
      }
    }
  }
}

/** Deletes dropped records and their nested content only when the remaining graph no longer uses them. */
function removeUnreferencedRecords(store: Store, root: RecordSubject, removed: RemovedRecord[]) {
  const candidates = new Map<string, RecordSubject>()
  function collect(subject: RecordSubject, fields: EditableField[]) {
    candidates.set(termKey(subject), subject)
    for (const field of fields) {
      if (!isNestedField(field)) continue
      for (const term of store.getObjects(subject, namedNode(field.path), null)) {
        const child = asRecordSubject(term)
        if (child) collect(child, field.nested)
      }
    }
  }
  for (const record of removed) collect(record.subject, record.fields)

  // Keep records referenced from outside the removal set, and everything they still reference.
  const pending = [...candidates.values()].filter(
    (subject) =>
      subject.equals(root) ||
      store.getSubjects(null, subject, null).some((source) => !candidates.has(termKey(source))),
  )
  const retained = new Set<string>()
  while (pending.length) {
    const subject = pending.pop()!
    const key = termKey(subject)
    if (retained.has(key)) continue
    retained.add(key)
    for (const term of store.getObjects(subject, null, null)) {
      const child = candidates.get(termKey(term))
      if (child) pending.push(child)
    }
  }
  for (const [key, subject] of candidates) {
    if (!retained.has(key)) store.removeQuads(store.getQuads(subject, null, null, null))
  }
}

/** sh:node targets are never literals in valid data; falls back rather than assume so. */
function asRecordSubject(term: Term | undefined): RecordSubject | undefined {
  return term?.termType === 'NamedNode' || term?.termType === 'BlankNode' ? term : undefined
}

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`
}

/** An IRI for dash:URIEditor; otherwise a literal keeping the original's language or datatype. */
function termFor(entry: TermValue, field: EditableField): NamedNode | Literal {
  if (field.editor === DASH_URI_EDITOR) return namedNode(entry.value)
  const original = entry.originalTerm
  const kind = original?.termType === 'Literal' ? original.language || original.datatype : null
  return literal(entry.value, kind ?? (field.datatype ? namedNode(field.datatype) : undefined))
}
