import { readyBinding, deriveAvailability } from './operationBinding'

// The operationId is search_1, not search: the generated OpenAPI doc uses search for a different
// saved-query endpoint because both backend Java methods are named search().
export const searchBinding = readyBinding('search_1')

/**
 * Drives both the header search box and /search route guard from whether this FDP advertises
 * full-text search in its OpenAPI document.
 */
export const { available: searchAvailable, checked: searchChecked } =
  deriveAvailability(searchBinding)
