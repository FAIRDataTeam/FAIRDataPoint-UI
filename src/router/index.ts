import { createRouter, createWebHistory } from 'vue-router'
import ResourceView from '@/views/ResourceView.vue'
import LoginView from '@/views/LoginView.vue'

export default createRouter({
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
  ],
})
