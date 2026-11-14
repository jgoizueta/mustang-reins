// MIDI learn: user-assigned CC -> control mappings. Learned mappings win over the fixed
// MIDX-20 map for their CC; everything else still goes through handleMidi.
import { useSyncExternalStore } from 'react'
import { effectById, FAMILY_LABELS } from '../data/effects'
import type { EffectFamily } from '../protocol/packets'
import type { Preset } from '../protocol/preset'
import { readJson, writeJson } from '../amp/storage'
import { handleMidi, scale127, type MidiActions } from './map'

export type MidiTarget =
  | { kind: 'amp'; key: 'volume' | 'gain' | 'treble' | 'middle' | 'bass' | 'presence' | 'masterVolume' | 'depth' | 'bias' }
  | { kind: 'usbGain' }
  | { kind: 'effectKnob'; family: EffectFamily; index: number }
  | { kind: 'effectSwitch'; family: EffectFamily }
  | { kind: 'bright' }
  | { kind: 'tuner' }
  | { kind: 'slot'; slot: number }
  | { kind: 'slotStep'; step: 1 | -1 }

export interface MidiMapping { channel: number; cc: number; target: MidiTarget }

const AMP_KEYS = new Set(['volume', 'gain', 'treble', 'middle', 'bass', 'presence', 'masterVolume', 'depth', 'bias'])
const FAMILIES = new Set(['stomp', 'mod', 'delay', 'reverb'])

export function sameTarget(a: MidiTarget, b: MidiTarget): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'amp': return a.key === (b as typeof a).key
    case 'effectKnob': return a.family === (b as typeof a).family && a.index === (b as typeof a).index
    case 'effectSwitch': return a.family === (b as typeof a).family
    case 'slot': return a.slot === (b as typeof a).slot
    case 'slotStep': return a.step === (b as typeof a).step
    default: return true
  }
}

function isTarget(x: unknown): x is MidiTarget {
  const t = x as MidiTarget | null
  if (!t || typeof t !== 'object') return false
  switch (t.kind) {
    case 'amp': return AMP_KEYS.has(t.key)
    case 'effectKnob': return FAMILIES.has(t.family) && Number.isInteger(t.index) && t.index >= 0
    case 'effectSwitch': return FAMILIES.has(t.family)
    case 'slot': return Number.isInteger(t.slot) && t.slot >= 0
    case 'slotStep': return t.step === 1 || t.step === -1
    case 'usbGain': case 'bright': case 'tuner': return true
    default: return false
  }
}

function isMapping(x: unknown): x is MidiMapping {
  const m = x as MidiMapping | null
  return !!m && typeof m === 'object' &&
    Number.isInteger(m.channel) && m.channel >= 1 && m.channel <= 16 &&
    Number.isInteger(m.cc) && m.cc >= 0 && m.cc <= 127 && isTarget(m.target)
}

export function targetLabel(t: MidiTarget): string {
  switch (t.kind) {
    case 'amp': return `Amp ${t.key === 'masterVolume' ? 'Master' : t.key[0].toUpperCase() + t.key.slice(1)}`
    case 'usbGain': return 'USB Gain'
    case 'effectKnob': return `${FAMILY_LABELS[t.family]} knob ${t.index + 1}`
    case 'effectSwitch': return `${FAMILY_LABELS[t.family]} on/off`
    case 'bright': return 'Bright'
    case 'tuner': return 'Tuner'
    case 'slot': return `Slot ${t.slot + 1}`
    case 'slotStep': return t.step === 1 ? 'Next slot' : 'Previous slot'
  }
}

export const MIDI_LEARN_KEY = 'mustang.midi.learned'

export class MidiLearnStore {
  private mappings: MidiMapping[]
  private listeners = new Set<() => void>()

  constructor() {
    this.mappings = readJson<unknown[]>(MIDI_LEARN_KEY, []).filter(isMapping)
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.mappings

  private commit(mappings: MidiMapping[]) {
    this.mappings = mappings
    writeJson(MIDI_LEARN_KEY, mappings)
    this.listeners.forEach((l) => l())
  }

  /** One CC ↔ one target: a reused CC replaces its old target and vice versa. */
  assign(channel: number, cc: number, target: MidiTarget) {
    const rest = this.mappings.filter((m) => !(m.channel === channel && m.cc === cc) && !sameTarget(m.target, target))
    this.commit([...rest, { channel, cc, target }])
  }
  remove(target: MidiTarget) {
    this.commit(this.mappings.filter((m) => !sameTarget(m.target, target)))
  }
  clear() {
    this.commit([])
  }
  find(channel: number, cc: number) {
    return this.mappings.find((m) => m.channel === channel && m.cc === cc)
  }
  forTarget(target: MidiTarget) {
    return this.mappings.find((m) => sameTarget(m.target, target))
  }
}

export const midiLearn = new MidiLearnStore()

export function useMidiMappings() {
  return useSyncExternalStore(midiLearn.subscribe, midiLearn.getSnapshot)
}

export interface LearnContext {
  preset: Preset
  activeSlot: number | null
  slotCount: number
}

/** Apply one learned CC value (0-127) to its target. */
export function applyLearned(target: MidiTarget, value: number, a: MidiActions, ctx: LearnContext): void {
  switch (target.kind) {
    case 'amp':
      a.updateAmp({ [target.key]: scale127(value) })
      return
    case 'usbGain':
      a.setUsbGain(scale127(value))
      return
    case 'effectKnob': {
      const model = effectById(target.family, ctx.preset.effects[target.family].model)
      if (!model || target.index >= model.knobs.length) return
      const choices = model.enums?.[target.index]
      a.setEffectKnob(target.family, target.index,
        choices ? Math.round((value / 127) * (choices.length - 1)) : scale127(value))
      return
    }
    case 'effectSwitch':
      if (ctx.preset.effects[target.family].model === 0) return
      a.toggleEffect(target.family, value >= 64)
      return
    case 'bright':
      a.setBright(value >= 64)
      return
    case 'tuner':
      a.setTuner(value >= 64)
      return
    case 'slot':
      if (value >= 64 && target.slot < ctx.slotCount) a.loadSlot(target.slot)
      return
    case 'slotStep': {
      if (value < 64) return
      const n = ctx.slotCount
      if (n <= 0) return
      a.loadSlot(((ctx.activeSlot ?? 0) + target.step + n) % n)
      return
    }
  }
}

export interface RouteMidiArgs {
  learn: { active: boolean; armed: MidiTarget | null }
  mappings: MidiMapping[]
  actions: MidiActions
  ctx: LearnContext
  onAssign: (channel: number, cc: number, target: MidiTarget) => void
}

/**
 * Route one MIDI message. While learn is active, CCs assign the armed target (or are ignored);
 * otherwise a learned CC runs its target and everything else falls back to the MIDX-20 map.
 */
export function routeMidi(status: number, d1: number, d2: number, r: RouteMidiArgs): void {
  const kind = status & 0xf0
  const ch = (status & 0x0f) + 1
  if (r.learn.active) {
    if (kind === 0xb0 && r.learn.armed) {
      r.onAssign(ch, d1, r.learn.armed)
      r.actions.note(`MIDI [Ch ${ch}] CC #${d1} learned for ${targetLabel(r.learn.armed)}`)
    }
    return
  }
  if (kind === 0xb0) {
    const m = r.mappings.find((x) => x.channel === ch && x.cc === d1)
    if (m) {
      r.actions.note(`MIDI [Ch ${ch}] CC #${d1} value=${d2} → ${targetLabel(m.target)}`)
      applyLearned(m.target, d2, r.actions, r.ctx)
      return
    }
  }
  handleMidi(status, d1, d2, r.actions, r.ctx.slotCount)
}
