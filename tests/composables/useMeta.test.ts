import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { useMeta } from '../../src/composables/useMeta'
import { fetchMeta, type ResourceMeta } from '../../src/composables/fdpApi'

const auth = vi.hoisted(() => ({ isLoggedIn: { value: false } }))

vi.mock('../../src/composables/fdpApi', () => ({ fetchMeta: vi.fn() }))
vi.mock('../../src/composables/useAuth', async () => {
  const { ref } = await import('vue')
  auth.isLoggedIn = ref(false)
  return { useAuth: () => auth }
})

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const metaWith = (name: string | null): ResourceMeta => ({
  member: { membership: name ? { name } : null },
})

let scope: EffectScope

beforeEach(() => {
  scope = effectScope()
  vi.mocked(fetchMeta).mockReset()
  auth.isLoggedIn.value = false
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
    vi.mocked(fetchMeta).mockRejectedValue(new Error('HTTP 403'))
    const { membershipName } = scope.run(() =>
      useMeta(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(membershipName.value).toBeNull()
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
