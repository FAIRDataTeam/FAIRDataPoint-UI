import { computed, ref, watch, type Ref } from 'vue'
import { fetchMeta, getResourceOperation, type ResourceIdentifier } from './fdpApi'
import { isOperationOffered } from './apiDocs'
import { withDeadline } from './fetchUtils'
import { useAuth } from './useAuth'

type EditAccess = {
  membershipName: string | null
  hasWrite: boolean
  operationId: string
}

const ACCESS_TIMEOUT_MS = 10_000

async function loadEditAccess(resource: ResourceIdentifier): Promise<EditAccess> {
  // The deadline includes shared API discovery, while the signal only aborts the metadata request.
  const [meta, { operationId }] = await withDeadline(
    ACCESS_TIMEOUT_MS,
    'Checking edit access timed out. Please try again.',
    (signal) => Promise.all([fetchMeta(resource, signal), getResourceOperation(resource, 'put')]),
  )
  const membership = meta.member?.membership
  return {
    membershipName: membership?.name ?? null,
    hasWrite: membership?.permissions.some((permission) => permission.code === 'W') ?? false,
    operationId,
  }
}

function permitsEdit(hasWrite: boolean, operationId: string, admin: boolean): boolean {
  return (admin || hasWrite) && isOperationOffered(operationId)
}

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
      isLoggedIn.value &&
      putOperationId.value !== null &&
      permitsEdit(hasWrite.value, putOperationId.value, isAdmin.value),
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
        const access = await loadEditAccess(currentResource)
        if (current !== generation) return
        membershipName.value = access.membershipName
        hasWrite.value = access.hasWrite
        putOperationId.value = access.operationId
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

/** Checks route access; request failures propagate so they are not mistaken for denial. */
export async function canEditResource(resource: ResourceIdentifier): Promise<boolean> {
  const { isLoggedIn, isAdmin } = useAuth()
  if (!isLoggedIn.value) return false
  const access = await loadEditAccess(resource)
  return isLoggedIn.value && permitsEdit(access.hasWrite, access.operationId, isAdmin.value)
}
