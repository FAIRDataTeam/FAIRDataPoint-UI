import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { useMeta, canEditResource } from '../../src/composables/useMeta'
import { fetchMeta, getResourceOperation, type ResourceMeta } from '../../src/composables/fdpApi'
import { isOperationOffered } from '../../src/composables/apiDocs'

const auth = vi.hoisted(() => ({
  isLoggedIn: { value: false },
  isAdmin: { value: false },
}))

vi.mock('../../src/composables/fdpApi', () => ({
  fetchMeta: vi.fn(),
  getResourceOperation: vi.fn(),
}))
vi.mock('../../src/composables/apiDocs', () => ({
  apiDocsReady: Promise.resolve(),
  isOperationOffered: vi.fn(),
}))
vi.mock('../../src/composables/useAuth', async () => {
  const { ref } = await import('vue')
  auth.isLoggedIn = ref(false)
  auth.isAdmin = ref(false)
  return { useAuth: () => auth }
})

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const metaWith = (name: string | null, codes: string[] = []): ResourceMeta => ({
  member: { membership: name ? { name, permissions: codes.map((code) => ({ code })) } : null },
})

let scope: EffectScope

beforeEach(() => {
  scope = effectScope()
  vi.mocked(fetchMeta).mockReset()
  vi.mocked(getResourceOperation).mockReset().mockResolvedValue({ operationId: 'putCatalog' })
  vi.mocked(isOperationOffered).mockReset().mockReturnValue(false)
  auth.isLoggedIn.value = false
  auth.isAdmin.value = false
})

afterEach(() => {
  scope.stop()
})

describe('useMeta', () => {
  it('shows nothing and cannot write for a logged out visitor, without requesting meta', async () => {
    const { membershipName, canWrite, loading, error } = scope.run(() => useMeta(ref(null)))!
    await flushPromises()
    expect(membershipName.value).toBeNull()
    expect(canWrite.value).toBe(false)
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(fetchMeta).not.toHaveBeenCalled()
  })

  it('shows the membership and can write with W in it', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Owner', ['C', 'W', 'D', 'A']))
    const { membershipName, canWrite } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(fetchMeta).toHaveBeenCalledTimes(1)
    expect(fetchMeta).toHaveBeenCalledWith(
      { resourceType: 'catalog', id: 'abc' },
      expect.any(AbortSignal),
    )
    expect(membershipName.value).toBe('Owner')
    expect(canWrite.value).toBe(true)
  })

  it('can edit only when it can write and the put operation is advertised', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Owner', ['W']))
    vi.mocked(isOperationOffered).mockReturnValue(true)
    const { canWrite, canEdit } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(getResourceOperation).toHaveBeenCalledWith({ resourceType: 'catalog', id: 'abc' }, 'put')
    expect(canWrite.value).toBe(true)
    expect(canEdit.value).toBe(true)
    // canEdit is a lazy computed: isOperationOffered is only called once something reads it.
    expect(isOperationOffered).toHaveBeenCalledWith('putCatalog')
  })

  it('cannot edit when it can write but the put operation is not advertised', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Owner', ['W']))
    const { canWrite, canEdit } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(canWrite.value).toBe(true)
    expect(canEdit.value).toBe(false)
  })

  it('reacts to PUT availability changes without fetching metadata again', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Owner', ['W']))
    const offeredOperations = ref<string[]>([])
    vi.mocked(isOperationOffered).mockImplementation((operationId) =>
      offeredOperations.value.includes(operationId),
    )
    const { canEdit } = scope.run(() => useMeta(ref({ resourceType: 'catalog', id: 'abc' })))!
    await flushPromises()
    expect(canEdit.value).toBe(false)

    offeredOperations.value = ['putCatalog']
    await nextTick()
    expect(canEdit.value).toBe(true)

    offeredOperations.value = []
    await nextTick()
    expect(canEdit.value).toBe(false)
    expect(fetchMeta).toHaveBeenCalledTimes(1)
    expect(getResourceOperation).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])(
    'admin editing without membership follows PUT availability (%s)',
    async (offered) => {
      auth.isLoggedIn.value = true
      auth.isAdmin.value = true
      vi.mocked(fetchMeta).mockResolvedValue(metaWith(null))
      vi.mocked(isOperationOffered).mockReturnValue(offered)
      const { canEdit } = scope.run(() => useMeta(ref(null)))!
      await flushPromises()
      expect(canEdit.value).toBe(offered)
    },
  )

  it('cannot edit with read-only membership even when PUT is advertised', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Reader', ['R']))
    vi.mocked(isOperationOffered).mockReturnValue(true)
    const { canEdit } = scope.run(() => useMeta(ref({ resourceType: 'catalog', id: 'abc' })))!
    await flushPromises()
    expect(canEdit.value).toBe(false)
  })

  it('keeps editing unavailable to an admin when metadata fails', async () => {
    auth.isLoggedIn.value = true
    auth.isAdmin.value = true
    vi.mocked(fetchMeta).mockRejectedValue(new Error('HTTP 403'))
    vi.mocked(isOperationOffered).mockReturnValue(true)
    const { canWrite, canEdit, loading, error } = scope.run(() => useMeta(ref(null)))!
    await flushPromises()
    expect(canWrite.value).toBe(true)
    expect(canEdit.value).toBe(false)
    expect(loading.value).toBe(false)
    expect(error.value).toBe('HTTP 403')
  })

  it('clears editing availability on logout', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Owner', ['W']))
    vi.mocked(isOperationOffered).mockReturnValue(true)
    const { canEdit } = scope.run(() => useMeta(ref(null)))!
    await flushPromises()
    expect(canEdit.value).toBe(true)
    auth.isLoggedIn.value = false
    await nextTick()
    expect(canEdit.value).toBe(false)
  })

  it('clears editing during navigation and ignores stale writable metadata', async () => {
    auth.isLoggedIn.value = true
    const stale = Promise.withResolvers<ResourceMeta>()
    const current = Promise.withResolvers<ResourceMeta>()
    vi.mocked(fetchMeta)
      .mockResolvedValueOnce(metaWith('Owner', ['W']))
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise)
    vi.mocked(isOperationOffered).mockReturnValue(true)
    const resource = ref({ resourceType: 'catalog', id: 'first' })
    const { canEdit, loading } = scope.run(() => useMeta(resource))!
    await flushPromises()
    expect(canEdit.value).toBe(true)

    resource.value = { resourceType: 'catalog', id: 'second' }
    await nextTick()
    expect(loading.value).toBe(true)
    expect(canEdit.value).toBe(false)
    resource.value = { resourceType: 'catalog', id: 'third' }
    await nextTick()
    stale.resolve(metaWith('Owner', ['W']))
    await flushPromises()
    expect(loading.value).toBe(true)
    expect(canEdit.value).toBe(false)
    current.resolve(metaWith('Reader', ['R']))
    await flushPromises()
    expect(loading.value).toBe(false)
    expect(canEdit.value).toBe(false)
  })

  it('shows the membership but cannot write without W', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Data Provider', ['C']))
    const { membershipName, canWrite } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(membershipName.value).toBe('Data Provider')
    expect(canWrite.value).toBe(false)
  })

  it('shows nothing and cannot write without a membership', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith(null))
    const { membershipName, canWrite, loading, error } = scope.run(() => useMeta(ref(null)))!
    await flushPromises()
    expect(membershipName.value).toBeNull()
    expect(canWrite.value).toBe(false)
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('lets an admin write without a membership, still showing none', async () => {
    auth.isLoggedIn.value = true
    auth.isAdmin.value = true
    vi.mocked(fetchMeta).mockResolvedValue(metaWith(null))
    const { membershipName, canWrite } = scope.run(() => useMeta(ref(null)))!
    await flushPromises()
    expect(fetchMeta).toHaveBeenCalledWith(null, expect.any(AbortSignal))
    expect(membershipName.value).toBeNull()
    expect(canWrite.value).toBe(true)
  })

  it('shows nothing when meta cannot be fetched, but an admin can still write', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockRejectedValue(new Error('HTTP 403'))
    const { membershipName, canWrite, loading, error } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(membershipName.value).toBeNull()
    expect(canWrite.value).toBe(false)
    expect(loading.value).toBe(false)
    expect(error.value).toBe('HTTP 403')

    auth.isAdmin.value = true
    await nextTick()
    expect(canWrite.value).toBe(true)
    expect(error.value).toBe('HTTP 403')
  })

  it('keeps a new request loading when an older request fails', async () => {
    auth.isLoggedIn.value = true
    const first = Promise.withResolvers<ResourceMeta>()
    const second = Promise.withResolvers<ResourceMeta>()
    vi.mocked(fetchMeta).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const resource = ref({ resourceType: 'catalog', id: 'first' })
    const { loading, error, canWrite } = scope.run(() => useMeta(resource))!
    expect(loading.value).toBe(true)
    expect(canWrite.value).toBe(false)

    resource.value = { resourceType: 'catalog', id: 'second' }
    await nextTick()
    first.reject(new Error('Old request failed'))
    await flushPromises()
    expect(loading.value).toBe(true)
    expect(error.value).toBeNull()

    second.resolve(metaWith('Owner', ['W']))
    await flushPromises()
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(canWrite.value).toBe(true)
  })

  it('clears a pending check on logout and ignores its later failure', async () => {
    auth.isLoggedIn.value = true
    const pending = Promise.withResolvers<ResourceMeta>()
    vi.mocked(fetchMeta).mockReturnValue(pending.promise)
    const { loading, error, canWrite } = scope.run(() => useMeta(ref(null)))!
    expect(loading.value).toBe(true)

    auth.isLoggedIn.value = false
    await nextTick()
    expect(loading.value).toBe(false)
    pending.reject(new Error('Request failed after logout'))
    await flushPromises()
    expect(error.value).toBeNull()
    expect(canWrite.value).toBe(false)
  })

  it('re-checks on login and clears on logout', async () => {
    vi.mocked(fetchMeta).mockResolvedValue(metaWith('Owner', ['W']))
    const { membershipName, canWrite } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(membershipName.value).toBeNull()

    auth.isLoggedIn.value = true
    await flushPromises()
    expect(membershipName.value).toBe('Owner')
    expect(canWrite.value).toBe(true)

    auth.isLoggedIn.value = false
    await nextTick()
    expect(membershipName.value).toBeNull()
    expect(canWrite.value).toBe(false)
  })

  it('ignores a slower result for a resource that is no longer current', async () => {
    auth.isLoggedIn.value = true
    let resolveFirst: (meta: ResourceMeta) => void = () => {}
    vi.mocked(fetchMeta)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(metaWith(null))
    const resource = ref({ resourceType: 'catalog', id: 'first' })
    const { membershipName, canWrite } = scope.run(() => useMeta(resource))!

    resource.value = { resourceType: 'catalog', id: 'second' }
    await flushPromises()
    resolveFirst(metaWith('Owner', ['W']))
    await flushPromises()
    expect(membershipName.value).toBeNull()
    expect(canWrite.value).toBe(false)
  })
})

describe('canEditResource', () => {
  it('returns false without requesting meta when logged out', async () => {
    expect(await canEditResource(null)).toBe(false)
    expect(fetchMeta).not.toHaveBeenCalled()
  })

  it.each([
    { admin: false, codes: ['W'], offered: true, allowed: true },
    { admin: false, codes: ['W'], offered: false, allowed: false },
    { admin: false, codes: ['R'], offered: true, allowed: false },
    { admin: true, codes: [], offered: true, allowed: true },
  ])(
    'returns $allowed for admin=$admin, permissions=$codes, PUT=$offered',
    async ({ admin, codes, offered, allowed }) => {
      auth.isLoggedIn.value = true
      auth.isAdmin.value = admin
      vi.mocked(fetchMeta).mockResolvedValue(metaWith(codes.length ? 'Member' : null, codes))
      vi.mocked(isOperationOffered).mockReturnValue(offered)
      expect(await canEditResource(null)).toBe(allowed)
    },
  )

  it('lets the page fetch fresh access after the guard check', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(isOperationOffered).mockReturnValue(true)
    vi.mocked(fetchMeta)
      .mockResolvedValueOnce(metaWith('Owner', ['W']))
      .mockResolvedValueOnce(metaWith('Reader', ['R']))
    const resource = { resourceType: 'catalog', id: 'abc' }
    expect(await canEditResource(resource)).toBe(true)
    const { canEdit } = scope.run(() => useMeta(ref(resource)))!
    await flushPromises()
    expect(canEdit.value).toBe(false)
    expect(fetchMeta).toHaveBeenCalledTimes(2)
  })

  it('propagates a request failure rather than treating it as denied', async () => {
    auth.isLoggedIn.value = true
    vi.mocked(fetchMeta).mockRejectedValue(new Error('HTTP 503'))
    await expect(canEditResource(null)).rejects.toThrow('HTTP 503')
  })

  it('bounds both guard and page checks when metadata stalls', async () => {
    vi.useFakeTimers()
    try {
      auth.isLoggedIn.value = true
      vi.mocked(fetchMeta).mockImplementation(() => new Promise(() => {}))
      const rejection = expect(canEditResource(null)).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(10_000)
      await rejection
      expect(vi.mocked(fetchMeta).mock.calls[0]![1]?.aborted).toBe(true)
      const { error, loading, canEdit } = scope.run(() => useMeta(ref(null)))!
      await vi.advanceTimersByTimeAsync(10_000)
      expect(error.value).toContain('timed out')
      expect(loading.value).toBe(false)
      expect(canEdit.value).toBe(false)
      expect(vi.mocked(fetchMeta).mock.calls[1]![1]?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
