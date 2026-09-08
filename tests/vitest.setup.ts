import { vi } from 'vitest'

import { ClientConfig } from '../src/config'

const TEST_FDP_BASE_URL = 'http://localhost'

const testClientConfig: ClientConfig = { apiEndpointUrl: TEST_FDP_BASE_URL }

/**
 * Mock the config module to return a value without loading from a JSON file.
 * This is a global setup, so we do not need to call `loadClientConfig` in individual test files.
 */
vi.mock('@/config', () => {
  return {
    loadClientConfig: vi.fn().mockResolvedValue(undefined),
    getClientConfig: vi.fn().mockReturnValue(testClientConfig),
    configReady: Promise.resolve(),
  }
})
