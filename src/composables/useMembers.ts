import { computed, ref, watch, type Ref } from 'vue'
import { fetchMembers, type ResourceIdentifier, type ResourceMember } from './fdpApi'
import { useAuth } from './useAuth'

/**
 * Names of the owners of the resource (null for the root) other than the current user,
 * shown to admins only.
 */
export function useMembers(resource: Ref<ResourceIdentifier>) {
  const { isLoggedIn, isAdmin, user } = useAuth()
  // Whether the owners list was fetched for the current resource, so an empty list is meaningful.
  const loaded = ref(false)
  const owners = ref<ResourceMember['user'][]>([])
  const otherOwnerNames = computed(() =>
    owners.value
      .filter((owner) => owner.uuid !== user.value?.uuid)
      .map((owner) => `${owner.firstName} ${owner.lastName}`),
  )

  watch(
    [resource, isLoggedIn, isAdmin],
    async ([currentResource, loggedIn, admin], _previous, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      owners.value = []
      loaded.value = false
      if (!loggedIn || !admin) return
      try {
        const members = await fetchMembers(currentResource)
        if (cancelled) return
        owners.value = members
          .filter((member) => member.membership.name === 'Owner')
          .map((member) => member.user)
        loaded.value = true
      } catch (err) {
        // Without the list loaded is false, so OwnersBadge doesn't claim sole ownership.
        console.warn('Failed to load members', currentResource, err)
      }
    },
    { immediate: true },
  )

  return { otherOwnerNames, loaded }
}
