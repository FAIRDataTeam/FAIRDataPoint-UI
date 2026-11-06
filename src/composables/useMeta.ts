import { ref, watch, type Ref } from 'vue'
import { fetchMeta, type ResourceIdentifier } from './fdpApi'
import { useAuth } from './useAuth'

/** The current user's membership on the resource (null for the root). */
export function useMeta(resource: Ref<ResourceIdentifier>) {
  const { isLoggedIn } = useAuth()
  const membershipName = ref<string | null>(null)

  watch(
    [resource, isLoggedIn],
    async ([currentResource, loggedIn], _previous, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      membershipName.value = null
      if (!loggedIn) return
      try {
        const meta = await fetchMeta(currentResource)
        if (cancelled) return
        membershipName.value = meta.member?.membership?.name ?? null
      } catch (err) {
        // Without meta, only admins still get their membership, from members.
        console.warn('Failed to load meta', currentResource, err)
      }
    },
    { immediate: true },
  )

  return { membershipName }
}
