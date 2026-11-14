import { DSP_TYPE, type EffectFamily } from './packets'

export type Incoming =
  | { kind: 'ampKnob'; knob: number; value: number }
  | { kind: 'presetChanged'; slot: number }
  | { kind: 'tuner'; note: number; cents: number }
  | { kind: 'tunerStatus'; active: boolean }
  | { kind: 'effectToggle'; family: EffectFamily | null; slot: number; position: 'pre' | 'post'; enabled: boolean }
  | { kind: 'presetName'; text: string }
  | { kind: 'ampSettings'; bytes: Uint8Array }
  | { kind: 'usbGain'; value: number }
  | { kind: 'effect'; family: EffectFamily; bytes: Uint8Array }
  /**
   * The amp changed one effect parameter by itself: the MOD or DLY/REV control (Level) or the TAP button
   * (Delay Time or Rate). `model` is the low byte of the effect model, `param` the knob index.
   */
  | { kind: 'effectKnob'; family: EffectFamily; model: number; param: number; value: number }
  | { kind: 'unknown'; bytes: Uint8Array }

export const AMP_KNOB_IDS = ['volume', 'gain', 'gain2', 'masterVolume', 'treble', 'middle', 'bass', 'presence'] as const

const FAMILY_BY_DSP = new Map(Object.entries(DSP_TYPE).map(([k, v]) => [v, k as EffectFamily]))

export function readAscii(p: Uint8Array, offset = 16, length = 32): string {
  let s = ''
  for (let i = 0; i < length; i++) {
    const c = p[offset + i]
    if (!c) break
    s += String.fromCharCode(c)
  }
  return s.trim()
}

export function decode(p: Uint8Array): Incoming {
  const [a, b, c] = p
  if (a === 5 && b === 1 && c === 2) return { kind: 'ampKnob', knob: p[5], value: p[10] }
  if (a === 0x0b && b === 1) return { kind: 'tuner', note: c, cents: (p[3] << 24) >> 24 }
  if (a === 0x0a && (c === 1 || c === 0)) return { kind: 'tunerStatus', active: c === 1 }
  // Report for the amp's own effect controls: 05 01 <dsp-3> <model> 00 <param> <param> <kind> 00 <value> <value>.
  // The family code is 3 stomp, 4 mod, 5 delay, 6 reverb; the tuner stop below has no model in byte 3.
  if (a === 0x05 && b === 1 && c >= 3 && c <= 6 && p[3] !== 0) {
    const family = FAMILY_BY_DSP.get(c + 3)
    if (family) return { kind: 'effectKnob', family, model: p[3], param: p[5], value: p[9] }
  }
  // The amp stops its tuner by itself, for example when the user presses a button on it.
  if (a === 0x05 && c === 4) return { kind: 'tunerStatus', active: false }
  if (a === 0x19 && b === 0xc3) {
    return {
      kind: 'effectToggle',
      family: FAMILY_BY_DSP.get(c + 3) ?? null,
      enabled: p[3] === 0,
      position: p[4] > 3 ? 'post' : 'pre',
      slot: p[4] > 3 ? p[4] - 4 : p[4],
    }
  }
  if (a === 0x1c && b === 1 && c === 0) return { kind: 'presetChanged', slot: p[4] }
  // The amp pushes its own changes with sub-opcode 1 (seen on a real Mustang II); host writes use 3.
  if (a === 0x1c && (b === 3 || b === 1)) {
    if (c === 4) return { kind: 'presetName', text: readAscii(p) }
    if (c === 5) return { kind: 'ampSettings', bytes: p }
    if (c === 13) return { kind: 'usbGain', value: p[16] }
    const family = FAMILY_BY_DSP.get(c)
    if (family) return { kind: 'effect', family, bytes: p }
  }
  return { kind: 'unknown', bytes: p }
}
