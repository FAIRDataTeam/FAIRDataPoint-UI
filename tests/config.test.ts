import { describe, it, expect, vi, beforeEach } from 'vitest'

// tests/vitest.setup.ts mocks '@/config' globally for every other test file; undo that here so
// we can test the real implementation.
vi.unmock('@/config')

describe('loadClientConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('loads a valid apiEndpointUrl', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiEndpointUrl: 'http://localhost' }),
      }),
    )
    const { loadClientConfig, getClientConfig } = await import('../src/config')

    await loadClientConfig()

    expect(getClientConfig()).toEqual({ apiEndpointUrl: 'http://localhost' })
  })

  it('throws when the config file fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { loadClientConfig } = await import('../src/config')

    await expect(loadClientConfig()).rejects.toThrow('Failed to load runtime configuration')
  })

  it('throws when apiEndpointUrl is missing from the config file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    const { loadClientConfig } = await import('../src/config')

    await expect(loadClientConfig()).rejects.toThrow('missing a valid "apiEndpointUrl"')
  })

  it('throws when apiEndpointUrl is an empty string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ apiEndpointUrl: '' }) }),
    )
    const { loadClientConfig } = await import('../src/config')

    await expect(loadClientConfig()).rejects.toThrow('missing a valid "apiEndpointUrl"')
  })

  it('getClientConfig throws before loadClientConfig has been called', async () => {
    const { getClientConfig } = await import('../src/config')

    expect(() => getClientConfig()).toThrow('Runtime configuration not loaded')
  })
})

describe('configReady', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('resolves once loadClientConfig succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiEndpointUrl: 'http://localhost' }),
      }),
    )
    const { loadClientConfig, configReady } = await import('../src/config')

    await loadClientConfig()

    await expect(configReady).resolves.toBeUndefined()
  })

  it('stays pending until loadClientConfig has actually resolved', async () => {
    const { configReady } = await import('../src/config')
    const stillPending = Symbol('pending')

    const result = await Promise.race([
      configReady.then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve(stillPending), 10)),
    ])

    expect(result).toBe(stillPending)
  })
})
