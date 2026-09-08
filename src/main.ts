import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { authReady } from './composables/useAuth'

import './assets/main.css'
import { loadClientConfig } from '@/config'

const app = createApp(App)

// Show a visible startup error when runtime config cannot be loaded; otherwise Vue never mounts
// and the page is blank.
try {
  await loadClientConfig()
} catch (err) {
  document.getElementById('app')!.innerHTML =
    '<p class="startup-error">Configuration error: this FDP client is not set up correctly.</p>'
  throw err
}

authReady.then(() => {
  app.use(router)
  app.mount('#app')
})
