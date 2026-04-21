<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'

const { isLoggedIn, userEmail, userInitials, logout } = useAuth()
const router = useRouter()

const menuOpen = ref(false)
const searchQuery = ref('')

function handleLogout() {
  menuOpen.value = false
  logout()
}

function submitSearch() {
  const q = searchQuery.value.trim()
  if (!q) return
  void router.push({ name: 'search', query: { q } })
}

// About modal
type ServerInfo = { name: string; version: string; builtAt: string }
const aboutOpen = ref(false)
const serverInfo = ref<ServerInfo | null>(null)
const appVersion = __APP_VERSION__
const appBuildAt = __APP_BUILD_AT__

async function openAbout() {
  aboutOpen.value = true
  if (serverInfo.value) return
  try {
    const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
    const res = await fetch(`${base}/actuator/info`, { headers: { Accept: 'application/json' } })
    if (res.ok) serverInfo.value = await res.json() as ServerInfo
  } catch { /* show modal without server info */ }
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__inner">
        <RouterLink to="/" class="app-header__brand">
          <img src="/assets/fair-logo.png" alt="FAIR Data Point logo" class="app-header__logo" />
          <span class="app-header__title">
            <span class="app-header__title-full">
              FAIR Data Point
              <small>Metadata for machines</small>
            </span>
            <span class="app-header__title-short">FAIR Data Point</span>
          </span>
        </RouterLink>

        <form class="header-search" role="search" @submit.prevent="submitSearch">
          <button type="submit" class="header-search__icon" aria-label="Search">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <input
            v-model="searchQuery"
            type="search"
            class="header-search__input"
            placeholder="Search FAIR Data Point…"
            aria-label="Search FAIR Data Point"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="header-search__clear"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </form>

        <nav class="app-header__nav">
          <RouterLink v-if="!isLoggedIn" to="/login" class="header-login-btn">Log in</RouterLink>

          <div v-else class="user-menu">
            <button
              type="button"
              class="user-avatar"
              :aria-expanded="menuOpen"
              aria-haspopup="true"
              @click="menuOpen = !menuOpen"
            >
              {{ userInitials(userEmail) }}
            </button>

            <div v-if="menuOpen" class="user-dropdown">
              <div class="user-dropdown__email">{{ userEmail }}</div>
              <hr class="user-dropdown__divider" />
              <button type="button" class="user-dropdown__item" @click="handleLogout">Log out</button>
            </div>
          </div>
        </nav>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>

    <footer class="app-footer">
      <div class="app-footer__inner">
        <span class="app-footer__text">FAIR Data Point</span>
        <span class="app-footer__sep">·</span>
        <button type="button" class="app-footer__link" @click="openAbout">About</button>
      </div>
    </footer>

    <div v-if="aboutOpen" class="modal-overlay" @click.self="aboutOpen = false">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="modal__header">
          <h2 id="about-title" class="modal__title">About</h2>
          <button type="button" class="modal__close" aria-label="Close" @click="aboutOpen = false">×</button>
        </div>
        <div class="modal__body">
          <table class="about-table">
            <thead>
              <tr><th colspan="2">Server</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Version</td>
                <td class="about-table__value">{{ serverInfo?.version ?? '—' }}</td>
              </tr>
              <tr>
                <td>Built at</td>
                <td class="about-table__value">{{ serverInfo?.builtAt ? new Date(serverInfo.builtAt).toLocaleString() : '—' }}</td>
              </tr>
            </tbody>
            <thead>
              <tr><th colspan="2">Client</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Version</td>
                <td class="about-table__value">{{ appVersion }}</td>
              </tr>
              <tr>
                <td>Built at</td>
                <td class="about-table__value">{{ new Date(appBuildAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
