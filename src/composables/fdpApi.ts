let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

export async function fetchRdf(uri: string, accept: string): Promise<string> {
  const headers: Record<string, string> = { Accept: accept }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(uri, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

export async function fetchRdfText(uri: string): Promise<string> {
  return fetchRdf(uri, 'text/turtle')
}

export async function searchResources(query: string): Promise<unknown[]> {
  const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(`${base}/search?page=0&size=20`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Search failed (HTTP ${response.status})`)
  return response.json() as Promise<unknown[]>
}

export async function fetchToken(email: string, password: string): Promise<string> {
  const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
  const response = await fetch(`${base}/tokens`, {
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
  return data.token
}
