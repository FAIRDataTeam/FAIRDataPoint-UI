import { ref, computed } from 'vue'
import { fetchToken, fetchCurrentUser, setAuthToken } from './fdpApi'
import { bindOperation, type OperationBinding } from './apiDocs'
import { getRootUri } from './urlUtils'
import { configReady } from '@/config'

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

/**
 * Resolved once, reused for gating (loginAvailable) and login()'s actual request. Awaits
 * configReady since this evaluates before config loads (see config.ts); can reject if
 * generateToken isn't offered (see apiDocs.ts's bindOperation).
 */
const generateTokenBinding: Promise<OperationBinding> = (async () => {
  await configReady
  return bindOperation(getRootUri(), 'generateToken')
})()

/**
 * Same as generateTokenBinding, for the current-authenticated-user endpoint. Only awaited
 * conditionally though (authReady when a session exists; login() when someone logs in), so a
 * rejection could go unobserved otherwise; the no-op .catch() below just marks it as observed
 * without changing what real consumers see.
 */
const getUserCurrentBinding: Promise<OperationBinding> = (async () => {
  await configReady
  return bindOperation(getRootUri(), 'getUserCurrent')
})()
getUserCurrentBinding.catch(() => {})

/** Controls whether the login button is shown, based on whether this FDP's OpenAPI doc actually offers token-based login. */
export const loginAvailable = ref(false)

/**
 * Resolves once login availability is known; the router guard awaits it before allowing /login.
 * generateTokenBinding rejects if login isn't offered (or couldn't be confirmed), in which case
 * this resolves to false rather than propagating the rejection.
 */
export const loginAvailabilityChecked: Promise<boolean> = generateTokenBinding
  .then(() => {
    loginAvailable.value = true
    return true
  })
  .catch(() => {
    loginAvailable.value = false
    return false
  })

function clearSession() {
  token.value = null
  userEmail.value = null
  user.value = null
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  sessionStorage.removeItem(SESSION_EMAIL_KEY)
  setAuthToken(null)
}

/** Resolves once the current user is loaded for an existing session; app mounting waits on this. */
export const authReady: Promise<void> = token.value
  ? getUserCurrentBinding
      .then((binding) => fetchCurrentUser(binding.url))
      .then((u) => {
        user.value = u as User
      })
      .catch(() => clearSession())
  : Promise.resolve()

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
    const { url, method } = await generateTokenBinding
    const newToken = await fetchToken(email, password, url, method)
    setAuthToken(newToken)
    try {
      const currentUserUrl = (await getUserCurrentBinding).url
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

  /** Updates the cached current user after a self-service profile edit. */
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
