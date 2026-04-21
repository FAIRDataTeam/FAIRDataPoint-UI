<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router'
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
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
