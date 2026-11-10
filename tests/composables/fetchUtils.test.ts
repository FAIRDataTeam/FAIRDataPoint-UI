import { describe, it, expect, vi, afterEach } from 'vitest'
import { request, withDeadline } from '../../src/composables/fetchUtils'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('withDeadline', () => {
  it('returns the result and clears its timer when work completes', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined

    await expect(
      withDeadline(100, 'Too slow', async (currentSignal) => {
        signal = currentSignal
        return 42
      }),
    ).resolves.toBe(42)

    expect(signal?.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with the supplied message and aborts the signal at the deadline', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const result = expect(
      withDeadline(100, 'Too slow', (currentSignal) => {
        signal = currentSignal
        return new Promise(() => {})
      }),
    ).rejects.toThrow('Too slow')

    await vi.advanceTimersByTimeAsync(100)
    await result
    expect(signal?.aborted).toBe(true)
    expect(signal?.reason).toEqual(new Error('Too slow'))
    expect(vi.getTimerCount()).toBe(0)
  })
})

/** A response whose body reports whether it was cancelled. */
function responseWithBody(status: number) {
  const cancel = vi.fn()
  const body = new ReadableStream({ cancel })
  return { response: new Response(body, { status }), cancel }
}

describe('request', () => {
  it('cancels the unread body of an error response before throwing', async () => {
    const { response, cancel } = responseWithBody(405)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(request('http://localhost/members')).rejects.toThrow('HTTP 405')
    expect(cancel).toHaveBeenCalled()
  })

  it('preserves the HTTP status when the response body has already errored', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('Response body stream failed'))
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 403 })))

    await expect(request('http://localhost/members')).rejects.toThrow('HTTP 403')
  })

  it('leaves the body of a successful response readable', async () => {
    const { response, cancel } = responseWithBody(200)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    const result = await request('http://localhost/meta')
    expect(result.bodyUsed).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
  })
})
