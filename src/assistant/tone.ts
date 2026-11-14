// Human-unit view of a preset ("tone") for the AI assistant, plus the tool schema and the
// patch applier. Display units are the 0-100 scale the knobs show.
import { AMPS, CABINETS, NOISE_GATE, SAG, ampById } from '../data/amps'
import { effectById, effectsFor, FAMILY_LABELS } from '../data/effects'
import { hasDigitalMaster, type AmpSettings, type DeviceInfo, type EffectFamily, type EffectSettings } from '../protocol/packets'
import {
  clonePreset, emptyEffect, FAMILIES, newPreset, normalizeEffect, withEffectKnob, withEffectModel,
  type Preset,
} from '../protocol/preset'

export const toDisplay = (raw: number) => Math.round((raw / 255) * 100)
export const toRaw = (v: number) => Math.max(0, Math.min(255, Math.round((v / 100) * 255)))
const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

/** The catalog of the connected amp, appended to the system prompt. */
export function describeCatalog(device: DeviceInfo): string {
  const lines: string[] = ['Catalog for this amp:', '', 'Amp models:']
  for (const a of AMPS) {
    if (a.v2Only && !device.isV2) continue
    lines.push(`- ${a.name}${a.basedOn ? ` (based on ${a.basedOn})` : ''}`)
  }
  lines.push('', `Cabinets: ${CABINETS.map((c) => c.name).join(', ')}`)
  lines.push(`Noise gate: ${NOISE_GATE.join(', ')}`)
  lines.push(`Sag: ${SAG.join(', ')}`)
  if (!hasDigitalMaster(device)) lines.push('Note: the Master knob is hardware only on this amp; it cannot be set.')
  for (const f of FAMILIES) {
    lines.push('', `${FAMILY_LABELS[f]} effects:`)
    for (const m of effectsFor(f, device.isV2)) {
      const knobs = m.knobs.map((k, i) => m.enums?.[i] ? `${k} (${m.enums[i].join(' | ')})` : k).join(', ')
      lines.push(`- ${m.name}${knobs ? ` — knobs: ${knobs}` : ''}`)
    }
  }
  return lines.join('\n')
}

const knobText = (family: EffectFamily, fx: EffectSettings) => {
  const model = effectById(family, fx.model)
  const out: Record<string, number | string> = {}
  model?.knobs.forEach((k, i) => {
    const choices = model.enums?.[i]
    out[k] = choices ? (choices[fx.knobs[i]] ?? String(fx.knobs[i])) : toDisplay(fx.knobs[i] ?? 0)
  })
  return out
}

/** The editor preset in the same units and names the model answers with. */
export function presetToTone(preset: Preset, device: DeviceInfo) {
  const amp: Record<string, unknown> = {
    model: ampById(preset.amp.model)?.name ?? `Unknown (${preset.amp.model})`,
    gain: toDisplay(preset.amp.gain), volume: toDisplay(preset.amp.volume),
    treble: toDisplay(preset.amp.treble), middle: toDisplay(preset.amp.middle),
    bass: toDisplay(preset.amp.bass), presence: toDisplay(preset.amp.presence),
    depth: toDisplay(preset.amp.depth), bias: toDisplay(preset.amp.bias),
    cabinet: CABINETS.find((c) => c.id === preset.amp.cabinet)?.name ?? `Unknown (${preset.amp.cabinet})`,
    noiseGate: NOISE_GATE[preset.amp.noiseGate] ?? 'Off',
    sag: SAG[preset.amp.sag] ?? 'Off',
    bright: preset.amp.brightness !== 0,
  }
  if (hasDigitalMaster(device)) amp.master = toDisplay(preset.amp.masterVolume)
  const effects: Record<string, unknown> = {}
  for (const f of FAMILIES) {
    const fx = preset.effects[f]
    effects[f] = {
      model: fx.model === 0 ? 'Empty' : effectById(f, fx.model)?.name ?? `Unknown (${fx.model})`,
      enabled: fx.model !== 0 && fx.enabled,
      knobs: knobText(f, fx),
    }
  }
  return { name: preset.name, amp, usbGain: toDisplay(preset.usbGain), effects }
}

const str = { type: ['string', 'null'] } as const
const num = { type: ['number', 'null'] } as const
const bool = { type: ['boolean', 'null'] } as const

/** Tool schema for set_tone. OpenAI-strict: every object closed, every field required and nullable. */
export const SET_TONE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'from_scratch', 'name', 'amp', 'usb_gain', 'effects'],
  properties: {
    explanation: { type: 'string' },
    from_scratch: { type: 'boolean' },
    name: str,
    amp: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['model', 'gain', 'volume', 'treble', 'middle', 'bass', 'presence', 'master', 'depth', 'bias', 'cabinet', 'noiseGate', 'sag', 'bright'],
      properties: {
        model: str, gain: num, volume: num, treble: num, middle: num, bass: num,
        presence: num, master: num, depth: num, bias: num,
        cabinet: str, noiseGate: str, sag: str, bright: bool,
      },
    },
    usb_gain: num,
    effects: {
      type: 'object',
      additionalProperties: false,
      required: ['stomp', 'mod', 'delay', 'reverb'],
      properties: Object.fromEntries(FAMILIES.map((f) => [f, {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['model', 'enabled', 'knobs'],
        properties: {
          model: str,
          enabled: bool,
          knobs: {
            type: ['array', 'null'],
            items: {
              type: 'object', additionalProperties: false, required: ['name', 'value'],
              properties: { name: { type: 'string' }, value: { type: ['number', 'string'] } },
            },
          },
        },
      }])),
    },
  },
} as const

export interface ToneAmpPatch {
  model?: string | null
  gain?: number | null; volume?: number | null; treble?: number | null; middle?: number | null
  bass?: number | null; presence?: number | null; master?: number | null; depth?: number | null; bias?: number | null
  cabinet?: string | null; noiseGate?: string | null; sag?: string | null; bright?: boolean | null
}
export interface ToneEffectPatch {
  model?: string | null
  enabled?: boolean | null
  knobs?: { name: string; value: number | string }[] | null
}
export interface TonePatch {
  explanation?: string
  from_scratch?: boolean
  name?: string | null
  amp?: ToneAmpPatch | null
  usb_gain?: number | null
  effects?: Partial<Record<EffectFamily, ToneEffectPatch | null>> | null
}

export interface ToneChange { label: string; from: string; to: string }
export interface ToneResult { preset: Preset; changes: ToneChange[]; errors: string[] }

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const matchName = <T extends { name: string }>(list: T[], name: string) => list.find((x) => eq(x.name, name))

const AMP_KNOBS = ['gain', 'volume', 'treble', 'middle', 'bass', 'presence', 'master', 'depth', 'bias'] as const
const AMP_RAW: Record<(typeof AMP_KNOBS)[number], keyof AmpSettings> = {
  gain: 'gain', volume: 'volume', treble: 'treble', middle: 'middle', bass: 'bass',
  presence: 'presence', master: 'masterVolume', depth: 'depth', bias: 'bias',
}
const AMP_LABEL: Record<(typeof AMP_KNOBS)[number], string> = {
  gain: 'Gain', volume: 'Volume', treble: 'Treble', middle: 'Middle', bass: 'Bass',
  presence: 'Presence', master: 'Master', depth: 'Depth', bias: 'Bias',
}
const FAMILY_LABEL: Record<EffectFamily, string> = FAMILY_LABELS

/**
 * Apply a set_tone patch. `base` is always the current editor preset; when `patch.from_scratch`
 * is set a fresh preset is built internally, but the volume cap still references `base`.
 */
export function applyTone(base: Preset, patch: TonePatch, device: DeviceInfo): ToneResult {
  const errors: string[] = []
  const changes: ToneChange[] = []
  const preset = patch.from_scratch ? newPreset(patch.name?.trim() || 'New Preset') : clonePreset(base)
  if (!patch.from_scratch && patch.name != null && patch.name.trim()) preset.name = patch.name.trim()
  if (patch.from_scratch) for (const f of FAMILIES) preset.effects[f] = { ...emptyEffect(f), slot: base.effects[f].slot, position: base.effects[f].position }
  const before = base
  let volumeCapped = false

  const a = patch.amp
  if (a) {
    if (a.model != null) {
      const model = matchName(AMPS, a.model)
      if (!model) errors.push(`Unknown amp model "${a.model}"`)
      else if (model.v2Only && !device.isV2) errors.push(`Amp model "${a.model}" is not available on this amp`)
      else preset.amp.model = model.id
    }
    for (const k of AMP_KNOBS) {
      const v = a[k]
      if (v == null) continue
      if (k === 'master' && !hasDigitalMaster(device)) continue // hardware-only, not an error
      preset.amp[AMP_RAW[k]] = toRaw(clamp100(v))
    }
    // Safety: never raise the amp volume more than 10 display points above the editor value.
    const cap = toDisplay(before.amp.volume) + 10
    if (toDisplay(preset.amp.volume) > cap) {
      preset.amp.volume = toRaw(cap)
      volumeCapped = true
    }
    if (a.cabinet != null) {
      const c = matchName(CABINETS, a.cabinet)
      if (!c) errors.push(`Unknown cabinet "${a.cabinet}"`)
      else preset.amp.cabinet = c.id
    }
    if (a.noiseGate != null) {
      const i = NOISE_GATE.findIndex((n) => eq(n, a.noiseGate!))
      if (i < 0) errors.push(`Unknown noise gate "${a.noiseGate}"`)
      else preset.amp.noiseGate = i
    }
    if (a.sag != null) {
      const i = SAG.findIndex((n) => eq(n, a.sag!))
      if (i < 0) errors.push(`Unknown sag "${a.sag}"`)
      else preset.amp.sag = i
    }
    if (a.bright != null) preset.amp.brightness = a.bright ? 1 : 0
  }
  if (patch.usb_gain != null) preset.usbGain = toRaw(clamp100(patch.usb_gain))

  if (patch.effects) {
    for (const f of FAMILIES) {
      const spec = patch.effects[f]
      if (spec == null) continue
      let fx = preset.effects[f]
      if (spec.model != null) {
        if (eq(spec.model, 'empty')) {
          fx = { ...emptyEffect(f), slot: fx.slot, position: fx.position }
        } else {
          const model = matchName(effectsFor(f, device.isV2), spec.model)
          if (!model && matchName(effectsFor(f, true), spec.model)) {
            errors.push(`${FAMILY_LABEL[f]} effect "${spec.model}" is not available on this amp`)
          } else if (!model) { errors.push(`Unknown ${FAMILY_LABEL[f]} effect "${spec.model}"`) }
          else fx = withEffectModel(f, fx, model.id)
        }
      }
      if (spec.enabled != null && fx.model !== 0) fx = { ...fx, enabled: spec.enabled }
      if (spec.knobs != null) {
        const model = effectById(f, fx.model)
        if (!model || fx.model === 0) {
          if (spec.knobs.length) errors.push(`${FAMILY_LABEL[f]}: knobs set but the slot is empty`)
        } else {
          for (const k of spec.knobs) {
            const i = model.knobs.findIndex((n) => eq(n, k.name))
            if (i < 0) { errors.push(`Unknown knob "${k.name}" on ${FAMILY_LABEL[f]} ${model.name}`); continue }
            const choices = model.enums?.[i]
            if (choices) {
              const v = typeof k.value === 'number' ? Math.round(k.value) : choices.findIndex((c) => eq(c, String(k.value)))
              if (typeof v !== 'number' || v < 0 || v >= choices.length) {
                errors.push(`Unknown choice "${k.value}" for ${FAMILY_LABEL[f]} ${model.name} ${k.name}`)
                continue
              }
              fx = withEffectKnob(fx, i, v)
            } else if (typeof k.value !== 'number' || Number.isNaN(k.value)) {
              errors.push(`Knob ${FAMILY_LABEL[f]} ${model.name} ${k.name} needs a number`)
            } else {
              fx = withEffectKnob(fx, i, toRaw(clamp100(k.value)))
            }
          }
        }
      }
      preset.effects[f] = normalizeEffect(f, fx)
    }
  }

  // --- diff in display units ---
  const diff = (label: string, from: string, to: string) => { if (from !== to) changes.push({ label, from, to }) }
  if (before.name !== preset.name) changes.push({ label: 'Name', from: before.name, to: preset.name })
  const ampName = (id: number) => ampById(id)?.name ?? `Unknown (${id})`
  diff('Amp model', ampName(before.amp.model), ampName(preset.amp.model))
  for (const k of AMP_KNOBS) {
    const raw = AMP_RAW[k]
    diff(`Amp ${AMP_LABEL[k]}${k === 'volume' && volumeCapped ? ' (capped at +10)' : ''}`, String(toDisplay(before.amp[raw])), String(toDisplay(preset.amp[raw])))
  }
  const cabName = (id: number) => CABINETS.find((c) => c.id === id)?.name ?? `Unknown (${id})`
  diff('Amp Cabinet', cabName(before.amp.cabinet), cabName(preset.amp.cabinet))
  diff('Amp Noise gate', NOISE_GATE[before.amp.noiseGate] ?? 'Off', NOISE_GATE[preset.amp.noiseGate] ?? 'Off')
  diff('Amp Sag', SAG[before.amp.sag] ?? 'Off', SAG[preset.amp.sag] ?? 'Off')
  diff('Amp Bright', before.amp.brightness ? 'on' : 'off', preset.amp.brightness ? 'on' : 'off')
  diff('USB gain', String(toDisplay(before.usbGain)), String(toDisplay(preset.usbGain)))
  const fxName = (f: EffectFamily, fx: EffectSettings) => fx.model === 0 ? 'Empty' : effectById(f, fx.model)?.name ?? `Unknown (${fx.model})`
  for (const f of FAMILIES) {
    const b = before.effects[f], n = preset.effects[f]
    diff(`${FAMILY_LABEL[f]} model`, fxName(f, b), fxName(f, n))
    const bOn = b.model !== 0 && b.enabled, nOn = n.model !== 0 && n.enabled
    diff(`${FAMILY_LABEL[f]} on/off`, bOn ? 'on' : 'off', nOn ? 'on' : 'off')
    // After a model change, list the new model's knobs only; the old knobs are gone.
    const bk = b.model === n.model ? knobText(f, b) : {}, nk = knobText(f, n)
    for (const k of Object.keys(nk)) diff(`${FAMILY_LABEL[f]} ${k}`, String(bk[k] ?? '—'), String(nk[k]))
  }

  return { preset, changes, errors }
}
