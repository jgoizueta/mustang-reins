// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SignalPath } from '../components/SignalPath'
import { parseFuse, serializeFuse } from '../fuse/fuse'
import { encodeAmp, newPreset, parseAmp, parseStateBlock } from '../protocol/preset'
import { AMP_OFF, AMPS, ampById } from './amps'

afterEach(cleanup)

/** Build a 64-byte packet from the listed bytes (the rest are zero). */
function pkt(head: number[], at = 0, tail: number[] = []): Uint8Array {
  const p = new Uint8Array(64)
  p.set(head, 0)
  p.set(tail, at)
  return p
}
const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

// What a real Mustang II sent for its preset named "Empty": no amp model, no effects.
const EMPTY_PRESET = [
  pkt([0x1c, 1, 4, 0, 0x10, 0, 1, 0], 16, text('Empty')),
  pkt([0x1c, 1, 5, 0, 0x10, 0, 1, 0], 32, [0xef]),
  pkt([0x1c, 1, 6, 0, 0x10, 0, 1, 0]),
  pkt([0x1c, 1, 7, 0, 0x10, 0, 1, 0], 18, [1]),
  pkt([0x1c, 1, 8, 0, 0x10, 0, 1, 0], 18, [2]),
  pkt([0x1c, 1, 9, 0, 0x10, 0, 1, 0], 18, [3]),
  pkt([0x1c, 1, 0x0d, 0, 0x10, 0, 1, 0], 16, [0xff]),
  pkt([0x1c, 1, 0, 0, 0x10, 0, 1, 0]),
]

describe('amp model Off', () => {
  it('is the first model, with value 0 and no magic bytes', () => {
    expect(AMPS[0]).toMatchObject({ id: AMP_OFF, name: 'Off' })
    expect(AMP_OFF).toBe(0)
    expect(ampById(0)?.magic).toEqual([0, 0, 0, 0, 0])
  })

  it('reads the real "Empty" preset as no amp and no effects', () => {
    const p = parseStateBlock(EMPTY_PRESET)
    expect(p.name).toBe('Empty')
    expect(p.amp.model).toBe(0)
    expect(p.amp.cabinet).toBe(0)
    expect(p.usbGain).toBe(255)
    expect(Object.values(p.effects).map((e) => e.model)).toEqual([0, 0, 0, 0])
    expect(parseAmp(EMPTY_PRESET[1]).volume).toBe(0xef)
  })

  it('writes model 0 with no magic bytes, as the amp reports it', () => {
    const p = parseStateBlock(EMPTY_PRESET)
    const [write] = encodeAmp(p.amp)
    expect(write[16]).toBe(0)
    expect([write[44], write[45], write[46], write[50], write[54]]).toEqual([0, 0, 0, 0, 0])
    expect(write[32]).toBe(0xef)
  })

  it('survives a .fuse export and import', () => {
    const p = newPreset('No amp')
    p.amp.model = AMP_OFF
    expect(parseFuse(serializeFuse(p)).amp.model).toBe(0)
  })

  it('shows Off in the signal path, muted, instead of Unknown Amp', () => {
    const p = newPreset('x')
    p.amp.model = AMP_OFF
    render(<SignalPath preset={p} onToggleEffect={() => {}} onMoveEffect={() => {}} onToggleCabinet={() => {}} />)
    const node = screen.getByTestId('amp-node')
    expect(node.textContent).toContain('Off')
    expect(node.className).toContain('opacity-60')
    expect(screen.queryByText('Unknown Amp')).toBeNull()
  })

  it('keeps the amp node bright for a real model', () => {
    render(<SignalPath preset={newPreset('x')} onToggleEffect={() => {}} onMoveEffect={() => {}} onToggleCabinet={() => {}} />)
    expect(screen.getByTestId('amp-node').className).not.toContain('opacity-60')
  })
})
