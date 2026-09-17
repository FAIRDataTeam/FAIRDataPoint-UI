import { computed, ref, watch, type Ref } from 'vue'
import { fetchMeta, getResourceOperation, type ResourceIdentifier } from './fdpApi'
import { apiDocsReady, isOperationOffered } from './apiDocs'
import { useAuth } from './useAuth'

/**
 * The current user's membership on the resource (null for the root), whether they may write it,
 * and whether editing is possible at all. Admins may write everything; others need W in their
 * membership on this exact resource. canEdit additionally requires the resource's meta to have
 * loaded successfully (even for admins) and the backend to currently advertise a put operation for
 * it, since permission alone doesn't guarantee the endpoint exists.
 */
export function useMeta(resource: Ref<ResourceIdentifier>) {
  const { isLoggedIn, isAdmin } = useAuth()
  const loading = ref(false)
  const error = ref<string | null>(null)
  const membershipName = ref<string | null>(null)
  const hasWrite = ref(false)
  // Only the operation ID is stored; whether it's offered is read reactively below so a later
  // refreshApiDocs() (e.g. after a resource-definition change) updates canEdit without a re-check.
  const putOperationId = ref<string | null>(null)
  const canWrite = computed(() => isLoggedIn.value && (isAdmin.value || hasWrite.value))
  const canEdit = computed(
    () =>
      canWrite.value && putOperationId.value !== null && isOperationOffered(putOperationId.value),
  )

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
      putOperationId.value = null
      error.value = null
      loading.value = loggedIn
      if (!loggedIn) return
      try {
        const [meta, { operationId }] = await Promise.all([
          fetchMeta(currentResource),
          getResourceOperation(currentResource, 'put'),
        ])
        await apiDocsReady
        if (current !== generation) return
        const membership = meta.member?.membership
        membershipName.value = membership?.name ?? null
        hasWrite.value = membership?.permissions.some((p) => p.code === 'W') ?? false
        putOperationId.value = operationId
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

  return { membershipName, canWrite, canEdit, loading, error }
}
