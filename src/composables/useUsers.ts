import { readyBinding, deriveAvailability } from './operationBinding'

/** Controls whether the "Users" menu link is shown, based on whether this FDP's OpenAPI doc actually offers listing users. */
export const { available: getUsersAvailable, checked: getUsersChecked } = deriveAvailability(
  readyBinding('getUsers'),
)

/** Controls whether "create user" affordances (the list's link, the form's submit button) are shown, based on whether this FDP's OpenAPI doc actually offers creating a user. */
export const { available: createUserAvailable, checked: createUserChecked } = deriveAvailability(
  readyBinding('createUser'),
)

/** Controls whether the per-user delete button is shown, based on whether this FDP's OpenAPI doc actually offers deleting a user. */
export const { available: deleteUserAvailable } = deriveAvailability(readyBinding('deleteUser'))

/** Resolves once known whether this FDP's OpenAPI doc offers viewing another user's profile; the router guard awaits it before allowing /users/:id. */
export const { checked: getUserChecked } = deriveAvailability(readyBinding('getUser'))
