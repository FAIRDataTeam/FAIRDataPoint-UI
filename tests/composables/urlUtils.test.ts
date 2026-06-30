import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { isInternalUri, internalHref } from '../../src/composables/urlUtils'

describe('isInternalUri', () => {
  beforeAll(() => vi.stubEnv('VITE_FDP_BASE_URL', 'http://localhost'))
  afterAll(() => vi.unstubAllEnvs())

  it('returns true for the base URL', () => {
    expect(isInternalUri('http://localhost')).toBe(true)
  })

  it('returns true for the base URL with a trailing slash', () => {
    expect(isInternalUri('http://localhost/')).toBe(true)
  })

  it('returns true for a resource URL under the base', () => {
    expect(isInternalUri('http://localhost/catalog/some-id')).toBe(true)
  })

  it('returns false for an external URL', () => {
    expect(isInternalUri('https://external.example.org/resource')).toBe(false)
  })

  it('returns false for a URL with a different port', () => {
    expect(isInternalUri('http://localhost:8080/catalog/some-id')).toBe(false)
  })

  it('returns false for an invalid URI', () => {
    expect(isInternalUri('not-a-url')).toBe(false)
  })
})

describe('internalHref', () => {
  beforeAll(() => vi.stubEnv('VITE_FDP_BASE_URL', 'http://localhost'))
  afterAll(() => vi.unstubAllEnvs())

  it('returns / for the base URL', () => {
    expect(internalHref('http://localhost')).toBe('/')
  })

  it('returns / for the base URL with a trailing slash', () => {
    expect(internalHref('http://localhost/')).toBe('/')
  })

  it('returns the two-segment path for a resource URL', () => {
    expect(internalHref('http://localhost/catalog/some-id')).toBe('/catalog/some-id')
  })

  it('returns / for a one-segment URL under the base', () => {
    expect(internalHref('http://localhost/catalog')).toBe('/')
  })

  it('returns the URI unchanged for an external URL', () => {
    expect(internalHref('https://external.example.org/resource')).toBe(
      'https://external.example.org/resource',
    )
  })
})
