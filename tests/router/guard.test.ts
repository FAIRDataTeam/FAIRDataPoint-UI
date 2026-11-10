import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { RouteLocationNormalized, RouteMeta, RouteParams } from 'vue-router'

// checkRouteAccess only ever reads `to.meta` and `to.params`, so a fake route with just those
// fields is enough. No need for a real router instance (this project has no DOM/jsdom test
// environment set up, and createWebHistory() needs one).
const isLoggedIn = ref(false)
const isAdmin = ref(false)

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ isLoggedIn, isAdmin }),
}))

const isOperationOffered = vi.fn()

vi.mock('@/composables/apiDocs', () => ({
  apiDocsReady: Promise.resolve(),
  isOperationOffered,
}))

const canEditResource = vi.fn()

vi.mock('@/composables/useMeta', () => ({
  canEditResource,
}))

const { checkRouteAccess } = await import('../../src/router/guard')

function fakeRoute(meta: RouteMeta, params: RouteParams = {}): RouteLocationNormalized {
  return { meta, params } as RouteLocationNormalized
}

beforeEach(() => {
  isLoggedIn.value = false
  isAdmin.value = false
  isOperationOffered.mockReset()
  canEditResource.mockReset()
})

describe('checkRouteAccess', () => {
  it('redirects to /login when requiresAuth and not logged in', async () => {
    expect(await checkRouteAccess(fakeRoute({ requiresAuth: true }))).toBe('/login')
  })

  it('allows a requiresAuth route once logged in', async () => {
    isLoggedIn.value = true
    expect(await checkRouteAccess(fakeRoute({ requiresAuth: true }))).toBeUndefined()
  })

  it('redirects to /not-allowed when requiresAdmin and logged in but not admin', async () => {
    isLoggedIn.value = true
    expect(await checkRouteAccess(fakeRoute({ requiresAuth: true, requiresAdmin: true }))).toBe(
      '/not-allowed',
    )
  })

  it('allows a requiresAdmin route once logged in as admin', async () => {
    isLoggedIn.value = true
    isAdmin.value = true
    expect(
      await checkRouteAccess(fakeRoute({ requiresAuth: true, requiresAdmin: true })),
    ).toBeUndefined()
  })

  it('redirects to /not-allowed when requiresEdit and canEditResource resolves false', async () => {
    isLoggedIn.value = true
    canEditResource.mockResolvedValue(false)
    expect(await checkRouteAccess(fakeRoute({ requiresAuth: true, requiresEdit: true }))).toBe(
      '/not-allowed',
    )
  })

  it('allows a requiresEdit route when canEditResource resolves true', async () => {
    isLoggedIn.value = true
    canEditResource.mockResolvedValue(true)
    expect(
      await checkRouteAccess(fakeRoute({ requiresAuth: true, requiresEdit: true })),
    ).toBeUndefined()
  })

  it('derives the resource identifier from route params for requiresEdit', async () => {
    isLoggedIn.value = true
    canEditResource.mockResolvedValue(true)
    await checkRouteAccess(
      fakeRoute({ requiresEdit: true }, { resourceType: 'catalog', id: 'abc' }),
    )
    expect(canEditResource).toHaveBeenCalledWith({ resourceType: 'catalog', id: 'abc' })
  })

  it('passes null for a requiresEdit route with no resource params (the FDP root)', async () => {
    isLoggedIn.value = true
    canEditResource.mockResolvedValue(true)
    await checkRouteAccess(fakeRoute({ requiresEdit: true }))
    expect(canEditResource).toHaveBeenCalledWith(null)
  })

  it('checks auth before ever calling canEditResource', async () => {
    expect(await checkRouteAccess(fakeRoute({ requiresAuth: true, requiresEdit: true }))).toBe(
      '/login',
    )
    expect(canEditResource).not.toHaveBeenCalled()
  })

  it('allows a requiresEdit route rather than masking a meta-fetch failure as "not allowed"', async () => {
    isLoggedIn.value = true
    canEditResource.mockRejectedValue(new Error('HTTP 503'))
    expect(
      await checkRouteAccess(fakeRoute({ requiresAuth: true, requiresEdit: true })),
    ).toBeUndefined()
  })

  it('checks auth/admin before ever touching isOperationOffered', async () => {
    expect(
      await checkRouteAccess(fakeRoute({ requiresAuth: true, requiresOperation: 'generateToken' })),
    ).toBe('/login')
    expect(isOperationOffered).not.toHaveBeenCalled()
  })

  it('allows a route with no requiresOperation without checking apiDocs at all', async () => {
    expect(await checkRouteAccess(fakeRoute({}))).toBeUndefined()
    expect(isOperationOffered).not.toHaveBeenCalled()
  })

  it('redirects to / when the required operation is not offered', async () => {
    isOperationOffered.mockReturnValue(false)
    expect(await checkRouteAccess(fakeRoute({ requiresOperation: 'generateToken' }))).toBe('/')
    expect(isOperationOffered).toHaveBeenCalledWith('generateToken')
  })

  it('allows the route when the required operation is offered', async () => {
    isOperationOffered.mockReturnValue(true)
    expect(
      await checkRouteAccess(fakeRoute({ requiresOperation: 'generateToken' })),
    ).toBeUndefined()
  })
})
