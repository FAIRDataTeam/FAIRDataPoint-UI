import { computed } from 'vue'
import { isOperationOffered } from './apiDocs'

// The operationId is search_1, not search: the generated api-docs uses search for a different
// saved-query endpoint because both backend Java methods are named search().
/**
 * Drives both the header search box and /search route guard from whether this FDP's api-docs
 * advertise full-text search.
 */
export const searchAvailable = computed(() => isOperationOffered('search_1'))
