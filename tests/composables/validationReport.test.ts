import { describe, expect, it } from 'vitest'
import {
  fieldValidationMessages,
  parseValidationReport,
} from '../../src/composables/validationReport'

const prefixes = '@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://example.org/> .'

describe('validation reports', () => {
  it('preserves multiple results and messages for the same field', () => {
    const results = parseValidationReport(`${prefixes}
      [] a sh:ValidationReport; sh:result
        [ sh:focusNode ex:resource; sh:resultPath ex:title; sh:resultMessage "First", "Second" ],
        [ sh:focusNode ex:resource; sh:resultPath ex:title; sh:resultMessage "Third" ],
        [ sh:focusNode ex:other; sh:resultPath ex:title; sh:resultMessage "Other record" ].
    `)
    expect(results).toHaveLength(3)
    expect(
      fieldValidationMessages(results, 'http://example.org/resource', 'http://example.org/title'),
    ).toEqual(['First', 'Second', 'Third'])
  })

  it('retains nested details, pathless results and complex paths without guessing a field', () => {
    const results = parseValidationReport(`${prefixes}
      [] a sh:ValidationReport; sh:result ex:result.
      ex:result sh:resultMessage "Record invalid"; sh:detail ex:child, ex:complex.
      ex:child sh:focusNode _:record; sh:resultPath ex:name; sh:resultMessage "Name invalid";
        sh:detail ex:result.
      ex:complex sh:focusNode ex:resource; sh:resultPath (ex:publisher ex:name);
        sh:sourceConstraintComponent sh:MinCountConstraintComponent.
    `)
    expect(results).toHaveLength(3)
    expect(results[1]!.messages).toEqual(['Name invalid'])
    expect(results[2]!.messages[0]).toContain('MinCountConstraintComponent')
    expect(fieldValidationMessages(results, undefined, 'http://example.org/name')).toEqual([])
    expect(
      fieldValidationMessages(results, 'http://example.org/resource', 'http://example.org/name'),
    ).toEqual([])
  })

  it.each(['', '<html>Server error</html>', '<urn:s> <urn:p> "Not a report" .'])(
    'leaves an unrecognised response to the raw fallback: %s',
    (body) => {
      expect(parseValidationReport(body)).toEqual([])
    },
  )

  it('keeps results even when no message or constraint is supplied', () => {
    expect(
      parseValidationReport(`${prefixes} [] a sh:ValidationReport; sh:result [].`)[0]!.messages,
    ).toEqual(['Validation failed.'])
  })
})
