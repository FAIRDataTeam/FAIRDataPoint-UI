import { ref, computed } from 'vue'

const SESSION_TOKEN_KEY = 'fdp_token'
const SESSION_EMAIL_KEY = 'fdp_email'

// Singleton auth state — shared across all components
const token = ref<string | null>(sessionStorage.getItem(SESSION_TOKEN_KEY))
const userEmail = ref<string | null>(sessionStorage.getItem(SESSION_EMAIL_KEY))
const isLoggedIn = computed(() => token.value !== null)

function userInitials(email: string | null): string {
  if (!email) return '?'
  const name = email.split('@')[0] ?? ''
  const parts = name.split(/[.\-_]/)
  const a = parts[0]?.[0] ?? ''
  const b = parts[1]?.[0] ?? ''
  if (a && b) return (a + b).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function useAuth() {
  async function login(email: string, password: string): Promise<void> {
    const baseUrl = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? 'Invalid email or password'
          : `Login failed (HTTP ${response.status})`,
      )
    }

    const data = (await response.json()) as { token: string }
    token.value = data.token
    userEmail.value = email
    sessionStorage.setItem(SESSION_TOKEN_KEY, data.token)
    sessionStorage.setItem(SESSION_EMAIL_KEY, email)
  }

  function logout() {
    token.value = null
    userEmail.value = null
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
    sessionStorage.removeItem(SESSION_EMAIL_KEY)
  }

  return {
    token,
    userEmail,
    isLoggedIn,
    userInitials,
    login,
    logout,
  }
}
