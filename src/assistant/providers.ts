// Calls Anthropic or OpenAI straight from the browser with plain fetch. The user supplies
// their own API key. One tool: set_tone.
import { SET_TONE_SCHEMA } from './tone'

export type Provider = 'anthropic' | 'openai'

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-6.1-sol',
}

export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export interface CallModelArgs {
  provider: Provider
  apiKey: string
  model: string
  system: string
  messages: ChatTurn[]
  signal?: AbortSignal
}
export interface CallModelResult { text: string; tone: unknown | null }

const TOOL_NAME = 'set_tone'
const TOOL_DESCRIPTION = "Set the editor's amp and effect settings"

async function readError(res: Response, provider: Provider): Promise<Error> {
  let detail = ''
  try {
    const data = await res.json() as { error?: { message?: string } }
    detail = data?.error?.message ?? ''
  } catch { /* not json */ }
  if (res.status === 401 || res.status === 403) return new Error('The API key was rejected. Check it in the assistant settings.')
  if (res.status === 429) return new Error(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} rate limit reached. Wait a moment and try again.`)
  return new Error(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} error ${res.status}${detail ? `: ${detail}` : ''}`)
}

async function callAnthropic(a: CallModelArgs): Promise<CallModelResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: a.signal,
    headers: {
      'x-api-key': a.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: a.model,
      max_tokens: 4096,
      system: a.system,
      messages: a.messages.map((m) => ({ role: m.role, content: m.text })),
      tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: SET_TONE_SCHEMA }],
      tool_choice: { type: 'auto' },
    }),
  })
  if (!res.ok) throw await readError(res, 'anthropic')
  const data = await res.json() as { content?: { type: string; text?: string; input?: unknown }[] }
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
  const tool = (data.content ?? []).find((b) => b.type === 'tool_use' )
  return { text, tone: tool?.input ?? null }
}

async function callOpenAI(a: CallModelArgs): Promise<CallModelResult> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal: a.signal,
    headers: { 'Authorization': `Bearer ${a.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: a.model,
      instructions: a.system,
      input: a.messages.map((m) => ({ role: m.role, content: m.text })),
      tools: [{ type: 'function', name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: SET_TONE_SCHEMA, strict: true }],
      tool_choice: 'auto',
    }),
  })
  if (!res.ok) throw await readError(res, 'openai')
  const data = await res.json() as {
    output?: {
      type: string; name?: string; arguments?: string;
      content?: { type: string; text?: string }[]
    }[]
  }
  let text = ''
  let tone: unknown | null = null
  for (const item of data.output ?? []) {
    if (item.type === 'function_call' && item.name === TOOL_NAME && item.arguments) {
      try { tone = JSON.parse(item.arguments) } catch { tone = null }
    }
    if (item.type === 'message') {
      for (const c of item.content ?? []) if (c.type === 'output_text' && c.text) text += (text ? '\n' : '') + c.text
    }
  }
  return { text: text.trim(), tone }
}

export async function callModel(a: CallModelArgs): Promise<CallModelResult> {
  try {
    return a.provider === 'anthropic' ? await callAnthropic(a) : await callOpenAI(a)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    if (e instanceof Error && !(e instanceof TypeError)) throw e
    const name = a.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
    throw new Error(`Could not reach ${name}. The assistant needs an internet connection.`)
  }
}
