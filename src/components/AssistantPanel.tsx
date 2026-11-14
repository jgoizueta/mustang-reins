import { useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, Send, Settings, Trash2, X } from 'lucide-react'
import type { DeviceInfo } from '../protocol/packets'
import type { Preset } from '../protocol/preset'
import { readJson, writeJson } from '../amp/storage'
import { useLibrary } from '../library/store'
import {
  applyTone, describeCatalog, presetToTone, type ToneChange, type TonePatch,
} from '../assistant/tone'
import { TONE_GUIDE } from '../assistant/prompt'
import { findExamples } from '../assistant/examples'
import {
  callModel, DEFAULT_MODELS, type CallModelArgs, type CallModelResult, type ChatTurn, type Provider,
} from '../assistant/providers'
import { Button, Select } from './ui'

const SETTINGS_KEY = 'mustang.assistant'

interface AssistantSettings {
  provider: Provider
  models: Record<Provider, string>
  keys: Record<Provider, string>
}

const readSettings = (): AssistantSettings => {
  const s = readJson<Partial<AssistantSettings>>(SETTINGS_KEY, {})
  return {
    provider: s.provider === 'openai' ? 'openai' : 'anthropic',
    models: { ...DEFAULT_MODELS, ...(s.models ?? {}) },
    keys: { anthropic: '', openai: '', ...(s.keys ?? {}) },
  }
}

export interface Proposal {
  patch: TonePatch
  changes: ToneChange[]
  status: 'pending' | 'applied' | 'discarded'
  before?: Preset
}

type Msg =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; proposal?: Proposal; turnIndex: number }
  | { kind: 'error'; text: string }

type Caller = (a: CallModelArgs) => Promise<CallModelResult>

interface Props {
  device: DeviceInfo
  editor: Preset
  onApply: (preset: Preset) => void
  onClose: () => void
  callModel?: Caller
}

export function AssistantPanel({ device, editor, onApply, onClose, callModel: callerProp }: Props) {
  const caller: Caller = callerProp ??
    ((window as { __mustangAssistantFake?: Caller }).__mustangAssistantFake) ?? callModel
  const [settings, setSettings] = useState<AssistantSettings>(readSettings)
  const [showSettings, setShowSettings] = useState(() => {
    const s = readSettings()
    return !s.keys[s.provider]
  })
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastApplied, setLastApplied] = useState<number | null>(null)
  const turns = useRef<ChatTurn[]>([])
  const editorRef = useRef(editor)
  const abort = useRef<AbortController | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const lib = useLibrary()
  const libEntries = useRef(lib.entries)
  useEffect(() => {
    editorRef.current = editor
    libEntries.current = lib.entries
  })

  const apiKey = settings.keys[settings.provider]
  const model = settings.models[settings.provider] || DEFAULT_MODELS[settings.provider]
  const save = (next: AssistantSettings) => { setSettings(next); writeJson(SETTINGS_KEY, next) }

  useEffect(() => {
    list.current?.scrollTo?.({ top: list.current.scrollHeight })
  }, [msgs.length, busy])

  const push = (m: Msg) => setMsgs((all) => [...all, m])

  const send = async () => {
    const text = input.trim()
    if (!text || busy || !apiKey) return
    push({ kind: 'user', text })
    setInput('')
    setBusy(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      // Library examples that match the request.
      const picked = findExamples(libEntries.current, text)
      const examplesText = picked.length
        ? picked.map((e) => {
            const p = e.preset
            const desc = p.fuseInfo?.description ? ` Description: ${p.fuseInfo.description}` : ''
            return `Library example "${p.name}": ${JSON.stringify(presetToTone(p, device))}${desc}`
          }).join('\n') + '\n\n'
        : ''

      const last = `${examplesText}Current editor preset:\n${JSON.stringify(presetToTone(editorRef.current, device))}\n\nRequest: ${text}`
      const base = { provider: settings.provider, apiKey, model, system: `${TONE_GUIDE}\n\n${describeCatalog(device)}`, signal: ctrl.signal }
      let reply = await caller({ ...base, messages: [...turns.current, { role: 'user', text: last }] })
      turns.current.push({ role: 'user', text })

      let patch = reply.tone as TonePatch | null
      let result = patch ? applyTone(editorRef.current, patch, device) : null
      if (result?.errors.length) {
        // One retry telling the model what was wrong.
        reply = await caller({
          ...base,
          messages: [...turns.current, {
            role: 'user',
            text: `${last}\n\nYour last answer had these problems: ${result.errors.join('; ')}. Call set_tone again with corrected values.`,
          }],
        })
        patch = reply.tone as TonePatch | null
        result = patch ? applyTone(editorRef.current, patch, device) : null
      }

      if (!patch) {
        turns.current.push({ role: 'assistant', text: reply.text || '(no answer)' })
        push({ kind: 'assistant', text: reply.text || 'The assistant gave no answer.', turnIndex: turns.current.length - 1 })
      } else if (result!.errors.length) {
        turns.current.push({ role: 'assistant', text: `Settings failed: ${result!.errors.join('; ')}` })
        push({ kind: 'error', text: `The proposed settings had problems: ${result!.errors.join('; ')}` })
      } else {
        const explanation = patch.explanation || reply.text || ''
        const summary = result!.changes.slice(0, 3).map((c) => `${c.label} → ${c.to}`).join(', ')
        turns.current.push({ role: 'assistant', text: `${explanation} (${summary}${result!.changes.length > 3 ? ', …' : ''}) (not applied)` })
        push({ kind: 'assistant', text: explanation, proposal: { patch, changes: result!.changes, status: 'pending' }, turnIndex: turns.current.length - 1 })
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') push({ kind: 'error', text: 'Cancelled.' })
      else push({ kind: 'error', text: (e as Error).message })
    } finally {
      abort.current = null
      setBusy(false)
    }
  }

  const apply = (mi: number, m: Extract<Msg, { kind: 'assistant' }>) => {
    if (!m.proposal) return
    const before = editorRef.current
    const result = applyTone(before, m.proposal.patch, device)
    if (result.errors.length) {
      setMsgs((all) => all.map((x, i) => i === mi ? { kind: 'error', text: `Could not apply: ${result.errors.join('; ')}` } : x))
      return
    }
    onApply(result.preset)
    setMsgs((all) => all.map((x, i) => i === mi && x.kind === 'assistant' && x.proposal
      ? { ...x, proposal: { ...x.proposal, status: 'applied' as const, before, changes: result.changes } }
      : x))
    const t = turns.current[m.turnIndex]
    if (t) t.text = t.text.replace('(not applied)', '(applied)')
    setLastApplied(mi)
  }

  const undo = (mi: number, m: Extract<Msg, { kind: 'assistant' }>) => {
    if (!m.proposal?.before) return
    onApply(m.proposal.before)
    setMsgs((all) => all.map((x, i) => i === mi && x.kind === 'assistant' && x.proposal
      ? { ...x, proposal: { ...x.proposal, status: 'pending' as const, before: undefined } }
      : x))
    const t = turns.current[m.turnIndex]
    if (t) t.text = t.text.replace('(applied)', '(not applied)')
    setLastApplied(null)
  }

  const discard = (mi: number) => setMsgs((all) => all.map((x, i) => i === mi && x.kind === 'assistant' && x.proposal
    ? { ...x, proposal: { ...x.proposal, status: 'discarded' as const } } : x))

  const newConversation = () => { setMsgs([]); turns.current = []; setLastApplied(null) }

  const settingsPanel = (
    <div className="space-y-3 border-b border-border p-3 text-xs">
      <div>
        <div className="text-label mb-1">Provider</div>
        <Select value={settings.provider} onChange={(v) => save({ ...settings, provider: v as Provider })}
          options={[{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI' }]} />
      </div>
      <div>
        <div className="text-label mb-1">Model</div>
        <input value={model} onChange={(e) => save({ ...settings, models: { ...settings.models, [settings.provider]: e.target.value } })}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
      </div>
      <div>
        <div className="text-label mb-1">API key</div>
        <input type="password" value={apiKey} placeholder={settings.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          onChange={(e) => save({ ...settings, keys: { ...settings.keys, [settings.provider]: e.target.value } })}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
        <p className="mt-1 text-[10px] text-muted-foreground">
          The key stays in this browser and goes only to {settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}.
        </p>
        {!apiKey && <p className="mt-1 text-[10px] text-destructive">An API key is needed to use the assistant.</p>}
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="text-label">Tone assistant</div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" className="h-7 w-7 rounded-md" title="Assistant settings"
            aria-pressed={showSettings} onClick={() => setShowSettings((s) => !s)}><Settings /></Button>
          <Button variant="ghost" className="h-7 w-7 rounded-md" title="Close" onClick={onClose}><X /></Button>
        </div>
      </div>
      {showSettings && settingsPanel}

      <div ref={list} className="flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && !busy && (
          <p className="text-xs text-muted-foreground">
            Describe a sound, like “a not-too-clean sound with some David Gilmour reverb/echo”, or ask for a
            change, like “a bit more distortion and much more sustain”. Nothing is sent to the amp until
            you click Apply.
          </p>
        )}
        {msgs.map((m, i) => {
          if (m.kind === 'user') {
            return <div key={i} className="ml-8 rounded-md bg-primary/15 px-3 py-2 text-xs">{m.text}</div>
          }
          if (m.kind === 'error') {
            return <div key={i} className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{m.text}</div>
          }
          return (
            <div key={i} className="mr-8 space-y-2">
              {m.text && <div className="rounded-md bg-accent/60 px-3 py-2 text-xs">{m.text}</div>}
              {m.proposal && (
                <div className="rounded-md border border-border p-2">
                  <ul className="space-y-0.5 text-[11px]">
                    {m.proposal.changes.map((c, j) => (
                      <li key={j} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span className="truncate text-right">{c.from} → {c.to}</span>
                      </li>
                    ))}
                  </ul>
                  {m.proposal.status === 'pending' && (
                    <div className="mt-2 flex gap-2">
                      <Button variant="primary" className="h-6 rounded px-2 text-[11px]" onClick={() => apply(i, m)}>Apply</Button>
                      <Button variant="ghost" className="h-6 rounded px-2 text-[11px]" onClick={() => discard(i)}>Discard</Button>
                    </div>
                  )}
                  {m.proposal.status === 'applied' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-primary">Applied</span>
                      {lastApplied === i && (
                        <Button variant="ghost" className="h-6 rounded px-2 text-[11px]" onClick={() => undo(i, m)}>
                          <RotateCcw className="size-3" />Undo
                        </Button>
                      )}
                    </div>
                  )}
                  {m.proposal.status === 'discarded' && <div className="mt-2 text-[11px] text-muted-foreground">Discarded</div>}
                </div>
              )}
            </div>
          )
        })}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />Thinking…
            <Button variant="ghost" className="h-6 rounded px-2 text-[11px]" onClick={() => abort.current?.abort()}>Cancel</Button>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea value={input} rows={2} disabled={!apiKey}
            placeholder={apiKey ? 'Describe the sound…' : 'Set an API key first'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-50" />
          <Button variant="primary" className="h-8 w-8 rounded-md" title="Send" disabled={!apiKey || busy || !input.trim()}
            onClick={() => void send()}><Send /></Button>
        </div>
        <div className="mt-1.5 flex justify-end">
          <button type="button" onClick={newConversation}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
            <Trash2 className="size-3" />New conversation
          </button>
        </div>
      </div>
    </div>
  )
}
