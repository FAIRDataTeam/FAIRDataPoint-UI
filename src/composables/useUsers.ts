import { computed } from 'vue'
import {
  fetchUsers as apiFetchUsers,
  createUser as apiCreateUser,
  deleteUser as apiDeleteUser,
} from './fdpApi'
import { isOperationOffered } from './apiDocs'

/** Drives the "Users" menu link; the /users route guard checks the same operation. */
export const getUsersAvailable = computed(() => isOperationOffered('getUsers'))

/** Drives create-user UI; the /users/create route guard checks the same operation. */
export const createUserAvailable = computed(() => isOperationOffered('createUser'))

/** Controls whether the per-user delete button is shown. */
export const deleteUserAvailable = computed(() => isOperationOffered('deleteUser'))

/** Lists all users through the getUsers operation, resolved via api-docs. */
export async function fetchUsers(): Promise<unknown[]> {
  return apiFetchUsers()
}

/** Creates a user through the createUser operation, resolved via api-docs. */
export async function createUser(data: {
  firstName: string
  lastName: string
  email: string
  role: string
  password: string
}): Promise<unknown> {
  return apiCreateUser(data)
}

/** Deletes a user through the deleteUser operation, resolved via api-docs. */
export async function deleteUser(uuid: string): Promise<void> {
  await apiDeleteUser(uuid)
}
