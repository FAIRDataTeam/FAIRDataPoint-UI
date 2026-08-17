import { createRouter, createWebHistory } from 'vue-router'
import ResourceView from '@/views/ResourceView.vue'
import LoginView from '@/views/LoginView.vue'
import SearchView from '@/views/SearchView.vue'
import NotAllowedView from '@/views/NotAllowedView.vue'
import UsersView from '@/views/UsersView.vue'
import UserFormView from '@/views/UserFormView.vue'
import { useAuth, loginAvailabilityChecked, getUserCurrentChecked } from '@/composables/useAuth'
import { getUsersChecked, createUserChecked, getUserChecked } from '@/composables/useUsers'
import { searchChecked } from '@/composables/useSearch'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'fdp-root',
      component: ResourceView,
    },
    {
      path: '/:resourceType/:id',
      name: 'resource',
      component: ResourceView,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/search',
      name: 'search',
      component: SearchView,
    },
    {
      path: '/not-allowed',
      name: 'not-allowed',
      component: NotAllowedView,
    },
    {
      path: '/users',
      name: 'users',
      component: UsersView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/users/create',
      name: 'user-create',
      component: UserFormView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/users/current',
      name: 'user-profile',
      component: UserFormView,
      meta: { requiresAuth: true },
    },
    {
      path: '/users/:id',
      name: 'user-detail',
      component: UserFormView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const { isLoggedIn, isAdmin } = useAuth()
  if (to.meta.requiresAuth && !isLoggedIn.value) return '/login'
  if (to.meta.requiresAdmin && !isAdmin.value) return '/not-allowed'
  if (to.name === 'login' && !(await loginAvailabilityChecked)) return '/'
  if (to.name === 'users' && !(await getUsersChecked)) return '/'
  if (to.name === 'user-create' && !(await createUserChecked)) return '/'
  if (to.name === 'user-detail' && !(await getUserChecked)) return '/'
  if (to.name === 'user-profile' && !(await getUserCurrentChecked)) return '/'
  if (to.name === 'search' && !(await searchChecked)) return '/'
})

export default router
