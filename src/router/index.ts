import { createRouter, createWebHistory } from 'vue-router'
import ResourceView from '@/views/ResourceView.vue'
import LoginView from '@/views/LoginView.vue'
import SearchView from '@/views/SearchView.vue'
import NotAllowedView from '@/views/NotAllowedView.vue'
import UsersView from '@/views/UsersView.vue'
import UserFormView from '@/views/UserFormView.vue'
import { checkRouteAccess } from './guard'

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
      meta: { requiresOperation: 'generateToken' },
    },
    {
      path: '/search',
      name: 'search',
      component: SearchView,
      meta: { requiresOperation: 'search_1' },
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
      meta: { requiresAuth: true, requiresAdmin: true, requiresOperation: 'getUsers' },
    },
    {
      path: '/users/create',
      name: 'user-create',
      component: UserFormView,
      meta: { requiresAuth: true, requiresAdmin: true, requiresOperation: 'createUser' },
    },
    {
      path: '/users/current',
      name: 'user-profile',
      component: UserFormView,
      meta: { requiresAuth: true, requiresOperation: 'getUserCurrent' },
    },
    {
      path: '/users/:id',
      name: 'user-detail',
      component: UserFormView,
      meta: { requiresAuth: true, requiresAdmin: true, requiresOperation: 'getUser' },
    },
  ],
})

router.beforeEach(checkRouteAccess)

export default router
