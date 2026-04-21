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
  </div>
</template>
