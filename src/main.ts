import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { authReady } from './composables/useAuth'

import './assets/main.css'
import { loadClientConfig } from '@/config'

const app = createApp(App)

// Load runtime configuration from a JSON file. Afterwards, we can use getClientConfig() to
// access the result at any time. Wrapped in try/catch (unlike the rest of this file) so a
// failure shows a visible error instead of leaving a blank page.
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
