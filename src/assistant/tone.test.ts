import { describe, expect, it } from 'vitest'
import { DEVICES } from '../protocol/packets'
import { newPreset } from '../protocol/preset'
import { applyTone, describeCatalog, presetToTone, toDisplay, toRaw } from './tone'

const V1 = DEVICES[0] // product 4, no digital master, not v2
const V2 = DEVICES[2] // product 20, digital? 24 slots → not digital master but v2

const base = () => {
  const p = newPreset('Base')
  p.amp.volume = toRaw(50)
  return p
}
const patch = (p: object) => ({ from_scratch: false, ...p })

describe('units', () => {
  it('display ↔ raw round-trips on the 0-100 scale', () => {
    for (let v = 0; v <= 100; v += 10) expect(toDisplay(toRaw(v))).toBe(v)
    expect(toRaw(50)).toBe(128)
    expect(toDisplay(255)).toBe(100)
  })
})

describe('applyTone', () => {
  it('sets amp knobs and reports display-unit changes', () => {
    const r = applyTone(base(), patch({ amp: { gain: 80 } }), V2)
    expect(r.errors).toEqual([])
    expect(r.preset.amp.gain).toBe(toRaw(80))
    expect(r.changes).toContainEqual({ label: 'Amp Gain', from: '50', to: '80' })
  })

  it('takes enum knob choices by name', () => {
    const r = applyTone(base(), patch({
      effects: { stomp: { model: 'Simple Comp', knobs: [{ name: 'Type', value: 'Type 3' }] } },
    }), V2)
    expect(r.errors).toEqual([])
    expect(r.preset.effects.stomp.model).toBe(136)
    expect(r.preset.effects.stomp.knobs[0]).toBe(2)
    expect(r.preset.effects.stomp.enabled).toBe(true)
  })

  it('errors on unknown amp, effect, and knob names', () => {
    const r = applyTone(base(), patch({
      amp: { model: 'Nope' },
      effects: { mod: { model: 'Not An Effect' }, delay: { model: 'Mono Delay', knobs: [{ name: 'Wobble', value: 50 }] } },
    }), V2)
    expect(r.errors.length).toBe(3)
    expect(r.errors.join(' ')).toMatch(/amp model.*effect.*knob/is)
  })

  it('rejects v2-only effects on a v1 amp and accepts them on v2', () => {
    const p = patch({ effects: { stomp: { model: 'Ranger Boost' } } })
    expect(applyTone(base(), p, V1).errors.join()).toMatch(/not available/)
    const r = applyTone(base(), p, V2)
    expect(r.errors).toEqual([])
    expect(r.preset.effects.stomp.model).toBe(259)
  })

  it('ignores master on amps without a digital master', () => {
    const p = base()
    p.amp.masterVolume = 10
    const r = applyTone(p, patch({ amp: { master: 90 } }), V1)
    expect(r.errors).toEqual([])
    expect(r.preset.amp.masterVolume).toBe(10)
  })

  it('caps volume raises at +10 points, also from scratch', () => {
    const r1 = applyTone(base(), patch({ amp: { volume: 80 } }), V2)
    expect(toDisplay(r1.preset.amp.volume)).toBe(60)
    expect(r1.changes.some((c) => c.label.includes('capped'))).toBe(true)
    const r2 = applyTone(base(), patch({ from_scratch: true, name: 'X', amp: { volume: 80 } }), V2)
    expect(toDisplay(r2.preset.amp.volume)).toBe(60)
  })

  it('from_scratch empties unset effects and sets the name', () => {
    const b = base()
    b.effects.reverb.model = 36
    const r = applyTone(b, patch({
      from_scratch: true, name: 'Gilmour-ish',
      effects: { delay: { model: 'Mono Delay' } },
    }), V2)
    expect(r.errors).toEqual([])
    expect(r.preset.name).toBe('Gilmour-ish')
    expect(r.preset.effects.reverb.model).toBe(0)
    expect(r.preset.effects.mod.model).toBe(0)
    expect(r.preset.effects.delay.model).not.toBe(0)
  })

  it('keeps gain2 and threshold untouched', () => {
    const b = base()
    b.amp.gain2 = 33
    b.amp.threshold = 44
    const r = applyTone(b, patch({ amp: { gain: 10 } }), V2)
    expect(r.preset.amp.gain2).toBe(33)
    expect(r.preset.amp.threshold).toBe(44)
  })

  it('changing a model keeps extra valid and pads unused knobs with 0x80', () => {
    const r = applyTone(base(), patch({ effects: { stomp: { model: 'Overdrive' } } }), V2)
    const fx = r.preset.effects.stomp
    expect(fx.extra).toBeDefined()
    expect(fx.knobs.length).toBe(6)
    expect(fx.knobs[5]).toBe(0x80) // Overdrive has 5 knobs
  })

  it('clears a slot when the model is Empty, keeping slot/position', () => {
    const b = base()
    b.effects.delay = { model: 22, slot: 2, position: 'post', enabled: true, knobs: [1, 2, 3, 4, 5, 6], extra: [1, 2, 3, 4, 5] }
    const r = applyTone(b, patch({ effects: { delay: { model: 'Empty' } } }), V2)
    expect(r.preset.effects.delay.model).toBe(0)
    expect(r.preset.effects.delay.slot).toBe(2)
    expect(r.preset.effects.delay.position).toBe('post')
  })
})

describe('describeCatalog / presetToTone', () => {
  it('excludes v2-only amps and effects on v1, includes them on v2', () => {
    expect(describeCatalog(V1)).not.toMatch(/Ranger Boost|Mustang V2/)
    expect(describeCatalog(V2)).toMatch(/Ranger Boost/)
  })

  it('notes when Master cannot be set and lists enum choices', () => {
    expect(describeCatalog(V1)).toMatch(/Master knob is hardware only/)
    expect(describeCatalog(V2)).toMatch(/Type \(Type 1 \| Type 2/)
  })

  it('renders the editor preset in display units and names', () => {
    const p = base()
    p.effects.stomp = { model: 136, slot: 0, position: 'pre', enabled: true, knobs: [2, 0x80, 0x80, 0x80, 0x80, 0x80] }
    const tone = presetToTone(p, V2) as unknown as { amp: { gain: number; master?: number }; effects: { stomp: { model: string; knobs: Record<string, string | number> } } }
    expect(tone.amp.gain).toBe(50)
    expect(tone.amp.master).toBeUndefined() // V2 has 24 slots → no digital master
    expect(tone.effects.stomp.model).toBe('Simple Comp')
    expect(tone.effects.stomp.knobs['Type']).toBe('Type 3')
  })
})
