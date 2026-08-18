import { ref, type Ref } from 'vue'
import { bindOperation, type OperationBinding } from './apiDocs'
import { getRootUri } from './urlUtils'
import { configReady } from '@/config'

/**
 * Like bindOperation, but safe for module-level callers that evaluate before main.ts has awaited
 * loadClientConfig(). Waiting for configReady avoids calling getRootUri() before runtime config
 * exists.
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
 * Turns a binding into both a reactive UI flag and an awaitable router-guard check.
 * Rejections mean "not available" here; consumers that need the underlying error should await the
 * original binding instead.
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
