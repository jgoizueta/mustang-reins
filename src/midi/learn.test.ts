// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newPreset } from '../protocol/preset'
import type { Preset } from '../protocol/preset'
import {
  applyLearned, MIDI_LEARN_KEY, MidiLearnStore, routeMidi, sameTarget, targetLabel,
  type MidiMapping, type MidiTarget, type RouteMidiArgs,
} from './learn'
import { scale127, type MidiActions } from './map'

beforeEach(() => localStorage.clear())

function actions() {
  const a: { [K in keyof MidiActions]: ReturnType<typeof vi.fn> } = {
    loadSlot: vi.fn(), setTuner: vi.fn(), toggleEffect: vi.fn(), setEffectModel: vi.fn(),
    setEffectKnob: vi.fn(), updateAmp: vi.fn(), setUsbGain: vi.fn(), setBright: vi.fn(), note: vi.fn(),
  }
  return a
}

const ctx = (preset: Preset = newPreset('P'), activeSlot: number | null = 3, slotCount = 24) =>
  ({ preset, activeSlot, slotCount })

const route = (status: number, d1: number, d2: number, r: Partial<RouteMidiArgs> = {}) => {
  const a = actions()
  const onAssign = vi.fn()
  routeMidi(status, d1, d2, {
    learn: { active: false, armed: null }, mappings: [], actions: a as unknown as MidiActions,
    ctx: ctx(), onAssign, ...r,
  })
  return { a, onAssign }
}

describe('MidiLearnStore', () => {
  it('assigns, replaces a reused CC and a reused target, removes and clears', () => {
    const s = new MidiLearnStore()
    const ampGain: MidiTarget = { kind: 'amp', key: 'gain' }
    const tuner: MidiTarget = { kind: 'tuner' }
    s.assign(1, 16, ampGain)
    s.assign(1, 20, tuner)
    expect(s.find(1, 16)?.target).toEqual(ampGain)
    // Reusing the CC replaces the old target.
    s.assign(1, 16, tuner)
    expect(s.find(1, 16)?.target).toEqual(tuner)
    expect(s.forTarget(ampGain)).toBeUndefined()
    // Reusing the target drops its old CC.
    s.assign(3, 40, tuner)
    expect(s.find(3, 40)?.target).toEqual(tuner)
    expect(s.find(1, 16)).toBeUndefined()
    s.remove(tuner)
    expect(s.getSnapshot().length).toBe(0)
    s.assign(1, 16, ampGain)
    s.clear()
    expect(s.getSnapshot().length).toBe(0)
  })

  it('keeps the same CC on another channel separate and persists', () => {
    const s = new MidiLearnStore()
    s.assign(1, 16, { kind: 'amp', key: 'gain' })
    s.assign(2, 16, { kind: 'tuner' })
    expect(s.find(1, 16)?.target).toEqual({ kind: 'amp', key: 'gain' })
    expect(s.find(2, 16)?.target).toEqual({ kind: 'tuner' })
    const again = new MidiLearnStore()
    expect(again.getSnapshot().length).toBe(2)
    expect(again.find(2, 16)?.target).toEqual({ kind: 'tuner' })
  })

  it('drops malformed stored entries', () => {
    localStorage.setItem(MIDI_LEARN_KEY, JSON.stringify([
      { channel: 1, cc: 16, target: { kind: 'amp', key: 'gain' } },
      { channel: 0, cc: 16, target: { kind: 'tuner' } },
      { channel: 1, cc: 300, target: { kind: 'tuner' } },
      { channel: 1, cc: 16, target: { kind: 'nope' } },
      null, 'x',
    ]))
    const s = new MidiLearnStore()
    expect(s.getSnapshot().length).toBe(1)
    expect(s.find(1, 16)?.target).toEqual({ kind: 'amp', key: 'gain' })
  })
})

describe('applyLearned', () => {
  it('amps and usbGain scale 0-127 to 0-255', () => {
    const a = actions()
    applyLearned({ kind: 'amp', key: 'gain' }, 127, a as unknown as MidiActions, ctx())
    expect(a.updateAmp).toHaveBeenCalledWith({ gain: 255 })
    applyLearned({ kind: 'usbGain' }, 0, a as unknown as MidiActions, ctx())
    expect(a.setUsbGain).toHaveBeenCalledWith(0)
  })

  it('effectKnob respects knob count and enum choices', () => {
    const a = actions()
    const p = newPreset('P')
    p.effects.stomp.model = 136 // Simple Comp: one knob with 4 choices.
    applyLearned({ kind: 'effectKnob', family: 'stomp', index: 0 }, 127, a as unknown as MidiActions, ctx(p))
    expect(a.setEffectKnob).toHaveBeenCalledWith('stomp', 0, 3)
    a.setEffectKnob.mockClear()
    applyLearned({ kind: 'effectKnob', family: 'stomp', index: 1 }, 127, a as unknown as MidiActions, ctx(p))
    expect(a.setEffectKnob).not.toHaveBeenCalled()
    p.effects.stomp.model = 60 // Overdrive: five continuous knobs.
    applyLearned({ kind: 'effectKnob', family: 'stomp', index: 4 }, 127, a as unknown as MidiActions, ctx(p))
    expect(a.setEffectKnob).toHaveBeenCalledWith('stomp', 4, 255)
  })

  it('effectSwitch follows the value and is ignored on an empty slot', () => {
    const a = actions()
    const p = newPreset('P')
    p.effects.stomp.model = 60
    applyLearned({ kind: 'effectSwitch', family: 'stomp' }, 127, a as unknown as MidiActions, ctx(p))
    expect(a.toggleEffect).toHaveBeenCalledWith('stomp', true)
    applyLearned({ kind: 'effectSwitch', family: 'stomp' }, 0, a as unknown as MidiActions, ctx(p))
    expect(a.toggleEffect).toHaveBeenCalledWith('stomp', false)
    a.toggleEffect.mockClear()
    p.effects.mod.model = 0
    applyLearned({ kind: 'effectSwitch', family: 'mod' }, 127, a as unknown as MidiActions, ctx(p))
    expect(a.toggleEffect).not.toHaveBeenCalled()
  })

  it('bright and tuner follow the value', () => {
    const a = actions()
    applyLearned({ kind: 'bright' }, 64, a as unknown as MidiActions, ctx())
    expect(a.setBright).toHaveBeenCalledWith(true)
    applyLearned({ kind: 'bright' }, 63, a as unknown as MidiActions, ctx())
    expect(a.setBright).toHaveBeenCalledWith(false)
    applyLearned({ kind: 'tuner' }, 127, a as unknown as MidiActions, ctx())
    expect(a.setTuner).toHaveBeenCalledWith(true)
  })

  it('slot loads on press only and slotStep wraps both ends', () => {
    const a = actions()
    applyLearned({ kind: 'slot', slot: 5 }, 127, a as unknown as MidiActions, ctx())
    expect(a.loadSlot).toHaveBeenCalledWith(5)
    a.loadSlot.mockClear()
    applyLearned({ kind: 'slot', slot: 5 }, 0, a as unknown as MidiActions, ctx())
    applyLearned({ kind: 'slot', slot: 30 }, 127, a as unknown as MidiActions, ctx())
    expect(a.loadSlot).not.toHaveBeenCalled()
    applyLearned({ kind: 'slotStep', step: 1 }, 127, a as unknown as MidiActions, ctx(newPreset('P'), 23, 24))
    expect(a.loadSlot).toHaveBeenCalledWith(0)
    applyLearned({ kind: 'slotStep', step: -1 }, 127, a as unknown as MidiActions, ctx(newPreset('P'), 0, 24))
    expect(a.loadSlot).toHaveBeenCalledWith(23)
    a.loadSlot.mockClear()
    applyLearned({ kind: 'slotStep', step: 1 }, 0, a as unknown as MidiActions, ctx())
    expect(a.loadSlot).not.toHaveBeenCalled()
  })
})

describe('routeMidi', () => {
  it('a learned CC wins over the MIDX-20 map', () => {
    const mappings: MidiMapping[] = [{ channel: 1, cc: 23, target: { kind: 'amp', key: 'gain' } }]
    const { a } = route(0xb0, 23, 127, { mappings })
    expect(a.updateAmp).toHaveBeenCalledWith({ gain: scale127(127) })
    expect(a.toggleEffect).not.toHaveBeenCalled() // CC 23 is stomp on/off in the fixed map.
  })

  it('an unmapped CC still goes to the fixed map', () => {
    const { a } = route(0xb0, 23, 127)
    expect(a.toggleEffect).toHaveBeenCalledWith('stomp', true)
  })

  it('learn active + armed assigns and runs no action; not armed ignores', () => {
    const armed: MidiTarget = { kind: 'amp', key: 'gain' }
    const r1 = route(0xb0, 16, 0, { learn: { active: true, armed } })
    expect(r1.onAssign).toHaveBeenCalledWith(1, 16, armed)
    expect(r1.a.updateAmp).not.toHaveBeenCalled()
    expect(r1.a.note).toHaveBeenCalledWith('MIDI [Ch 1] CC #16 learned for Amp Gain')
    const r2 = route(0xb0, 16, 0, { learn: { active: true, armed: null } })
    expect(r2.onAssign).not.toHaveBeenCalled()
    expect(r2.a.note).not.toHaveBeenCalled()
    // Program Change is ignored while learning too.
    const r3 = route(0xc0, 5, 0, { learn: { active: true, armed } })
    expect(r3.a.loadSlot).not.toHaveBeenCalled()
  })
})

describe('helpers', () => {
  it('sameTarget and targetLabel', () => {
    expect(sameTarget({ kind: 'amp', key: 'gain' }, { kind: 'amp', key: 'gain' })).toBe(true)
    expect(sameTarget({ kind: 'slot', slot: 1 }, { kind: 'slot', slot: 2 })).toBe(false)
    expect(targetLabel({ kind: 'effectKnob', family: 'mod', index: 1 })).toBe('Modulation knob 2')
    expect(targetLabel({ kind: 'effectSwitch', family: 'delay' })).toBe('Delay on/off')
    expect(targetLabel({ kind: 'slotStep', step: 1 })).toBe('Next slot')
    expect(targetLabel({ kind: 'slot', slot: 4 })).toBe('Slot 5')
  })
})
