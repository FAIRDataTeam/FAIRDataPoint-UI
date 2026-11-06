import { computed, ref, watch, type Ref } from 'vue'
import { fetchMembers, type ResourceIdentifier, type ResourceMember } from './fdpApi'
import { useAuth } from './useAuth'

/**
 * Names of the members of the resource (null for the root) other than the current user,
 * shown to admins only.
 */
export function useMembers(resource: Ref<ResourceIdentifier>) {
  const { isLoggedIn, isAdmin, user } = useAuth()
  // Whether the owners list was fetched for the current resource, so an empty list is meaningful.
  const loaded = ref(false)
  const members = ref<ResourceMember[]>([])
  const otherMembers = computed(() =>
    members.value.filter((member) => member.user.uuid !== user.value?.uuid),
  )
  const fullName = ({ user }: ResourceMember) => `${user.firstName} ${user.lastName}`
  const otherOwnerNames = computed(() =>
    otherMembers.value.filter((member) => member.membership.name === 'Owner').map(fullName),
  )
  // Non-owners by membership, e.g. { 'Data Provider': ['Marie Curie'] }.
  const otherMemberNames = computed(() => {
    const byMembership: Record<string, string[]> = {}
    for (const member of otherMembers.value) {
      const { name } = member.membership
      if (name !== 'Owner') (byMembership[name] ??= []).push(fullName(member))
    }
    return byMembership
  })

  watch(
    [resource, isLoggedIn, isAdmin],
    async ([currentResource, loggedIn, admin], _previous, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      members.value = []
      loaded.value = false
      if (!loggedIn || !admin) return
      try {
        const fetched = await fetchMembers(currentResource)
        if (cancelled) return
        members.value = fetched
        loaded.value = true
      } catch (err) {
        // Without the list loaded is false, so OwnersBadge doesn't claim sole ownership.
        console.warn('Failed to load members', currentResource, err)
      }
    },
    { immediate: true },
  )

  return { otherOwnerNames, otherMemberNames, loaded }
}
