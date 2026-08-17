import { ref } from 'vue'
import { bindOperation } from './apiDocs'
import { getRootUri } from './urlUtils'
import { configReady } from '@/config'

/**
 * True if this FDP's OpenAPI doc offers operationId. No pathParams passed: bindOperation only
 * substitutes them if given, so a {placeholder} is left as-is, harmless here since only whether
 * it resolved matters. Awaits configReady since this evaluates before config loads (see
 * config.ts).
 */
function availabilityRef(operationId: string) {
  const available = ref(false)
  ;(async () => {
    await configReady
    return bindOperation(getRootUri(), operationId)
  })()
    .then(() => {
      available.value = true
    })
    .catch(() => {
      available.value = false
    })
  return available
}

/** Controls whether the "Users" menu link is shown, based on whether this FDP's OpenAPI doc actually offers listing users. */
export const getUsersAvailable = availabilityRef('getUsers')
/** Controls whether "create user" affordances (the list's link, the form's submit button) are shown, based on whether this FDP's OpenAPI doc actually offers creating a user. */
export const createUserAvailable = availabilityRef('createUser')
/** Controls whether the per-user delete button is shown, based on whether this FDP's OpenAPI doc actually offers deleting a user. */
export const deleteUserAvailable = availabilityRef('deleteUser')
