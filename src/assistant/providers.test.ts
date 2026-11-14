import { afterEach, describe, expect, it, vi } from 'vitest'
import { callModel } from './providers'

afterEach(() => vi.unstubAllGlobals())

const stubFetch = (res: object | number) => {
  const fetch = vi.fn(async () => ({
    ok: typeof res !== 'number', status: typeof res === 'number' ? res : 200,
    json: async () => (typeof res === 'number' ? { error: { message: 'boom' } } : res),
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const base = { apiKey: 'KEY', model: 'm', system: 'SYS', messages: [{ role: 'user' as const, text: 'hi' }] }

describe('callModel anthropic', () => {
  it('posts to /v1/messages with the browser-access header and reads tool_use + text', async () => {
    const fetch = stubFetch({
      content: [
        { type: 'text', text: 'Here is a tone.' },
        { type: 'tool_use', input: { from_scratch: false, amp: { gain: 80 } } },
      ],
    })
    const r = await callModel({ ...base, provider: 'anthropic' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const h = init.headers as Record<string, string>
    expect(h['x-api-key']).toBe('KEY')
    expect(h['anthropic-version']).toBe('2023-06-01')
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.tools[0].name).toBe('set_tone')
    expect(r.text).toBe('Here is a tone.')
    expect(r.tone).toEqual({ from_scratch: false, amp: { gain: 80 } })
  })

  it('returns tone null for a text-only answer', async () => {
    stubFetch({ content: [{ type: 'text', text: 'What amp?' }] })
    const r = await callModel({ ...base, provider: 'anthropic' })
    expect(r.tone).toBeNull()
    expect(r.text).toBe('What amp?')
  })
})

describe('callModel openai', () => {
  it('posts to /v1/responses with a strict function tool and reads function_call + output_text', async () => {
    const fetch = stubFetch({
      output: [
        { type: 'message', content: [{ type: 'output_text', text: 'Try this.' }] },
        { type: 'function_call', name: 'set_tone', arguments: '{"amp":{"gain":60}}' },
      ],
    })
    const r = await callModel({ ...base, provider: 'openai' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer KEY')
    const body = JSON.parse(init.body as string)
    expect(body.instructions).toBe('SYS')
    expect(body.input).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'set_tone', strict: true })
    expect(r.text).toBe('Try this.')
    expect(r.tone).toEqual({ amp: { gain: 60 } })
  })
})

describe('errors', () => {
  it('401 is a readable key error; a failed fetch is a connection error', async () => {
    stubFetch(401)
    await expect(callModel({ ...base, provider: 'anthropic' })).rejects.toThrow('The API key was rejected')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(callModel({ ...base, provider: 'openai' })).rejects.toThrow('Could not reach OpenAI')
    await expect(callModel({ ...base, provider: 'anthropic' })).rejects.toThrow('Could not reach Anthropic')
  })
})
