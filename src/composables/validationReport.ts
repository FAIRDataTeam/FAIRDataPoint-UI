import { DataFactory, type Term } from 'n3'
import { compactUri, parseTurtle } from './rdfUtils'
import {
  RDF_TYPE,
  SHACL_VALIDATION_REPORT,
  SHACL_RESULT,
  SHACL_DETAIL,
  SHACL_FOCUS_NODE,
  SHACL_RESULT_PATH,
  SHACL_RESULT_MESSAGE,
  SHACL_SOURCE_CONSTRAINT_COMPONENT,
} from './vocabularies'

export type ValidationResult = {
  focusNode: Term | undefined
  path: Term | undefined
  messages: string[]
}

/** Reads SHACL results and nested details. Returns [] when no results can be parsed. */
export function parseValidationReport(body: string): ValidationResult[] {
  try {
    const store = parseTurtle(body)
    const { namedNode } = DataFactory
    const objects = (subject: Term, predicate: string) =>
      store.getObjects(subject, namedNode(predicate), null)
    const results: ValidationResult[] = []
    const visited = new Set<string>()
    function visit(result: Term) {
      const key = `${result.termType}:${result.value}`
      if (visited.has(key)) return
      visited.add(key)
      const messages = objects(result, SHACL_RESULT_MESSAGE)
        .filter((term) => term.termType === 'Literal')
        .map((term) => term.value)
      const constraint = objects(result, SHACL_SOURCE_CONSTRAINT_COMPONENT)[0]
      results.push({
        focusNode: objects(result, SHACL_FOCUS_NODE)[0],
        path: objects(result, SHACL_RESULT_PATH)[0],
        messages: messages.length
          ? messages
          : [
              constraint
                ? `Constraint not satisfied: ${compactUri(constraint.value)}`
                : 'Validation failed.',
            ],
      })
      objects(result, SHACL_DETAIL).forEach(visit)
    }
    for (const report of store.getSubjects(
      namedNode(RDF_TYPE),
      namedNode(SHACL_VALIDATION_REPORT),
      null,
    )) {
      objects(report, SHACL_RESULT).forEach(visit)
    }
    return results
  } catch {
    return []
  }
}

/** Matches named subjects and simple property paths; report-local blank-node labels cannot identify form records. */
export function fieldValidationMessages(
  results: ValidationResult[],
  subjectUri: string | undefined,
  path: string,
): string[] {
  return results
    .filter(
      (result) =>
        result.focusNode?.termType === 'NamedNode' &&
        result.focusNode.value === subjectUri &&
        result.path?.termType === 'NamedNode' &&
        result.path.value === path,
    )
    .flatMap((result) => result.messages)
}
