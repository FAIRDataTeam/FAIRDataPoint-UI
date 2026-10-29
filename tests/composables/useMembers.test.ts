import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { useMembers } from '../../src/composables/useMembers'
import { fetchMembers, type ResourceMember } from '../../src/composables/fdpApi'

const auth = vi.hoisted(() => ({
  isLoggedIn: { value: false },
  isAdmin: { value: false },
  user: { value: null as { uuid: string } | null },
}))

vi.mock('../../src/composables/fdpApi', () => ({ fetchMembers: vi.fn() }))
vi.mock('../../src/composables/useAuth', async () => {
  const { ref } = await import('vue')
  auth.isLoggedIn = ref(false)
  auth.isAdmin = ref(false)
  auth.user = ref(null)
  return { useAuth: () => auth }
})

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const member = (uuid: string, firstName: string, lastName: string, membership: string) => ({
  user: { uuid, firstName, lastName },
  membership: { name: membership },
})

const tesla = member('tesla-uuid', 'Nikola', 'Tesla', 'Owner')
const curie = member('curie-uuid', 'Marie', 'Curie', 'Data Provider')
const einstein = member('einstein-uuid', 'Albert', 'Einstein', 'Owner')

let scope: EffectScope

/** Logs in as Einstein, the admin in these tests. */
function loginAsAdmin() {
  auth.isLoggedIn.value = true
  auth.isAdmin.value = true
  auth.user.value = { uuid: 'einstein-uuid' }
}

beforeEach(() => {
  scope = effectScope()
  vi.mocked(fetchMembers).mockReset()
  auth.isLoggedIn.value = false
  auth.isAdmin.value = false
  auth.user.value = null
})

afterEach(() => {
  scope.stop()
})

describe('useMembers otherOwnerNames', () => {
  it('is empty for a logged out visitor or a non-admin, without requesting members', async () => {
    const loggedOut = scope.run(() => useMembers(ref({ resourceType: 'catalog', id: 'abc' })))!
    await flushPromises()

    auth.isLoggedIn.value = true
    auth.user.value = { uuid: 'tesla-uuid' }
    const owner = scope.run(() => useMembers(ref({ resourceType: 'catalog', id: 'abc' })))!
    await flushPromises()

    expect(loggedOut.otherOwnerNames.value).toEqual([])
    expect(owner.otherOwnerNames.value).toEqual([])
    expect(loggedOut.loaded.value).toBe(false)
    expect(owner.loaded.value).toBe(false)
    expect(fetchMembers).not.toHaveBeenCalled()
  })

  it('lists the owners other than the admin themselves', async () => {
    loginAsAdmin()
    vi.mocked(fetchMembers).mockResolvedValue([tesla, curie, einstein])
    const { otherOwnerNames } = scope.run(() =>
      useMembers(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(fetchMembers).toHaveBeenCalledTimes(1)
    expect(fetchMembers).toHaveBeenCalledWith({ resourceType: 'catalog', id: 'abc' })
    expect(otherOwnerNames.value).toEqual(['Nikola Tesla'])
  })

  it('is empty but loaded when the admin is the only owner', async () => {
    loginAsAdmin()
    vi.mocked(fetchMembers).mockResolvedValue([einstein, curie])
    const { otherOwnerNames, loaded } = scope.run(() =>
      useMembers(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    expect(loaded.value).toBe(false)
    await flushPromises()
    expect(otherOwnerNames.value).toEqual([])
    expect(loaded.value).toBe(true)
  })

  it('is empty and not loaded when members cannot be fetched', async () => {
    loginAsAdmin()
    vi.mocked(fetchMembers).mockRejectedValue(new Error('HTTP 405'))
    const { otherOwnerNames, loaded } = scope.run(() => useMembers(ref(null)))!
    await flushPromises()
    expect(otherOwnerNames.value).toEqual([])
    expect(loaded.value).toBe(false)
  })

  it('ignores a pending result once admin access is lost', async () => {
    loginAsAdmin()
    const pending = Promise.withResolvers<ResourceMember[]>()
    vi.mocked(fetchMembers).mockReturnValue(pending.promise)
    const { otherOwnerNames, loaded } = scope.run(() => useMembers(ref(null)))!

    auth.isAdmin.value = false
    await nextTick()
    pending.resolve([tesla])
    await flushPromises()
    expect(otherOwnerNames.value).toEqual([])
    expect(loaded.value).toBe(false)
  })

  it('clears when the user logs out', async () => {
    loginAsAdmin()
    vi.mocked(fetchMembers).mockResolvedValue([tesla])
    const { otherOwnerNames, loaded } = scope.run(() =>
      useMembers(ref({ resourceType: 'catalog', id: 'abc' })),
    )!
    await flushPromises()
    expect(otherOwnerNames.value).toEqual(['Nikola Tesla'])
    expect(loaded.value).toBe(true)

    auth.isLoggedIn.value = false
    auth.isAdmin.value = false
    auth.user.value = null
    await nextTick()
    expect(otherOwnerNames.value).toEqual([])
    expect(loaded.value).toBe(false)
  })

  it('ignores a slower result for a resource that is no longer current', async () => {
    loginAsAdmin()
    let resolveFirst: (members: ResourceMember[]) => void = () => {}
    vi.mocked(fetchMembers)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([])
    const resource = ref({ resourceType: 'catalog', id: 'first' })
    const { otherOwnerNames } = scope.run(() => useMembers(resource))!

    resource.value = { resourceType: 'catalog', id: 'second' }
    await flushPromises()
    resolveFirst([tesla])
    await flushPromises()
    expect(otherOwnerNames.value).toEqual([])
  })
})
