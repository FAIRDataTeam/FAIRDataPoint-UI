import type { RouteLocationNormalized } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { apiDocsReady, isOperationOffered } from '@/composables/apiDocs'
import { canEditResource } from '@/composables/useMeta'
import type { ResourceIdentifier } from '@/composables/fdpApi'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    // Whether the signed-in user can write this exact resource, checked live (see useMeta.canEdit).
    requiresEdit?: boolean
    // operationId this route needs the backend's api-docs to advertise, if any.
    requiresOperation?: string
  }
}

/** Mirrors useResourceView's own resource identifier, derived the same way from route params. */
function routeResource(to: RouteLocationNormalized): ResourceIdentifier {
  const { resourceType, id } = to.params
  return typeof resourceType === 'string' && typeof id === 'string' ? { resourceType, id } : null
}

/**
 * Extracted from router/index.ts so route access rules can be unit-tested without
 * constructing a browser-history router.
 */
export async function checkRouteAccess(to: RouteLocationNormalized) {
  const { isLoggedIn, isAdmin } = useAuth()
  if (to.meta.requiresAuth && !isLoggedIn.value) return '/login'
  if (to.meta.requiresAdmin && !isAdmin.value) return '/not-allowed'
  if (to.meta.requiresEdit) {
    try {
      if (!(await canEditResource(routeResource(to)))) return '/not-allowed'
    } catch {
      // The page loads access independently and displays any request failure.
    }
  }
  // Plain resource routes have no requiresOperation, so they never await apiDocsReady.
  if (!to.meta.requiresOperation) return
  await apiDocsReady
  if (!isOperationOffered(to.meta.requiresOperation)) return '/'
}
