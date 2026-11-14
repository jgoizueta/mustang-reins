// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { newPreset, withEffectModel } from '../protocol/preset'
import { fuseFileName, parseFuse, serializeFuse } from './fuse'

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?><Preset amplifier="Mustang I/II" ProductId="1"><Amplifier><Module ID="117" POS="0" BypassState="1"><Param ControlIndex="0">52428</Param><Param ControlIndex="1">0</Param><Param ControlIndex="2">32896</Param><Param ControlIndex="3">25443</Param><Param ControlIndex="4">28527</Param><Param ControlIndex="5">28398</Param><Param ControlIndex="6">0</Param><Param ControlIndex="7">32896</Param><Param ControlIndex="15">0</Param><Param ControlIndex="17">3</Param><Param ControlIndex="19">0</Param><Param ControlIndex="20">1</Param></Module></Amplifier><FX><Stompbox ID="1"><Module ID="136" POS="4" BypassState="1"><Param ControlIndex="0">1</Param></Module></Stompbox><Modulation ID="2"><Module ID="18" POS="0" BypassState="0"><Param ControlIndex="0">50432</Param><Param ControlIndex="2">45056</Param></Module></Modulation><Delay ID="3"><Module ID="0" POS="2" BypassState="1"></Module></Delay><Reverb ID="4"><Module ID="0" POS="3" BypassState="1"></Module></Reverb></FX><FUSE><Info name="Jazz &amp; Clean" author="Someone" rating="3" genre1="25" genre2="-1" genre3="-1" tags="'JC', clean">A clean tone</Info></FUSE><UsbGain>32896</UsbGain></Preset>`

describe('parseFuse', () => {
  it('reads the amp section, scaling 16-bit values to 0-255', () => {
    const p = parseFuse(SAMPLE, 'file')
    expect(p.name).toBe('Jazz & Clean')
    expect(p.amp).toMatchObject({ model: 117, volume: 204, gain: 0, gain2: 128, masterVolume: 99, treble: 111, middle: 110,
      bass: 0, presence: 128, noiseGate: 0, cabinet: 3, sag: 0, brightness: 1 })
    expect(p.usbGain).toBe(128)
  })

  it('reads effects: family from the group, position from POS, bypass from BypassState', () => {
    const p = parseFuse(SAMPLE)
    expect(p.effects.stomp).toMatchObject({ model: 136, enabled: true, position: 'post', slot: 0 })
    expect(p.effects.mod).toMatchObject({ model: 18, enabled: false, position: 'pre', slot: 0 })
    expect(p.effects.mod.knobs.slice(0, 3)).toEqual([197, 0, 176])
    expect(p.effects.delay.model).toBe(0)
  })

  it('keeps the file metadata', () => {
    const p = parseFuse(SAMPLE)
    expect(p.fuseInfo).toMatchObject({ author: 'Someone', rating: '3', genre1: '25', tags: "'JC', clean", description: 'A clean tone' })
  })

  it('falls back to the file name when the file has no name', () => {
    expect(parseFuse('<Preset><Amplifier><Module ID="83"/></Amplifier></Preset>', 'my file').name).toBe('my file')
  })

  it('rejects files that are not presets', () => {
    expect(() => parseFuse('this is not xml <')).toThrow(/not a valid/i)
    expect(() => parseFuse('<Preset><FX/></Preset>')).toThrow(/Amplifier/)
  })
})

describe('serializeFuse', () => {
  it('round-trips a preset', () => {
    const p = newPreset('Round "trip" <1>')
    p.amp = { ...p.amp, model: 94, volume: 10, gain: 200, treble: 33, noiseGate: 5, threshold: 7, cabinet: 8, sag: 2, brightness: 1 }
    p.usbGain = 77
    p.effects.stomp = { ...withEffectModel('stomp', p.effects.stomp, 60), slot: 1, position: 'post' }
    p.effects.stomp.knobs[1] = 222
    p.effects.delay = { ...withEffectModel('delay', p.effects.delay, 43), enabled: false }
    p.effects.delay.knobs[5] = 9
    const back = parseFuse(serializeFuse(p))
    expect(back.name).toBe(p.name)
    expect(back.amp).toMatchObject({ model: 94, volume: 10, gain: 200, treble: 33, noiseGate: 5, threshold: 7, cabinet: 8, sag: 2, brightness: 1 })
    expect(back.usbGain).toBe(77)
    expect(back.effects.stomp).toMatchObject({ model: 60, enabled: true, position: 'post', slot: 1 })
    expect(back.effects.stomp.knobs[1]).toBe(222)
    expect(back.effects.delay).toMatchObject({ model: 43, enabled: false })
    expect(back.effects.delay.knobs[5]).toBe(9)
  })

  it('writes the numbers of params FUSE expects', () => {
    const p = newPreset()
    p.effects.stomp = withEffectModel('stomp', p.effects.stomp, 136)
    p.effects.delay = withEffectModel('delay', p.effects.delay, 42)
    p.effects.mod = withEffectModel('mod', p.effects.mod, 18)
    const xml = serializeFuse(p)
    const count = (tag: string) => (xml.split(`<${tag} `)[1].split(`</${tag}>`)[0].match(/<Param /g) ?? []).length
    expect([count('Stompbox'), count('Delay'), count('Modulation')]).toEqual([1, 6, 5])
  })

  it('escapes names and builds a safe file name', () => {
    expect(serializeFuse(newPreset('A&B'))).toContain('name="A&amp;B"')
    expect(fuseFileName(newPreset('a/b:c'))).toBe('a_b_c.fuse')
    expect(fuseFileName(newPreset(''))).toBe('preset.fuse')
  })
})
