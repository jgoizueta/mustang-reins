// MIDX-20 mapping for the Mustang: which MIDI messages do what.
// Control Change numbers, and the values that pick an amp or effect model, follow the original editor.
import type { AmpSettings, EffectFamily } from '../protocol/packets'

export const CC = {
  TAP_TEMPO: 14,
  TUNER: 20,
  ALL_FX: 22,
  STOMP: 23,
  MOD: 24,
  DELAY: 25,
  REVERB: 26,
  AMP_NOISE_GATE: 27,
  STOMP_TYPE: 28,
  MOD_TYPE: 38,
  DELAY_TYPE: 48,
  REVERB_TYPE: 58,
  AMP_TYPE: 68,
} as const

/** First controller number of each effect's knobs: stomp 29-33, mod 39-43, delay 49-54, reverb 59-63. */
const KNOB_CCS: Record<EffectFamily, number[]> = {
  stomp: [29, 30, 31, 32, 33],
  mod: [39, 40, 41, 42, 43],
  delay: [49, 50, 51, 52, 53, 54],
  reverb: [59, 60, 61, 62, 63],
}

const AMP_PARAM_CCS: Record<number, keyof AmpSettings> = {
  69: 'gain', 70: 'volume', 71: 'treble', 72: 'middle', 73: 'bass', 74: 'sag', 75: 'bias', 76: 'noiseGate',
  77: 'cabinet', 78: 'presence', 79: 'masterVolume', 90: 'threshold', 91: 'depth', 92: 'brightness',
}
/** Amp parameters that take the controller value as it is (a choice), not scaled to 0-255. */
const RAW_AMP_PARAMS = new Set<keyof AmpSettings>(['cabinet', 'sag', 'noiseGate', 'threshold'])

/** Controller value -> model id. Value 0 means "none" for effects and is not used for amps. */
const AMP_MODELS: Record<number, number> = { 1: 103, 2: 100, 3: 124, 4: 83, 5: 106, 6: 117, 7: 114, 8: 97, 9: 121, 10: 94, 11: 93, 12: 109, 13: 241, 14: 246, 15: 249, 16: 255, 17: 252 }
const EFFECT_MODELS: Record<EffectFamily, Record<number, number>> = {
  stomp: { 0: 0, 1: 60, 2: 73, 3: 74, 4: 26, 5: 28, 6: 136, 7: 7, 8: 259, 9: 186, 10: 272, 11: 273, 12: 271 },
  mod: { 0: 0, 1: 18, 2: 19, 3: 24, 4: 25, 5: 45, 6: 64, 7: 65, 8: 34, 9: 41, 10: 79, 11: 31, 12: 244, 13: 245, 14: 4127 },
  delay: { 0: 0, 1: 22, 2: 67, 3: 72, 4: 68, 5: 69, 6: 21, 7: 70, 8: 43, 9: 42 },
  reverb: { 0: 0, 1: 36, 2: 58, 3: 38, 4: 59, 5: 78, 6: 75, 7: 76, 8: 77, 9: 33, 10: 11 },
}
const TYPE_CCS: [number, EffectFamily][] = [[CC.STOMP_TYPE, 'stomp'], [CC.MOD_TYPE, 'mod'], [CC.DELAY_TYPE, 'delay'], [CC.REVERB_TYPE, 'reverb']]
const SWITCH_CCS: [number, EffectFamily][] = [[CC.STOMP, 'stomp'], [CC.MOD, 'mod'], [CC.DELAY, 'delay'], [CC.REVERB, 'reverb']]
const FAMILIES: EffectFamily[] = ['stomp', 'mod', 'delay', 'reverb']

/** MIDI 0-127 to the amp's 0-255. */
export const scale127 = (v: number) => Math.round((v / 127) * 255)

export interface MidiActions {
  /** Program change: load the preset in this amp slot. */
  loadSlot(slot: number): void
  setTuner(on: boolean): void
  toggleEffect(family: EffectFamily, on: boolean): void
  setEffectModel(family: EffectFamily, model: number): void
  setEffectKnob(family: EffectFamily, index: number, value: number): void
  updateAmp(patch: Partial<AmpSettings>): void
  setUsbGain(value: number): void
  setBright(on: boolean): void
  /** A line for the diagnostic log. */
  note(text: string): void
}

/**
 * Handle one MIDI message. `status` is the first byte (channel in the low nibble, which is ignored),
 * `d1` and `d2` are the data bytes. `slotCount` is how many presets the amp has.
 */
export function handleMidi(status: number, d1: number, d2: number, a: MidiActions, slotCount = 100): void {
  const kind = status & 0xf0
  const ch = (status & 0x0f) + 1
  if (kind === 0xc0) {
    a.note(`MIDI [Ch ${ch}] PC #${d1}`)
    if (d1 < slotCount) a.loadSlot(d1)
    return
  }
  if (kind !== 0xb0) return
  a.note(`MIDI [Ch ${ch}] CC #${d1} value=${d2}`)
  const on = d2 >= 64

  if (d1 === CC.TUNER) return a.setTuner(on)
  if (d1 === CC.ALL_FX) return FAMILIES.forEach((f) => a.toggleEffect(f, on))
  const sw = SWITCH_CCS.find(([cc]) => cc === d1)
  if (sw) return a.toggleEffect(sw[1], on)
  if (d1 === CC.AMP_NOISE_GATE) return a.updateAmp({ noiseGate: on ? 1 : 0 })

  const type = TYPE_CCS.find(([cc]) => cc === d1)
  if (type) {
    const model = EFFECT_MODELS[type[1]][d2]
    if (model !== undefined) a.setEffectModel(type[1], model)
    return
  }
  if (d1 === CC.AMP_TYPE) {
    const model = AMP_MODELS[d2]
    if (model !== undefined) a.updateAmp({ model })
    return
  }
  for (const f of FAMILIES) {
    const i = KNOB_CCS[f].indexOf(d1)
    if (i !== -1) return a.setEffectKnob(f, i, scale127(d2))
  }
  const key = AMP_PARAM_CCS[d1]
  if (key) {
    const value = RAW_AMP_PARAMS.has(key) ? d2 : key === 'brightness' ? (on ? 1 : 0) : scale127(d2)
    a.updateAmp({ [key]: value })
  }
}
