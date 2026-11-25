import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { useMeta } from '../../src/composables/useMeta'
import { fetchMeta, type ResourceMeta } from '../../src/composables/fdpApi'

const auth = vi.hoisted(() => ({ isLoggedIn: { value: false }, isAdmin: { value: false } }))
const offered = vi.hoisted(() => new Set<string>())

vi.mock('../../src/composables/fdpApi', () => ({
  fetchMeta: vi.fn(),
  putOperationId: async (resource: { resourceType: string } | null) =>
    resource ? `put${resource.resourceType}` : null,
}))
vi.mock('../../src/composables/apiDocs', () => ({
  isOperationOffered: (operationId: string) => offered.has(operationId),
}))
vi.mock('../../src/composables/useAuth', async () => {
  const { ref } = await import('vue')
  auth.isLoggedIn = ref(false)
  auth.isAdmin = ref(false)
  return { useAuth: () => auth }
})

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const metaWith = (name: string | null, codes: string[] = []): ResourceMeta => ({
  member: {
    membership: name ? { name, permissions: codes.map((code) => ({ code })) } : null,
  },
})

let scope: EffectScope

beforeEach(() => {
  scope = effectScope()
  vi.mocked(fetchMeta).mockReset()
  auth.isLoggedIn.value = false
  auth.isAdmin.value = false
  offered.clear()
})

afterEach(() => {
  scope.stop()
})

describe('useMeta membershipName', () => {
  it('is null for a logged out visitor, without requesting meta', async () => {
    const { membershipName } = scope.run(() => useMeta(ref(null)))!
    await flushPromises()
    expect(membershipName.value).toBeNull()
    expect(fetchMeta).not.toHaveBeenCalled()
  })

  it('is the membership returned by meta', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Data Provider'))
    const { membershipName } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(fetchMeta).toHaveBeenCalledTimes(1)
    expect(fetchMeta).toHaveBeenCalledWith({ resourceType: 'catalog', id: 'abc' })
    expect(membershipName.value).toBe('Data Provider')
  })

  it('is null without a membership, also for the root', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith(null))
    const { membershipName } = scope.run(() => useMeta(ref(null)))!
    await flushPromises()
    expect(fetchMeta).toHaveBeenCalledWith(null)
    expect(membershipName.value).toBeNull()
  })

  it('is null when meta cannot be fetched', async () => {
    auth.isLoggedIn.value = true
    const error = new Error('HTTP 403')
    vi.mocked(fetchMeta).mockRejectedValue(error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const resource = { resourceType: 'catalog', id: 'abc' }
    const { membershipName } = scope.run(() => useMeta(ref(resource)))!
    await flushPromises()
    expect(membershipName.value).toBeNull()
    expect(warn).toHaveBeenCalledExactlyOnceWith('Failed to load meta', resource, error)
    warn.mockRestore()
  })

  it('ignores a pending result once the user logs out', async () => {
    auth.isLoggedIn.value = true
    const pending = Promise.withResolvers<ResourceMeta>()
    vi.mocked(fetchMeta).mockReturnValue(pending.promise)
    const { membershipName } = scope.run(() => useMeta(ref(null)))!

    auth.isLoggedIn.value = false
    await nextTick()
    pending.resolve(metaWith('Owner'))
    await flushPromises()
    expect(membershipName.value).toBeNull()
  })

  it('re-checks on login and clears on logout', async () => {
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Owner'))
    const { membershipName } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(membershipName.value).toBeNull()

    auth.isLoggedIn.value = true
    await flushPromises()
    expect(membershipName.value).toBe('Owner')

    auth.isLoggedIn.value = false
    await nextTick()
    expect(membershipName.value).toBeNull()
  })

  it('ignores a slower result for a resource that is no longer current', async () => {
    auth.isLoggedIn.value = true
    let resolveFirst: (meta: ResourceMeta) => void = () => {}
    vi.mocked(fetchMeta)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(metaWith(null))
    const resource = ref({ resourceType: 'catalog', id: 'first' })
    const { membershipName } = scope.run(() => useMeta(resource))!

    resource.value = { resourceType: 'catalog', id: 'second' }
    await flushPromises()
    resolveFirst(metaWith('Owner'))
    await flushPromises()
    expect(membershipName.value).toBeNull()
  })
})

describe('useMeta canEdit', () => {
  const catalog = { resourceType: 'catalog', id: 'abc' }

  /** Runs useMeta on the catalog, logged in, and waits for meta. */
  async function editAccess(meta: ResourceMeta) {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(meta)
    const result = scope.run(() => useMeta(ref(catalog)))!
    await flushPromises()
    return result
  }

  it('allows members with W when the PUT is advertised', async () => {
    offered.add('putcatalog')
    const { canEdit, loaded } = await editAccess(metaWith('Owner', ['C', 'W', 'D', 'A']))
    expect(loaded.value).toBe(true)
    expect(canEdit.value).toBe(true)
  })

  it('denies members without W', async () => {
    offered.add('putcatalog')
    const { canEdit } = await editAccess(metaWith('Data Provider', ['C']))
    expect(canEdit.value).toBe(false)
  })

  it('allows admins without a membership', async () => {
    offered.add('putcatalog')
    auth.isAdmin.value = true
    const { canEdit } = await editAccess(metaWith(null))
    expect(canEdit.value).toBe(true)
  })

  it('denies everyone when the PUT is not advertised', async () => {
    auth.isAdmin.value = true
    const { canEdit } = await editAccess(metaWith('Owner', ['W']))
    expect(canEdit.value).toBe(false)
  })

  it('reports a failed meta request instead of denying', async () => {
    offered.add('putcatalog')
    auth.isAdmin.value = true
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockRejectedValue(new Error('HTTP 500'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { canEdit, loaded, error } = scope.run(() => useMeta(ref(catalog)))!
    await flushPromises()
    expect(error.value).toBe('HTTP 500')
    expect(loaded.value).toBe(false)
    expect(canEdit.value).toBe(false)
    warn.mockRestore()
  })
})
