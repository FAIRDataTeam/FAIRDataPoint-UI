import { describe, expect, it } from 'vitest'
import { predicateLabel } from '../../src/composables/shaclFallback'
import {
  FOAF_HOMEPAGE,
  FOAF_HOME_PAGE,
  DCT_FORMAT,
  DCAT_FORMAT,
} from '../../src/composables/vocabularies'

describe('predicateLabel', () => {
  it('labels both the FOAF property and the casing used by FDP shapes', () => {
    expect(FOAF_HOMEPAGE).toBe('http://xmlns.com/foaf/0.1/homepage')
    expect(FOAF_HOME_PAGE).toBe('http://xmlns.com/foaf/0.1/homePage')
    expect(predicateLabel(FOAF_HOMEPAGE)).toBe('Homepage')
    expect(predicateLabel(FOAF_HOME_PAGE)).toBe('Homepage')
  })

  it('labels dcat:format like dct:format, the predicate FDP distribution shapes actually use', () => {
    expect(predicateLabel(DCT_FORMAT)).toBe('Format')
    expect(predicateLabel(DCAT_FORMAT)).toBe('Format')
  })

  it('falls back to a compact URI for an unmapped predicate', () => {
    expect(predicateLabel('http://www.w3.org/ns/dcat#unmapped')).toBe('dcat:unmapped')
  })
})
