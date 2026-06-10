import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { authReady } from './composables/useAuth'

import './assets/main.css'

const app = createApp(App)

authReady.then(() => {
  app.use(router)
  app.mount('#app')
})
