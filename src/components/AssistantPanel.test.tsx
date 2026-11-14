// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICES } from '../protocol/packets'
import { newPreset, type Preset } from '../protocol/preset'
import { toRaw } from '../assistant/tone'
import { AssistantPanel } from './AssistantPanel'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const DEVICE = DEVICES[2]

const setKey = () => localStorage.setItem('mustang.assistant', JSON.stringify({ keys: { anthropic: 'KEY' } }))

function setup(reply: object | (() => object) = { text: 'More gain.', tone: { explanation: 'More gain.', from_scratch: false, amp: { gain: 80 } } }) {
  const callModel = vi.fn(async () => (typeof reply === 'function' ? reply() : reply))
  const onApply = vi.fn()
  const editor: Preset = newPreset('Editor')
  editor.amp.gain = toRaw(50)
  render(<AssistantPanel device={DEVICE} editor={editor} onApply={onApply} onClose={() => {}} callModel={callModel} />)
  return { callModel, onApply, editor }
}

const type = async (text: string) => {
  const user = userEvent.setup()
  const box = screen.getByPlaceholderText(/describe the sound/i)
  await user.type(box, `${text}{Enter}`)
}

describe('AssistantPanel', () => {
  it('shows the settings and the key notice when no key is stored', () => {
    render(<AssistantPanel device={DEVICE} editor={newPreset()} onApply={() => {}} onClose={() => {}} callModel={vi.fn()} />)
    expect(screen.getByText('Provider')).toBeTruthy()
    expect(screen.getByText(/API key is needed/)).toBeTruthy()
  })

  it('sends a prompt and shows a proposal card with the changes; Apply loads the preset', async () => {
    setKey()
    const s = setup()
    await type('more distortion')
    await screen.findByText('More gain.')
    expect(await screen.findByText('Amp Gain')).toBeTruthy()
    expect(s.callModel).toHaveBeenCalledOnce()
    await userEvent.setup().click(screen.getByText('Apply'))
    expect(s.onApply).toHaveBeenCalledOnce()
    const applied = s.onApply.mock.calls[0][0] as Preset
    expect(applied.amp.gain).toBe(toRaw(80))
    expect(await screen.findByText('Applied')).toBeTruthy()
    // Undo restores the editor preset.
    await userEvent.setup().click(screen.getByText('Undo'))
    expect(s.onApply).toHaveBeenCalledTimes(2)
    expect((s.onApply.mock.calls[1][0] as Preset).amp.gain).toBe(toRaw(50))
  })

  it('Discard marks the card and it can no longer be applied', async () => {
    setKey()
    setup()
    await type('more distortion')
    await screen.findByText('More gain.')
    await userEvent.setup().click(screen.getByText('Discard'))
    expect(await screen.findByText('Discarded')).toBeTruthy()
    expect(screen.queryByText('Apply')).toBeNull()
  })

  it('retries once when the proposed settings have errors', async () => {
    setKey()
    const callModel = vi.fn()
      .mockResolvedValueOnce({ text: 'bad', tone: { explanation: 'bad', from_scratch: false, amp: { model: 'Nope' } } })
      .mockResolvedValueOnce({ text: 'good', tone: { explanation: 'good', from_scratch: false, amp: { gain: 70 } } })
    const onApply = vi.fn()
    render(<AssistantPanel device={DEVICE} editor={newPreset()} onApply={onApply} onClose={() => {}} callModel={callModel} />)
    await type('more gain')
    expect(await screen.findByText('good')).toBeTruthy()
    expect(callModel).toHaveBeenCalledTimes(2)
    const retryMsg = (callModel.mock.calls[1][0] as { messages: { text: string }[] }).messages.at(-1)!.text
    expect(retryMsg).toMatch(/problems/)
  })

  it('persists settings changes to localStorage', async () => {
    render(<AssistantPanel device={DEVICE} editor={newPreset()} onApply={() => {}} onClose={() => {}} callModel={vi.fn()} />)
    const user = userEvent.setup()
    const keyInput = screen.getByPlaceholderText('sk-ant-…')
    await user.type(keyInput, 'abc')
    await waitFor(() => {
      const s = JSON.parse(localStorage.getItem('mustang.assistant')!)
      expect(s.keys.anthropic).toBe('abc')
    }, { timeout: 3000 })
  })
})
