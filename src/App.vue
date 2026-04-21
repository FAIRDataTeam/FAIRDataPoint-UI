<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import { useAuth } from './composables/useAuth'

const { isLoggedIn, userEmail, userInitials, logout } = useAuth()

const menuOpen = ref(false)

function handleLogout() {
  menuOpen.value = false
  logout()
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
