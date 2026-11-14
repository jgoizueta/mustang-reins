// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMidi } from './useMidi'

class FakeInput {
  onmidimessage: ((e: unknown) => void) | null = null
  readonly id: string
  readonly name: string
  readonly manufacturer = 'Acme'
  constructor(id: string, name: string) {
    this.id = id
    this.name = name
  }
  send(...data: number[]) {
    this.onmidimessage?.({ target: this, data: new Uint8Array(data) })
  }
}

function install(inputs: FakeInput[], fail?: string) {
  const access = {
    inputs: new Map(inputs.map((i) => [i.id, i])),
    onstatechange: null as (() => void) | null,
  }
  const request = vi.fn(() => (fail ? Promise.reject(new Error(fail)) : Promise.resolve(access)))
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: request, configurable: true })
  return { access, request }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  // @ts-expect-error remove the fake
  delete navigator.requestMIDIAccess
})

describe('useMidi', () => {
  it('does nothing until enabled, then lists inputs, selects the first and remembers it', async () => {
    const a = new FakeInput('a', 'Port A'), b = new FakeInput('b', 'Port B')
    const { request } = install([a, b])
    const { result } = renderHook(() => useMidi(() => {}))
    expect(request).not.toHaveBeenCalled()
    act(() => result.current.setEnabled(true))
    await waitFor(() => expect(result.current.inputs.map((i) => i.name)).toEqual(['Port A', 'Port B']))
    expect(request).toHaveBeenCalledWith({ sysex: false })
    await waitFor(() => expect(result.current.activeId).toBe('a'))
    expect(localStorage.getItem('mustang.midi.inputId')).toBe('a')
    expect(localStorage.getItem('mustang.midi.enabled')).toBe('true')
  })

  it('passes messages from the chosen input only', async () => {
    const a = new FakeInput('a', 'A'), b = new FakeInput('b', 'B')
    install([a, b])
    const got: number[][] = []
    const { result } = renderHook(() => useMidi((s, d1, d2) => got.push([s, d1, d2])))
    act(() => result.current.setEnabled(true))
    await waitFor(() => expect(result.current.activeId).toBe('a'))
    a.send(0xb0, 20, 127)
    b.send(0xb0, 21, 127)
    act(() => result.current.select('b'))
    b.send(0xc0, 7)
    a.send(0xc0, 8)
    expect(got).toEqual([[0xb0, 20, 127], [0xc0, 7, 0]])
  })

  it('starts enabled with the saved device and stops listening when disabled', async () => {
    localStorage.setItem('mustang.midi.enabled', 'true')
    localStorage.setItem('mustang.midi.inputId', 'b')
    const a = new FakeInput('a', 'A'), b = new FakeInput('b', 'B')
    install([a, b])
    const got: number[] = []
    const { result } = renderHook(() => useMidi((_s, d1) => got.push(d1)))
    await waitFor(() => expect(result.current.inputs).toHaveLength(2))
    expect(result.current.activeId).toBe('b')
    b.send(0xb0, 1, 1)
    act(() => result.current.setEnabled(false))
    b.send(0xb0, 2, 1)
    expect(got).toEqual([1])
    expect(result.current.inputs).toEqual([])
  })

  it('shows an error when MIDI cannot be opened', async () => {
    install([], 'denied')
    const { result } = renderHook(() => useMidi(() => {}))
    act(() => result.current.setEnabled(true))
    await waitFor(() => expect(result.current.error).toContain('denied'))
  })

  it('shows an error when the browser has no Web MIDI', () => {
    const { result } = renderHook(() => useMidi(() => {}))
    act(() => result.current.setEnabled(true))
    expect(result.current.error).toMatch(/not supported/i)
  })
})
