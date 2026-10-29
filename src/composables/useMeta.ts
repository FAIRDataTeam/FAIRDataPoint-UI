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
      } catch {
        // Without meta no membership badge is shown.
      }
    },
    { immediate: true },
  )

  return { membershipName }
}
