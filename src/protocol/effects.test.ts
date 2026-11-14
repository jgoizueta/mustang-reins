import { describe, expect, it } from 'vitest'
import { EFFECTS, effectsFor } from '../data/effects'
import { clonePreset, emptyEffect, moveEffect, samePreset, withEffectKnob, withEffectModel, newPreset } from './preset'

describe('effect table', () => {
  it('has the four families with an Empty entry each', () => {
    for (const f of ['stomp', 'mod', 'delay', 'reverb'] as const) {
      expect(EFFECTS.filter((e) => e.family === f && e.id === 0)).toHaveLength(1)
    }
    expect(EFFECTS).toHaveLength(49)
  })
  it('has no duplicate id inside a family and never more than 6 knobs', () => {
    const seen = new Set<string>()
    for (const e of EFFECTS) {
      const k = `${e.family}:${e.id}`
      expect(seen.has(k)).toBe(false)
      seen.add(k)
      expect(e.knobs.length).toBeLessThanOrEqual(6)
    }
  })
  it('hides v2-only models on v1 firmware', () => {
    expect(effectsFor('stomp', true).some((e) => e.name === 'Big Fuzz')).toBe(true)
    expect(effectsFor('stomp', false).some((e) => e.name === 'Big Fuzz')).toBe(false)
  })
})

describe('effect edits', () => {
  it('centres the knobs a new model uses and switches it on', () => {
    const fx = withEffectModel('stomp', emptyEffect('stomp'), 60)
    expect(fx).toMatchObject({ model: 60, enabled: true, knobs: [128, 128, 128, 128, 128, 0x80] })
    expect(withEffectModel('stomp', fx, 0)).toMatchObject({ model: 0, enabled: false, knobs: [0, 0, 0, 0, 0, 0] })
  })
  it('changes one knob without touching the others', () => {
    const fx = withEffectKnob(withEffectModel('delay', emptyEffect('delay'), 22), 1, 40)
    expect(fx.knobs.slice(0, 3)).toEqual([128, 40, 128])
  })
  it('swaps with the effect that occupies the target place', () => {
    const { effects } = newPreset()
    // defaults: stomp pre/0, mod pre/1, delay pre/2, reverb pre/3
    const changed = moveEffect(effects, 'stomp', 'pre', 2)
    expect(changed.stomp).toMatchObject({ position: 'pre', slot: 2 })
    expect(changed.delay).toMatchObject({ position: 'pre', slot: 0 })
    expect(Object.keys(changed).sort()).toEqual(['delay', 'stomp'])
  })
  it('moves into an empty place without a swap, and ignores a no-op', () => {
    const { effects } = newPreset()
    expect(Object.keys(moveEffect(effects, 'reverb', 'post', 1))).toEqual(['reverb'])
    expect(moveEffect(effects, 'reverb', 'pre', 3)).toEqual({})
  })
})

describe('samePreset', () => {
  it('is true for equal clones', () => {
    const p = newPreset('Twin')
    p.effects.stomp = withEffectModel('stomp', p.effects.stomp, 60)
    expect(samePreset(p, clonePreset(p))).toBe(true)
  })
  it('is false when the name differs', () => {
    expect(samePreset(newPreset('A'), newPreset('B'))).toBe(false)
  })
  it('is false when an amp field differs', () => {
    const a = newPreset('P')
    const b = newPreset('P')
    b.amp.treble = 10
    expect(samePreset(a, b)).toBe(false)
  })
  it('is false when an active knob differs', () => {
    const a = newPreset('P')
    const b = newPreset('P')
    a.effects.stomp = withEffectModel('stomp', a.effects.stomp, 60)
    b.effects.stomp = withEffectModel('stomp', b.effects.stomp, 60)
    b.effects.stomp.knobs[0] = 40
    expect(samePreset(a, b)).toBe(false)
  })
  it('ignores extra, fuseInfo and knobs past the model count', () => {
    const a = newPreset('P')
    const b = newPreset('P')
    a.effects.stomp = withEffectModel('stomp', a.effects.stomp, 60)
    b.effects.stomp = withEffectModel('stomp', b.effects.stomp, 60)
    b.fuseInfo = { author: 'someone' }
    b.effects.stomp.extra = [9, 9, 9, 9, 9]
    b.effects.stomp.knobs[5] = 0 // Overdrive uses 5 knobs; the 6th is padding
    b.effects.mod.extra = [1, 2, 3, 4, 5]
    expect(samePreset(a, b)).toBe(true)
  })
})
