import { ref, type Ref } from 'vue'
import { bindOperation, type OperationBinding } from './apiDocs'
import { getRootUri } from './urlUtils'
import { configReady } from '@/config'

/**
 * bindOperation, wrapped to await configReady first. Needed by module-level callers (useAuth.ts,
 * useSearch.ts, useUsers.ts): they evaluate before main.ts awaits loadClientConfig(), so
 * getRootUri() would throw if called immediately. Component-level call sites that only run after
 * mount (e.g. UsersView.vue's loadUsers) don't need this, config is already loaded by then, they
 * can call bindOperation directly.
 */
export function readyBinding(
  operationId: string,
  pathParams?: Record<string, string>,
): Promise<OperationBinding> {
  return (async () => {
    await configReady
    return bindOperation(getRootUri(), operationId, pathParams)
  })()
}

/**
 * True if binding resolves, in a ref for template gating, plus a promise a caller can await to
 * know the check has actually completed (a router guard can't just read the ref synchronously,
 * it may not have settled yet).
 */
export function deriveAvailability(binding: Promise<OperationBinding>): {
  available: Ref<boolean>
  checked: Promise<boolean>
} {
  const available = ref(false)
  const checked = binding
    .then(() => {
      available.value = true
      return true
    })
    .catch(() => {
      available.value = false
      return false
    })
  return { available, checked }
}
