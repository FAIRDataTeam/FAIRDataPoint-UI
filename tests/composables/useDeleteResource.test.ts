import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useDeleteResource } from '../../src/composables/useDeleteResource'
import type { ResourceIdentifier } from '../../src/composables/fdpApi'

const auth = vi.hoisted(() => ({ isAdmin: { value: false } }))

vi.mock('../../src/composables/useAuth', async () => {
  const { ref } = await import('vue')
  auth.isAdmin = ref(false)
  return { useAuth: () => auth }
})
vi.mock('../../src/composables/apiDocs', () => ({
  // Like the backend's api-docs, which also offer deleting the root.
  isOperationOffered: (operationId: string) =>
    ['deleteCatalog', 'deleteFAIR Data Point'].includes(operationId),
}))

const catalog: ResourceIdentifier = { resourceType: 'catalog', id: 'abc' }

beforeEach(() => {
  auth.isAdmin.value = false
})

describe('useDeleteResource', () => {
  it('offers Delete to admins when the delete operation is advertised', () => {
    auth.isAdmin.value = true
    expect(useDeleteResource(ref(catalog)).deleteAvailable.value).toBe(true)
  })

  it('does not offer Delete to non-admins', () => {
    expect(useDeleteResource(ref(catalog)).deleteAvailable.value).toBe(false)
  })

  it('never offers Delete on the root', () => {
    auth.isAdmin.value = true
    expect(useDeleteResource(ref(null)).deleteAvailable.value).toBe(false)
  })

  it('does not offer Delete when the type has no delete operation', () => {
    auth.isAdmin.value = true
    const dataset = ref<ResourceIdentifier>({ resourceType: 'dataset', id: 'abc' })
    expect(useDeleteResource(dataset).deleteAvailable.value).toBe(false)
  })
})
