import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  useAuth as UseAuth,
  userInitials as UserInitials,
} from '../../src/composables/useAuth'

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
    clear: () => {
      for (const key of Object.keys(store)) delete store[key]
    },
  } as Storage
})

const apiDocsFixture: unknown = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/api-docs.json'), 'utf-8'),
)

/**
 * login()/authReady resolve generateToken and getUserCurrent via bindOperation before making the
 * real request, so tests need to mock that resolution too (root Turtle fetch + /v3/api-docs
 * fetch), not just the /tokens and /users/current calls themselves. handleAction covers only the
 * latter; discovery is mocked identically for every test here, so it's factored out.
 */
function mockLoginFetch(
  handleAction: (url: string, init?: RequestInit) => Promise<unknown> | unknown,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const accept = (init?.headers as Record<string, string> | undefined)?.Accept
    if (accept === 'text/turtle') return { ok: true, text: async () => '' }
    if (url === 'http://localhost/v3/api-docs')
      return { ok: true, json: async () => apiDocsFixture }
    return handleAction(url, init)
  })
}

// apiDocsReady starts when useAuth.ts imports apiDocs.ts, so tests that exercise
// login/authReady must install fetch mocks before dynamically importing useAuth.ts.
beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 0 }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('login', () => {
  it('sets token, email, and isLoggedIn on success', async () => {
    vi.stubGlobal(
      'fetch',
      mockLoginFetch(async (url) => ({
        ok: true,
        json: async () =>
          String(url).endsWith('/tokens')
            ? { token: 'efIobn394nvJJFJ30...' }
            : {
                uuid: '1',
                firstName: 'Albert',
                lastName: 'Einstein',
                email: 'user@example.com',
                role: 'USER',
              },
      })),
    )
    const { useAuth } = await import('../../src/composables/useAuth')
    const { login, token, userEmail, isLoggedIn } = useAuth()
    await login('user@example.com', 'secret')
    expect(token.value).toBe('efIobn394nvJJFJ30...')
    expect(userEmail.value).toBe('user@example.com')
    expect(isLoggedIn.value).toBe(true)
  })

  it('sets user and isAdmin after successful login', async () => {
    vi.stubGlobal(
      'fetch',
      mockLoginFetch(async (url) => ({
        ok: true,
        json: async () =>
          String(url).endsWith('/tokens')
            ? { token: 'tok123' }
            : {
                uuid: 'u1',
                firstName: 'Albert',
                lastName: 'Einstein',
                email: 'a@example.com',
                role: 'ADMIN',
              },
      })),
    )
    const { useAuth } = await import('../../src/composables/useAuth')
    const { login, user, isAdmin } = useAuth()
    await login('a@example.com', 'secret')
    expect(user.value).toMatchObject({ firstName: 'Albert', lastName: 'Einstein', role: 'ADMIN' })
    expect(isAdmin.value).toBe(true)
  })

  it('clears session and rejects when /users/current fails', async () => {
    vi.stubGlobal(
      'fetch',
      mockLoginFetch(async (url) => {
        if (String(url).endsWith('/tokens'))
          return { ok: true, json: async () => ({ token: 'tok123' }) }
        return { ok: false, status: 500 }
      }),
    )
    const { useAuth } = await import('../../src/composables/useAuth')
    const { login, token, user, isLoggedIn } = useAuth()
    await expect(login('a@example.com', 'secret')).rejects.toThrow()
    expect(token.value).toBeNull()
    expect(user.value).toBeNull()
    expect(isLoggedIn.value).toBe(false)
  })

  it('throws "Invalid email or password" on 401', async () => {
    vi.stubGlobal(
      'fetch',
      mockLoginFetch(async () => ({ ok: false, status: 401 })),
    )
    const { useAuth } = await import('../../src/composables/useAuth')
    const { login } = useAuth()
    await expect(login('user@example.com', 'wrong')).rejects.toThrow('Invalid email or password')
  })

  it('throws "Login failed" on other HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      mockLoginFetch(async () => ({ ok: false, status: 500 })),
    )
    const { useAuth } = await import('../../src/composables/useAuth')
    const { login } = useAuth()
    await expect(login('user@example.com', 'secret')).rejects.toThrow('Login failed (HTTP 500)')
  })

  it('posts credentials to the tokens endpoint', async () => {
    const mockFetch = mockLoginFetch(async (url) => ({
      ok: true,
      json: async () =>
        String(url).endsWith('/tokens')
          ? { token: 'efIobn394nvJJFJ30...' }
          : { uuid: '1', firstName: 'A', lastName: 'B', email: 'user@example.com', role: 'USER' },
    }))
    vi.stubGlobal('fetch', mockFetch)
    const { useAuth } = await import('../../src/composables/useAuth')
    const { login } = useAuth()
    await login('user@example.com', 'secret')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'secret' }),
    })
    expect(mockFetch).toHaveBeenCalledWith('http://localhost/users/current', {
      headers: { Accept: 'application/json', Authorization: 'Bearer efIobn394nvJJFJ30...' },
    })
  })
})

describe('logout', () => {
  it('clears token, email, and isLoggedIn', async () => {
    vi.stubGlobal(
      'fetch',
      mockLoginFetch(async (url) => ({
        ok: true,
        json: async () =>
          String(url).endsWith('/tokens')
            ? { token: 'efIobn394nvJJFJ30...' }
            : { uuid: '1', firstName: 'A', lastName: 'B', email: 'user@example.com', role: 'USER' },
      })),
    )
    const { useAuth } = await import('../../src/composables/useAuth')
    const { login, logout, token, userEmail, isLoggedIn } = useAuth()
    await login('user@example.com', 'secret')
    logout()
    expect(token.value).toBeNull()
    expect(userEmail.value).toBeNull()
    expect(isLoggedIn.value).toBe(false)
  })
})

describe('updateCurrentUser', () => {
  let useAuth: typeof UseAuth

  beforeEach(async () => {
    ;({ useAuth } = await import('../../src/composables/useAuth'))
  })

  it('updates user and userEmail', () => {
    const { updateCurrentUser, user, userEmail } = useAuth()
    updateCurrentUser({
      uuid: 'u1',
      firstName: 'Nikola',
      lastName: 'Tesla',
      email: 'nikola.tesla@example.com',
      role: 'USER',
    })
    expect(user.value).toMatchObject({ firstName: 'Nikola', lastName: 'Tesla' })
    expect(userEmail.value).toBe('nikola.tesla@example.com')
  })
})

describe('userInitials', () => {
  let userInitials: typeof UserInitials

  beforeEach(async () => {
    ;({ userInitials } = await import('../../src/composables/useAuth'))
  })

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
