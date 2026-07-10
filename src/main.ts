import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { authReady } from './composables/useAuth'

import './assets/main.css'
import { loadRuntimeConfig } from '@/config.ts'

const app = createApp(App)

// Load runtime configuration from JSON file. Afterwards, we can use getRuntimeConfig() to access the result.
await loadRuntimeConfig()

authReady.then(() => {
  app.use(router)
  app.mount('#app')
})
