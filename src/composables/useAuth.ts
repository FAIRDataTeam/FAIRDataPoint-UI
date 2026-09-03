import { ref, computed } from 'vue'
import { fetchToken, fetchCurrentUser, setAuthToken } from './fdpApi'
import { isOperationOffered, bindOperation } from './apiDocs'

// Mirrors UserDTO from the backend; role values come from the UserRole enum: ADMIN, USER.
export type User = {
  uuid: string
  firstName: string
  lastName: string
  email: string
  role: string
}

const SESSION_TOKEN_KEY = 'fdp_token'
const SESSION_EMAIL_KEY = 'fdp_email'

// Singleton auth state — shared across all components
const token = ref<string | null>(sessionStorage.getItem(SESSION_TOKEN_KEY))
const userEmail = ref<string | null>(sessionStorage.getItem(SESSION_EMAIL_KEY))
const user = ref<User | null>(null)
const isLoggedIn = computed(() => token.value !== null)
const isAdmin = computed(() => user.value?.role === 'ADMIN')

setAuthToken(token.value)

/** Drives the "Edit profile" affordance; the /users/current route guard checks the same operation. */
export const getUserCurrentAvailable = computed(() => isOperationOffered('getUserCurrent'))

/**
 * Drives the login button; the /login route guard checks the same operation, i.e. whether this
 * FDP's api-docs advertise token-based login.
 */
export const loginAvailable = computed(() => isOperationOffered('generateToken'))

function clearSession() {
  token.value = null
  userEmail.value = null
  user.value = null
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  sessionStorage.removeItem(SESSION_EMAIL_KEY)
  setAuthToken(null)
}

/** Resolves once the current user is loaded for an existing session; app mounting waits on this. */
export const authReady: Promise<void> = (async () => {
  if (!token.value) return
  try {
    const { url } = await bindOperation('getUserCurrent')
    user.value = (await fetchCurrentUser(url)) as User
  } catch {
    clearSession()
  }
})()

/**
 * Derives a deterministic two-tone gradient from an email, used as an avatar background.
 * Ported from the hash formula in the Vue2 client's Avatar component (fixed at full saturation).
 */
export function avatarColor(email: string): string {
  const hash = [...email].reduce((acc, c) => acc + 43 * c.charCodeAt(0), 0)
  const h1 = hash % 360
  const l1 = 85 + (hash % 11)
  const hash2 = hash + 60
  const h2 = hash2 % 360
  const l2 = 85 + (hash2 % 11)
  return `linear-gradient(45deg, hsl(${h1}, 100%, ${l1}%), hsl(${h2}, 100%, ${l2}%))`
}

/** Derives up to two initials from an email address for display in the avatar. */
export function userInitials(email: string | null): string {
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
    const { url, method } = await bindOperation('generateToken')
    const newToken = await fetchToken(email, password, url, method)
    setAuthToken(newToken)
    try {
      const currentUserUrl = (await bindOperation('getUserCurrent')).url
      const currentUser = (await fetchCurrentUser(currentUserUrl)) as User
      token.value = newToken
      userEmail.value = email
      user.value = currentUser
      sessionStorage.setItem(SESSION_TOKEN_KEY, newToken)
      sessionStorage.setItem(SESSION_EMAIL_KEY, email)
    } catch (err) {
      clearSession()
      throw err
    }
  }

  function logout() {
    clearSession()
  }

  /** Updates the cached current user after /users/current profile edits. */
  function updateCurrentUser(updated: User) {
    user.value = updated
    userEmail.value = updated.email
    sessionStorage.setItem(SESSION_EMAIL_KEY, updated.email)
  }

  return {
    token,
    userEmail,
    user,
    isLoggedIn,
    isAdmin,
    login,
    logout,
    updateCurrentUser,
  }
}
