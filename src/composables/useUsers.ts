import {
  fetchUsers as apiFetchUsers,
  createUser as apiCreateUser,
  deleteUser as apiDeleteUser,
} from './fdpApi'
import { readyBinding, deriveAvailability } from './operationBinding'

/** Drives the "Users" menu link and /users route guard. */
export const { available: getUsersAvailable, checked: getUsersChecked } = deriveAvailability(
  readyBinding('getUsers'),
)

/** Drives create-user UI and the /users/create route guard. */
export const { available: createUserAvailable, checked: createUserChecked } = deriveAvailability(
  readyBinding('createUser'),
)

/** Controls whether the per-user delete button is shown. */
export const { available: deleteUserAvailable } = deriveAvailability(readyBinding('deleteUser'))

/** Drives the /users/:id route guard. */
export const { checked: getUserChecked } = deriveAvailability(readyBinding('getUser'))

/** Lists all users through the OpenAPI-resolved getUsers operation. */
export async function fetchUsers(): Promise<unknown[]> {
  const { url } = await readyBinding('getUsers')
  return apiFetchUsers(url)
}

/** Creates a user through the OpenAPI-resolved createUser operation. */
export async function createUser(data: {
  firstName: string
  lastName: string
  email: string
  role: string
  password: string
}): Promise<unknown> {
  const { url, method } = await readyBinding('createUser')
  return apiCreateUser(data, url, method)
}

/** Deletes a user through the OpenAPI-resolved deleteUser operation. */
export async function deleteUser(uuid: string): Promise<void> {
  const { url, method } = await readyBinding('deleteUser', { uuid })
  await apiDeleteUser(url, method)
}
