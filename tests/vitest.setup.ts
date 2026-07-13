import { vi } from 'vitest'

import { RuntimeConfig } from '../src/config'

const TEST_FDP_BASE_URL = 'http://localhost'

const testRuntimeConfig: RuntimeConfig = { fdpBaseUrl: TEST_FDP_BASE_URL }

/**
 * Mock the config module to return a value without loading from a JSON file.
 * This is a global setup, so we do not need to call `loadRuntimeConfig` in individual test files.
 */
vi.mock(
  '@/config',
  () => {
    return {
      loadRuntimeConfig: vi.fn().mockResolvedValue(undefined),
      getRuntimeConfig: vi.fn().mockReturnValue(testRuntimeConfig),
    }
  }
)
