import { createRouter, createWebHistory } from 'vue-router'
import ResourceView from '@/views/ResourceView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ResourceView },
    { path: '/:resourceType/:id', component: ResourceView },
  ],
})
