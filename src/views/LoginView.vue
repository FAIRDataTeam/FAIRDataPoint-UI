<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { login } = useAuth()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function submit() {
  error.value = null
  loading.value = true
  try {
    await login(email.value, password.value)
    await router.push('/')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page-container login-page">
    <section class="login-card">
      <h1 class="login-title">Login</h1>

      <form class="login-form" @submit.prevent="submit">
        <label class="login-label" for="login-email">Email</label>
        <input
          id="login-email"
          v-model="email"
          class="login-input"
          type="email"
          autocomplete="email"
          required
        />

        <label class="login-label" for="login-password">Password</label>
        <input
          id="login-password"
          v-model="password"
          class="login-input"
          type="password"
          autocomplete="current-password"
          required
        />

        <p v-if="error" class="alert alert-danger">{{ error }}</p>

        <button type="submit" class="login-submit" :disabled="loading">
          {{ loading ? 'Logging in…' : 'Login' }}
        </button>
      </form>
    </section>
  </main>
</template>
