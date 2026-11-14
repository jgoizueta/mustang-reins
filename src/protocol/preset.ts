import { ampById } from '../data/amps'
import { effectById } from '../data/effects'
import { readAscii } from './decode'
import { packets, DSP_TYPE, type AmpSettings, type EffectFamily, type EffectSettings } from './packets'

/** Metadata a .fuse file carries about a preset. */
export interface FuseInfo {
  author?: string
  tags?: string
  rating?: string
  genre1?: string
  genre2?: string
  genre3?: string
  description?: string
}

export interface Preset {
  name: string
  fuseInfo?: FuseInfo
  amp: AmpSettings
  effects: Record<EffectFamily, EffectSettings>
  usbGain: number
}

export const FAMILIES: EffectFamily[] = ['stomp', 'mod', 'delay', 'reverb']
const DEFAULT_SLOT: Record<EffectFamily, number> = { stomp: 0, mod: 1, delay: 2, reverb: 3 }
const FAMILY_BY_DSP: Record<number, EffectFamily> = { 6: 'stomp', 7: 'mod', 8: 'delay', 9: 'reverb' }

export const DEFAULT_AMP: AmpSettings = {
  model: 83, volume: 128, gain: 128, gain2: 128, masterVolume: 128, treble: 128, middle: 128, bass: 128,
  presence: 128, depth: 128, bias: 128, noiseGate: 0, threshold: 0, cabinet: 3, sag: 1, brightness: 0,
}

export const emptyEffect = (family: EffectFamily): EffectSettings => ({
  model: 0, enabled: false, slot: DEFAULT_SLOT[family], position: 'pre', knobs: [0, 0, 0, 0, 0, 0],
})

export const newPreset = (name = 'New Preset'): Preset => ({
  name,
  amp: { ...DEFAULT_AMP },
  effects: { stomp: emptyEffect('stomp'), mod: emptyEffect('mod'), delay: emptyEffect('delay'), reverb: emptyEffect('reverb') },
  usbGain: 128,
})

export function parseAmp(p: Uint8Array): AmpSettings {
  return {
    model: p[16], volume: p[32], gain: p[33], gain2: p[34], masterVolume: p[35], treble: p[36], middle: p[37],
    bass: p[38], presence: p[39], depth: p[41], bias: p[42], noiseGate: p[47], threshold: p[48],
    cabinet: p[49], sag: p[51], brightness: p[52],
  }
}

export function parseEffect(p: Uint8Array): EffectSettings {
  const model = p[16] | (p[17] << 8)
  const slot = p[18]
  return {
    model,
    slot: slot > 3 ? slot - 4 : slot,
    position: slot > 3 ? 'post' : 'pre',
    enabled: model !== 0 && p[22] === 0,
    knobs: Array.from(p.slice(32, 38)),
    extra: [p[19], p[20], p[21], p[38], p[39]],
  }
}

/** Extra bytes seen in the amp's own effect reports, by family and model. */
const learned = new Map<string, number[]>()

export const learnedExtra = (family: EffectFamily, model: number) => learned.get(`${family}:${model}`)

/** Remember the extra bytes of every effect report in `packets` (such as a full dump of the amp). */
export function rememberEffects(list: Uint8Array[]) {
  for (const p of list) {
    const family = FAMILY_BY_DSP[p[2]]
    if (p[0] !== 0x1c || (p[1] !== 1 && p[1] !== 3) || !family) continue
    const fx = parseEffect(p)
    if (fx.model !== 0 && fx.extra) learned.set(`${family}:${fx.model}`, fx.extra)
  }
}

/**
 * Fill in what the amp expects around the knobs: knobs a model does not use read 0x80, and the extra bytes
 * come from what the amp has shown for the model, else from the effect table.
 */
export function normalizeEffect(family: EffectFamily, fx: EffectSettings): EffectSettings {
  const model = effectById(family, fx.model)
  const count = model?.knobs.length
  const knobs = count === undefined ? fx.knobs : Array.from({ length: 6 }, (_, i) => (i < count ? (fx.knobs[i] ?? 128) : 0x80))
  const extra = fx.extra ?? learnedExtra(family, fx.model) ?? (model ? [...model.unknown, 0x80, 0x80] : undefined)
  return { ...fx, knobs, extra }
}

/** Build a preset from the 7 state packets that follow the name list in a dump (or a slot select). */
export function parseStateBlock(block: Uint8Array[]): Preset {
  const preset = newPreset('')
  for (const p of block) {
    const dsp = p[2]
    if (dsp === 4) preset.name = readAscii(p)
    else if (dsp === 5) preset.amp = parseAmp(p)
    else if (dsp === 13) preset.usbGain = p[16]
    else if (FAMILY_BY_DSP[dsp]) preset.effects[FAMILY_BY_DSP[dsp]] = parseEffect(p)
  }
  return preset
}

/** Preset names come as two packets per slot. Parsing stops at the first packet that is not a name. */
export function parsePresetNames(dump: Uint8Array[], count: number): string[] {
  const names: string[] = []
  for (let i = 0; i < dump.length && names.length < count; i += 2) {
    if (dump[i][2] !== 4) break
    names.push(readAscii(dump[i]) || `Preset ${names.length + 1}`)
  }
  return names
}

/** Choose a model: knobs the model uses start at 128 (centre), the rest at 0x80 like the amp, and a real model switches on. */
export function withEffectModel(family: EffectFamily, fx: EffectSettings, model: number): EffectSettings {
  const count = effectById(family, model)?.knobs.length ?? 0
  const knobs = Array.from({ length: 6 }, (_, i) => (i < count ? 128 : model === 0 ? 0 : 0x80))
  return model === 0
    ? { ...fx, model, enabled: false, knobs, extra: undefined }
    : normalizeEffect(family, { ...fx, model, enabled: true, knobs, extra: undefined })
}

export function withEffectKnob(fx: EffectSettings, index: number, value: number): EffectSettings {
  const knobs = [...fx.knobs]
  knobs[index] = value
  return { ...fx, knobs }
}

/** Put `family` at a position/slot. An effect already there takes the slot `family` leaves. Returns only what changed. */
export function moveEffect(
  effects: Record<EffectFamily, EffectSettings>, family: EffectFamily, position: 'pre' | 'post', slot: number,
): Partial<Record<EffectFamily, EffectSettings>> {
  const cur = effects[family]
  if (cur.position === position && cur.slot === slot) return {}
  const changed: Partial<Record<EffectFamily, EffectSettings>> = {}
  const other = FAMILIES.find((f) => f !== family && effects[f].position === position && effects[f].slot === slot)
  if (other) changed[other] = { ...effects[other], position: cur.position, slot: cur.slot }
  changed[family] = { ...cur, position, slot }
  return changed
}

/**
 * Whether two presets sound the same and carry the same name. `fuseInfo` and `extra` do not count: the amp's own
 * reports change `extra` and the knob padding past a model's used knobs, which are not user changes.
 */
export function samePreset(a: Preset, b: Preset): boolean {
  if (a.name !== b.name || a.usbGain !== b.usbGain) return false
  for (const k of Object.keys(a.amp) as (keyof AmpSettings)[]) if (a.amp[k] !== b.amp[k]) return false
  for (const f of FAMILIES) {
    const ea = a.effects[f]
    const eb = b.effects[f]
    if (ea.model !== eb.model || ea.enabled !== eb.enabled || ea.slot !== eb.slot || ea.position !== eb.position) return false
    const n = effectById(f, ea.model)?.knobs.length ?? 6
    for (let i = 0; i < n; i++) if (ea.knobs[i] !== eb.knobs[i]) return false
  }
  return true
}

export function clonePreset(p: Preset): Preset {
  return {
    ...p,
    amp: { ...p.amp },
    fuseInfo: p.fuseInfo ? { ...p.fuseInfo } : undefined,
    effects: Object.fromEntries(FAMILIES.map((f) => [f, { ...p.effects[f], knobs: [...p.effects[f].knobs] }])) as Preset['effects'],
  }
}

export const encodeAmp = (amp: AmpSettings) => [packets.amp(amp, ampById(amp.model)), packets.apply()]
export const encodeUsbGain = (value: number) => [packets.usbGain(value), packets.apply()]
export const encodeEffect = (family: EffectFamily, fx: EffectSettings) =>
  fx.model === 0 ? [packets.clearEffect(family), packets.apply()] : [packets.effect(family, fx), packets.apply()]
export const encodeAmpKnob = (index: number, value: number) => [packets.ampKnob(index, value)]

/** Everything needed to push a whole preset to the amp, in the order the amp expects. */
export function encodePreset(preset: Preset): Uint8Array[] {
  return [
    ...encodeAmp(preset.amp),
    ...FAMILIES.flatMap((f) => encodeEffect(f, preset.effects[f])),
    ...encodeUsbGain(preset.usbGain),
  ]
}

export { DSP_TYPE }
