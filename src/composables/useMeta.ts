import { computed, ref, watch, type Ref } from 'vue'
import { fetchMeta, type ResourceIdentifier } from './fdpApi'
import { useAuth } from './useAuth'

/**
 * The current user's membership on the resource (null for the root), and whether they may
 * write it. Admins may write everything; others need W in their membership on this exact resource.
 */
export function useMeta(resource: Ref<ResourceIdentifier>) {
  const { isLoggedIn, isAdmin } = useAuth()
  const loading = ref(false)
  const error = ref<string | null>(null)
  const membershipName = ref<string | null>(null)
  const hasWrite = ref(false)
  // Permission only: an edit action must also check operation availability and loading/error state.
  const canWrite = computed(() => isLoggedIn.value && (isAdmin.value || hasWrite.value))

  // Identifies the newest check, so a slower older one cannot overwrite its result.
  let generation = 0

  watch(
    [resource, isLoggedIn],
    async ([currentResource, loggedIn], _previous, onCleanup) => {
      const current = ++generation
      onCleanup(() => {
        generation++
      })
      membershipName.value = null
      hasWrite.value = false
      error.value = null
      loading.value = loggedIn
      if (!loggedIn) return
      try {
        const meta = await fetchMeta(currentResource)
        if (current !== generation) return
        const membership = meta.member?.membership
        membershipName.value = membership?.name ?? null
        hasWrite.value = membership?.permissions.some((p) => p.code === 'W') ?? false
      } catch (err) {
        if (current === generation) {
          error.value = err instanceof Error ? err.message : 'Unable to get resource metadata.'
        }
      } finally {
        if (current === generation) loading.value = false
      }
    },
    { immediate: true },
  )

  return { membershipName, canWrite, loading, error }
}
