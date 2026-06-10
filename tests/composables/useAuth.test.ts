import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuth } from '../../src/composables/useAuth'

vi.hoisted(() => {
  const store: Record<string, string> = {}
  globalThis.sessionStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  } as Storage
})

// login

describe('login', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FDP_BASE_URL', 'http://localhost')
  })

  afterEach(() => {
    useAuth().logout()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sets token, email, and isLoggedIn on success', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).endsWith('/tokens')
          ? { token: 'efIobn394nvJJFJ30...' }
          : { uuid: '1', firstName: 'Albert', lastName: 'Einstein', email: 'user@example.com', role: 'USER' },
    }))
    const { login, token, userEmail, isLoggedIn } = useAuth()
    await login('user@example.com', 'secret')
    expect(token.value).toBe('efIobn394nvJJFJ30...')
    expect(userEmail.value).toBe('user@example.com')
    expect(isLoggedIn.value).toBe(true)
  })

  it('sets user and isAdmin after successful login', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).endsWith('/tokens')
          ? { token: 'tok123' }
          : { uuid: 'u1', firstName: 'Albert', lastName: 'Einstein', email: 'a@example.com', role: 'ADMIN' },
    }))
    const { login, user, isAdmin } = useAuth()
    await login('a@example.com', 'secret')
    expect(user.value).toMatchObject({ firstName: 'Albert', lastName: 'Einstein', role: 'ADMIN' })
    expect(isAdmin.value).toBe(true)
  })

  it('clears session and rejects when /users/current fails', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).endsWith('/tokens')) return { ok: true, json: async () => ({ token: 'tok123' }) }
      return { ok: false, status: 500 }
    })
    const { login, token, user, isLoggedIn } = useAuth()
    await expect(login('a@example.com', 'secret')).rejects.toThrow()
    expect(token.value).toBeNull()
    expect(user.value).toBeNull()
    expect(isLoggedIn.value).toBe(false)
  })

  it('throws "Invalid email or password" on 401', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 401 }))
    const { login } = useAuth()
    await expect(login('user@example.com', 'wrong')).rejects.toThrow('Invalid email or password')
  })

  it('throws "Login failed" on other HTTP errors', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }))
    const { login } = useAuth()
    await expect(login('user@example.com', 'secret')).rejects.toThrow('Login failed (HTTP 500)')
  })

  it('posts credentials to the tokens endpoint', async () => {
    const mockFetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).endsWith('/tokens')
          ? { token: 'efIobn394nvJJFJ30...' }
          : { uuid: '1', firstName: 'A', lastName: 'B', email: 'user@example.com', role: 'USER' },
    }))
    vi.stubGlobal('fetch', mockFetch)
    const { login } = useAuth()
    await login('user@example.com', 'secret')
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'secret' }),
    })
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost/users/current', {
      headers: { Accept: 'application/json', Authorization: 'Bearer efIobn394nvJJFJ30...' },
    })
  })
})

// logout

describe('logout', () => {

  beforeEach(() => {
    vi.stubEnv('VITE_FDP_BASE_URL', 'http://localhost')
  })

  afterEach(() => {
    useAuth().logout()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('clears token, email, and isLoggedIn', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).endsWith('/tokens')
          ? { token: 'efIobn394nvJJFJ30...' }
          : { uuid: '1', firstName: 'A', lastName: 'B', email: 'user@example.com', role: 'USER' },
    }))
    const { login, logout, token, userEmail, isLoggedIn } = useAuth()
    await login('user@example.com', 'secret')
    logout()
    expect(token.value).toBeNull()
    expect(userEmail.value).toBeNull()
    expect(isLoggedIn.value).toBe(false)
  })
})

// userInitials

describe('userInitials', () => {
  const { userInitials } = useAuth()

  it('returns "?" for null', () => {
    expect(userInitials(null)).toBe('?')
  })

  it('returns initials from dot-separated name parts', () => {
    expect(userInitials('albert.einstein@example.com')).toBe('AE')
  })

  it('returns initials from underscore-separated name parts', () => {
    expect(userInitials('nikola_tesla@example.com')).toBe('NT')
  })

  it('returns initials from hyphen-separated name parts', () => {
    expect(userInitials('nikola-tesla@example.com')).toBe('NT')
  })

  it('returns first two characters when name has no separator', () => {
    expect(userInitials('albert@example.com')).toBe('AL')
  })
})
