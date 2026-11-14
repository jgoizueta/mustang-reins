// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeviceProbe } from '../transport/webhid'
import { DiagnosticsCard } from './DiagnosticsCard'

afterEach(cleanup)

const probe: DeviceProbe = {
  at: Date.now(), transport: 'OFFLINE', present: false, opened: false,
  vendorId: null, productId: null, model: null, strings: {}, interfaces: [],
  notes: ['Offline mode: this environment exposes no USB API.'],
}

const renderCard = (extra: Partial<Parameters<typeof DiagnosticsCard>[0]> = {}) =>
  render(<DiagnosticsCard
    probe={probe} busy={false} onRefresh={() => {}} transportKind="Simulated" link="connected" error={null}
    trafficLog={false} setTrafficLog={() => {}} autoReconnect={true} setAutoReconnect={() => {}}
    liveSync={true} setLiveSync={() => {}}
    midiEnabled={false} midiActiveInputName={null} midiInputsCount={0} midiError={null} {...extra} />)

describe('DiagnosticsCard', () => {
  it('renders the link rows and the probe notes', () => {
    renderCard()
    expect(screen.getByText('Connection diagnostics')).toBeTruthy()
    expect(screen.getByText('Simulated')).toBeTruthy()
    expect(screen.getByText('connected')).toBeTruthy()
    expect(screen.getByText('• Offline mode: this environment exposes no USB API.')).toBeTruthy()
    expect(screen.getByText('No string descriptors available from this transport.')).toBeTruthy()
  })

  it('renders the MIDI rows like the original', () => {
    renderCard({ midiEnabled: true, midiActiveInputName: 'MIDX-20', midiInputsCount: 2 })
    expect(screen.getByText('MIDI Support')).toBeTruthy()
    expect(screen.getByText('Enabled')).toBeTruthy()
    expect(screen.getByText('MIDI Active Input')).toBeTruthy()
    expect(screen.getByText('MIDX-20')).toBeTruthy()
    expect(screen.getByText('MIDI Device Count')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('shows MIDI disabled with no input rows, and a MIDI error when set', () => {
    renderCard({ midiError: 'No MIDI access' })
    expect(screen.getByText('Disabled')).toBeTruthy()
    expect(screen.queryByText('MIDI Active Input')).toBeNull()
    expect(screen.getByText('MIDI Error')).toBeTruthy()
    expect(screen.getByText('No MIDI access')).toBeTruthy()
  })

  it('calls the three switch handlers', async () => {
    const setTrafficLog = vi.fn()
    const setAutoReconnect = vi.fn()
    const setLiveSync = vi.fn()
    renderCard({ setTrafficLog, setAutoReconnect, setLiveSync })
    await userEvent.click(screen.getAllByRole('switch')[0])
    expect(setAutoReconnect).toHaveBeenCalledWith(false)
    await userEvent.click(screen.getAllByRole('switch')[1])
    expect(setLiveSync).toHaveBeenCalledWith(false)
    await userEvent.click(screen.getAllByRole('switch')[2])
    expect(setTrafficLog).toHaveBeenCalledWith(true)
  })
})
