import { computed, type Ref } from 'vue'
import { deleteOperationId, type ResourceIdentifier } from './fdpApi'
import { isOperationOffered } from './apiDocs'
import { useAuth } from './useAuth'

/** Whether to show Delete: admins only, as the backend requires, and never on the root. */
export function useDeleteResource(resource: Ref<ResourceIdentifier>) {
  const { isAdmin } = useAuth()
  const deleteAvailable = computed(() => {
    // The api-docs offer deleting the root, but the backend refuses it.
    if (resource.value === null || !isAdmin.value) return false
    return isOperationOffered(deleteOperationId(resource.value.resourceType))
  })
  return { deleteAvailable }
}
