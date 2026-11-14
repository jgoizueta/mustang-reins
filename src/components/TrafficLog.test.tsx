// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { packets } from '../protocol/packets'
import { DEFAULT_AMP } from '../protocol/preset'
import type { LogEntry } from '../amp/trafficLog'
import { TrafficLog } from './TrafficLog'

// jsdom lacks a few browser APIs that Radix uses.
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

let nextId = 0
const entry = (dir: LogEntry['dir'], text: string, packet?: Uint8Array): LogEntry =>
  ({ id: ++nextId, at: Date.now(), dir, text, packet })

const AMP_PACKET = packets.amp({ ...DEFAULT_AMP, treble: 200 })

const renderLog = (log: LogEntry[], extra: Partial<Parameters<typeof TrafficLog>[0]> = {}) =>
  render(<TrafficLog log={log} onClear={() => {}} {...extra} />)

describe('TrafficLog', () => {
  it('renders entries and the shown/total count', () => {
    renderLog([entry('info', 'Opened amp over Simulated'), entry('tx', '', AMP_PACKET)])
    expect(screen.getByText('Opened amp over Simulated')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.textContent === '2/2')).toBeTruthy()
  })

  it('filters by direction chip and by search', async () => {
    renderLog([entry('info', 'Opened amp'), entry('tx', '', AMP_PACKET), entry('rx', '', packets.requestDump())])
    await userEvent.click(screen.getByText('Filters'))
    await userEvent.click(screen.getByRole('button', { name: 'tx' }))
    expect(screen.getByText((_, el) => el?.textContent === '1/3')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'tx' }))
    const search = screen.getByPlaceholderText(/Search text/)
    await userEvent.type(search, 'dump')
    expect(screen.getByText((_, el) => el?.textContent === '1/3')).toBeTruthy()
    expect(screen.queryByText('Opened amp')).toBeNull()
  })

  it('opens the details, decodes the packet and moves with Next', async () => {
    renderLog([entry('tx', '', AMP_PACKET), entry('tx', '', packets.requestDump())])
    await userEvent.click(screen.getByText('Amp settings'))
    expect(await screen.findByText('Full amp model, tone stack and advanced parameters.')).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Treble' })).toBeTruthy()
    await userEvent.click(screen.getByTitle('Next packet'))
    expect(await screen.findByText('Asks the amp to stream its preset names and active state block.')).toBeTruthy()
  })

  it('calls the clear handler', async () => {
    const onClear = vi.fn()
    renderLog([entry('info', 'x')], { onClear })
    await userEvent.click(screen.getByText('Clear'))
    expect(onClear).toHaveBeenCalled()
  })
})
