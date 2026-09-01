import type { RouteLocationNormalized } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { apiDocsReady, isOperationOffered } from '@/composables/apiDocs'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    // operationId this route needs the backend's api-docs to advertise, if any.
    requiresOperation?: string
  }
}

/**
 * Extracted from router/index.ts so route access rules can be unit-tested without
 * constructing a browser-history router.
 */
export async function checkRouteAccess(to: RouteLocationNormalized) {
  const { isLoggedIn, isAdmin } = useAuth()
  if (to.meta.requiresAuth && !isLoggedIn.value) return '/login'
  if (to.meta.requiresAdmin && !isAdmin.value) return '/not-allowed'
  // Plain resource routes have no requiresOperation, so they never await apiDocsReady.
  if (!to.meta.requiresOperation) return
  await apiDocsReady
  if (!isOperationOffered(to.meta.requiresOperation)) return '/'
}
