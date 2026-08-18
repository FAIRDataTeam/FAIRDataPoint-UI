import { readyBinding, deriveAvailability } from './operationBinding'

/**
 * Resolved once, reused by App.vue (gates the box's visibility) and SearchView.vue (the actual
 * request).
 *
 * The operationId is 'search_1', not the more obvious 'search': the backend has two different
 * operations whose Java method is literally named search(), and 'search' itself was claimed by
 * the other one (a saved-query endpoint), confirmed against the live generated api-docs.
 */
export const searchBinding = readyBinding('search_1')

/**
 * searchAvailable controls whether the search box is shown, based on whether this FDP's OpenAPI
 * doc actually offers full-text search. searchChecked resolves once that's known; the router
 * guard awaits it before allowing /search.
 */
export const { available: searchAvailable, checked: searchChecked } =
  deriveAvailability(searchBinding)
