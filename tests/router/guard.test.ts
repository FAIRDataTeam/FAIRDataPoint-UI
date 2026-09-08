import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { RouteLocationNormalized, RouteMeta } from 'vue-router'

// checkRouteAccess only ever reads `to.meta`, so a fake route with just that field is enough.
// No need for a real router instance (this project has no DOM/jsdom test environment set up, and
// createWebHistory() needs one).
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

const { checkRouteAccess } = await import('../../src/router/guard')

function fakeRoute(meta: RouteMeta): RouteLocationNormalized {
  return { meta } as RouteLocationNormalized
}

beforeEach(() => {
  isLoggedIn.value = false
  isAdmin.value = false
  isOperationOffered.mockReset()
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
