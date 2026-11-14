import { describe, expect, it } from 'vitest'
import { encodeEffect, normalizeEffect, parseEffect, withEffectKnob, withEffectModel, emptyEffect } from './preset'
import { rememberEffects, learnedExtra } from './preset'

/** Build a 64-byte packet from the listed bytes (the rest are zero). */
function pkt(head: number[], at: number, tail: number[]): Uint8Array {
  const p = new Uint8Array(64)
  p.set(head, 0)
  p.set(tail, at)
  return p
}
const hex = (s: string) => s.trim().split(/\s+/).map((h) => parseInt(h, 16))

// Packets the amp sent (from a capture on a real Mustang II): bytes 16..39 of effect reports.
const SINE_CHORUS = pkt(hex('1c 01 07 01 00 00 01 01'), 16, hex('12 00 05 01 01 01 00 00 00 00 00 00 00 00 00 00 d5 0a 47 80 80 80 80 80'))
const OCTAVER = pkt(hex('1c 01 07 01 08 00 01 01'), 16, hex('1f 00 01 01 08 01 00 00 00 00 00 00 00 00 00 00 c7 3e 80 00 00 80 80 80'))
const TAPE_DELAY = pkt(hex('1c 01 08 02 00 00 01 01'), 16, hex('2b 00 06 01 01 01 00 00 00 00 00 00 00 00 00 00 7d 1c 00 63 80 00 80 80'))
const SPRING = pkt(hex('1c 01 09 02 06 00 01 01'), 16, hex('0b 00 07 00 08 01 00 00 00 00 00 00 00 00 00 00 55 80 80 80 80 80 80 80'))

const body = (p: Uint8Array) => Array.from(p.slice(16, 40))

describe('writing an effect the way the amp sends it', () => {
  it.each([
    ['mod', 'Sine Chorus', SINE_CHORUS],
    ['mod', 'Octaver', OCTAVER],
    ['delay', 'Tape Delay Short', TAPE_DELAY],
    ['reverb', "'65 Spring", SPRING],
  ] as const)('reproduces the amp bytes for %s %s', (family, _name, real) => {
    const written = encodeEffect(family, parseEffect(real))[0]
    expect(body(written)).toEqual(body(real))
  })

  it('keeps the amp-only bytes when one knob changes', () => {
    const fx = withEffectKnob(parseEffect(SINE_CHORUS), 1, 200)
    const written = encodeEffect('mod', fx)[0]
    expect(written[19]).toBe(1)
    expect(written[20]).toBe(1)
    expect(written[21]).toBe(1)
    expect(Array.from(written.slice(32, 40))).toEqual([0xd5, 200, 0x47, 0x80, 0x80, 0x80, 0x80, 0x80])
  })

  it('pads knobs a model does not use with 0x80, like the amp', () => {
    const fx = withEffectModel('mod', emptyEffect('mod'), 0x12)
    expect(fx.knobs).toEqual([128, 128, 128, 128, 128, 0x80])
    expect(Array.from(encodeEffect('mod', fx)[0].slice(37, 40))).toEqual([0x80, 0x80, 0x80])
  })

  it('learns the extra bytes of a model from what the amp sends and uses them for a model change', () => {
    rememberEffects([TAPE_DELAY, SINE_CHORUS])
    expect(learnedExtra('delay', 0x2b)).toEqual([1, 1, 1, 0x80, 0x80])
    const fx = withEffectModel('delay', emptyEffect('delay'), 0x2b)
    const out = encodeEffect('delay', fx)[0]
    expect([out[19], out[20], out[21]]).toEqual([1, 1, 1])
  })

  it('falls back to the table for a model the amp has not shown yet', () => {
    const fx = normalizeEffect('mod', { ...emptyEffect('mod'), model: 0x2d, enabled: true })
    const out = encodeEffect('mod', fx)[0]
    expect([out[19], out[20], out[21]]).toEqual([1, 1, 1])
  })
})
