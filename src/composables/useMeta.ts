import { computed, ref, watch, type Ref } from 'vue'
import { fetchMeta, putOperationId, type ResourceIdentifier } from './fdpApi'
import { isOperationOffered } from './apiDocs'
import { useAuth } from './useAuth'

/**
 * The current user's membership on the resource (null for the root), and whether they can edit
 * it: admins always, others with W on this exact resource, and only if its PUT is advertised.
 */
export function useMeta(resource: Ref<ResourceIdentifier>) {
  const { isLoggedIn, isAdmin } = useAuth()
  const membershipName = ref<string | null>(null)
  const hasWrite = ref(false)
  const putOperation = ref<string | null>(null)
  // Whether meta loaded for the current resource, so canEdit is final.
  const loaded = ref(false)
  const error = ref<string | null>(null)
  const canEdit = computed(
    () =>
      loaded.value &&
      (isAdmin.value || hasWrite.value) &&
      putOperation.value !== null &&
      isOperationOffered(putOperation.value),
  )

  watch(
    [resource, isLoggedIn],
    async ([currentResource, loggedIn], _previous, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      membershipName.value = null
      hasWrite.value = false
      putOperation.value = null
      loaded.value = false
      error.value = null
      if (!loggedIn) return
      try {
        const [resourceMeta, operationId] = await Promise.all([
          fetchMeta(currentResource),
          putOperationId(currentResource),
        ])
        if (cancelled) return
        const membership = resourceMeta.member?.membership
        membershipName.value = membership?.name ?? null
        hasWrite.value = membership?.permissions.some(({ code }) => code === 'W') ?? false
        putOperation.value = operationId
        loaded.value = true
      } catch (err) {
        // Without meta, only admins still get their membership, from members.
        console.warn('Failed to load meta', currentResource, err)
        if (!cancelled) error.value = err instanceof Error ? err.message : 'Unable to load meta.'
      }
    },
    { immediate: true },
  )

  return { membershipName, canEdit, loaded, error }
}
