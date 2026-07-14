import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { authReady } from './composables/useAuth'

import './assets/main.css'
import { loadClientConfig } from '@/config'

const app = createApp(App)

// Load runtime configuration from a JSON file.
// Afterwards, we can use getClientConfig() to access the result at any time.
await loadClientConfig()

authReady.then(() => {
  app.use(router)
  app.mount('#app')
})
