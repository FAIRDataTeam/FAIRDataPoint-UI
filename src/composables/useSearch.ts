import { ref } from 'vue'
import { bindOperation, type OperationBinding } from './apiDocs'
import { getRootUri } from './urlUtils'
import { configReady } from '@/config'

/**
 * Resolved once, reused by App.vue (gates the box's visibility) and SearchView.vue (the actual
 * request). Awaits configReady since this evaluates before config loads (see config.ts); can
 * reject if search_1 isn't offered (see apiDocs.ts's bindOperation), already handled by
 * SearchView.vue's search().
 *
 * The operationId is 'search_1', not the more obvious 'search': the backend has two different
 * operations whose Java method is literally named search(), and 'search' itself was claimed by
 * the other one (a saved-query endpoint), confirmed against the live generated api-docs.
 */
export const searchBinding: Promise<OperationBinding> = (async () => {
  await configReady
  return bindOperation(getRootUri(), 'search_1')
})()

/** Controls whether the search box is shown, based on whether this FDP's OpenAPI doc actually offers full-text search. */
export const searchAvailable = ref(false)
searchBinding
  .then(() => {
    searchAvailable.value = true
  })
  .catch(() => {
    searchAvailable.value = false
  })
