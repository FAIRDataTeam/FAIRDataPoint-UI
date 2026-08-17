import { ref, type Ref } from 'vue'
import { bindOperation } from './apiDocs'
import { getRootUri } from './urlUtils'
import { configReady } from '@/config'

/**
 * True if this FDP's OpenAPI doc offers operationId, in a ref for template gating, plus a
 * promise a caller can await to know the check has actually completed (the router guard can't
 * just read the ref synchronously, it may not have settled yet). No pathParams passed:
 * bindOperation only substitutes them if given, so a {placeholder} is left as-is, harmless here
 * since only whether it resolved matters. Awaits configReady since this evaluates before config
 * loads (see config.ts).
 */
function availability(operationId: string): { available: Ref<boolean>; checked: Promise<boolean> } {
  const available = ref(false)
  const checked = (async () => {
    await configReady
    return bindOperation(getRootUri(), operationId)
  })()
    .then(() => {
      available.value = true
      return true
    })
    .catch(() => {
      available.value = false
      return false
    })
  return { available, checked }
}

/** Controls whether the "Users" menu link is shown, based on whether this FDP's OpenAPI doc actually offers listing users. */
export const { available: getUsersAvailable, checked: getUsersChecked } = availability('getUsers')

/** Controls whether "create user" affordances (the list's link, the form's submit button) are shown, based on whether this FDP's OpenAPI doc actually offers creating a user. */
export const { available: createUserAvailable, checked: createUserChecked } =
  availability('createUser')

/** Controls whether the per-user delete button is shown, based on whether this FDP's OpenAPI doc actually offers deleting a user. */
export const { available: deleteUserAvailable } = availability('deleteUser')

/** Resolves once known whether this FDP's OpenAPI doc offers viewing another user's profile; the router guard awaits it before allowing /users/:id. */
export const { checked: getUserChecked } = availability('getUser')
