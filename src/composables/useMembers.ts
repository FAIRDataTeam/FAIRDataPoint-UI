import { computed, ref, watch, type Ref } from 'vue'
import { fetchMembers, type ResourceIdentifier, type ResourceMember } from './fdpApi'
import { useAuth } from './useAuth'

/**
 * Names of the owners of the resource (null for the root) other than the current user,
 * shown to admins only.
 */
export function useMembers(resource: Ref<ResourceIdentifier>) {
  const { isLoggedIn, isAdmin, user } = useAuth()
  const loading = ref(false)
  const error = ref<string | null>(null)
  // Whether the owners list was fetched for the current resource, so an empty list is meaningful.
  const loaded = ref(false)
  const owners = ref<ResourceMember['user'][]>([])
  const otherOwnerNames = computed(() =>
    owners.value
      .filter((owner) => owner.uuid !== user.value?.uuid)
      .map((owner) => `${owner.firstName} ${owner.lastName}`),
  )

  // Identifies the newest check, so a slower older one cannot overwrite its result.
  let generation = 0

  watch(
    [resource, isLoggedIn, isAdmin],
    async ([currentResource, loggedIn, admin], _previous, onCleanup) => {
      const current = ++generation
      onCleanup(() => {
        generation++
      })
      owners.value = []
      error.value = null
      loaded.value = false
      loading.value = loggedIn && admin
      if (!loggedIn || !admin) return
      try {
        const members = await fetchMembers(currentResource)
        if (current !== generation) return
        owners.value = members
          .filter((member) => member.membership.name === 'Owner')
          .map((member) => member.user)
        loaded.value = true
      } catch (err) {
        if (current === generation) {
          error.value = err instanceof Error ? err.message : 'Unable to get resource members.'
        }
      } finally {
        if (current === generation) loading.value = false
      }
    },
    { immediate: true },
  )

  return { otherOwnerNames, loaded, loading, error }
}
