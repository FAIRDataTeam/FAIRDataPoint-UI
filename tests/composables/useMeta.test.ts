import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { useMeta } from '../../src/composables/useMeta'
import { fetchMeta, type ResourceMeta } from '../../src/composables/fdpApi'

const auth = vi.hoisted(() => ({ isLoggedIn: { value: false }, isAdmin: { value: false } }))

vi.mock('../../src/composables/fdpApi', () => ({ fetchMeta: vi.fn() }))
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
    expect(fetchMeta).toHaveBeenCalledWith({ resourceType: 'catalog', id: 'abc' })
    expect(membershipName.value).toBe('Owner')
    expect(canWrite.value).toBe(true)
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
    expect(fetchMeta).toHaveBeenCalledWith(null)
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
