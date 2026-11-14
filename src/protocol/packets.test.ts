import { describe, expect, it } from 'vitest'
import { decode, readAscii } from './decode'
import { packets, PACKET_SIZE } from './packets'

describe('packets', () => {
  it('builds fixed-size handshake packets', () => {
    expect(packets.init0()).toHaveLength(PACKET_SIZE)
    expect([...packets.init0().slice(0, 2)]).toEqual([0, 0xc3])
    expect([...packets.init1(193).slice(0, 2)]).toEqual([0x1a, 193])
    expect([...packets.requestDump().slice(0, 2)]).toEqual([0xff, 0xc1])
  })

  it('writes the preset name as 32 ASCII bytes at offset 16', () => {
    const p = packets.savePreset(4, 'Clean')
    expect([...p.slice(0, 8)]).toEqual([0x1c, 1, 3, 0, 4, 0, 1, 1])
    expect(readAscii(p)).toBe('Clean')
    expect(p[21]).toBe(0)
  })

  it('lays out amp parameters from byte 32', () => {
    const p = packets.amp(
      { model: 83, volume: 1, gain: 2, gain2: 3, masterVolume: 4, treble: 5, middle: 6, bass: 7, presence: 8,
        depth: 9, bias: 10, noiseGate: 5, threshold: 7, cabinet: 3, sag: 1, brightness: 1 },
      { magic: [3, 3, 3, 3, 106] },
    )
    expect(p[16]).toBe(83)
    expect([...p.slice(32, 40)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...p.slice(44, 47)]).toEqual([3, 3, 3])
    expect(p[47]).toBe(5)
    expect(p[48]).toBe(7)
    expect(p[49]).toBe(3)
    expect(p[50]).toBe(3)
    expect(p[51]).toBe(1)
    expect(p[54]).toBe(106)
  })

  it('zeroes the threshold unless the noise gate is on mode 5', () => {
    const base = { model: 1, volume: 0, gain: 0, gain2: 0, masterVolume: 0, treble: 0, middle: 0, bass: 0,
      presence: 0, depth: 0, bias: 0, threshold: 9, cabinet: 0, sag: 0, brightness: 0 }
    expect(packets.amp({ ...base, noiseGate: 2 })[48]).toBe(0)
  })

  it('encodes effects with a 16-bit model and post-amp slot offset', () => {
    const p = packets.effect('delay', { model: 0x1234, slot: 2, position: 'post', enabled: false, knobs: [9, 8] })
    expect(p[2]).toBe(8)
    expect([p[16], p[17], p[18], p[22]]).toEqual([0x34, 0x12, 6, 1])
    expect([...p.slice(32, 38)]).toEqual([9, 8, 0, 0, 0, 0])
  })
})

describe('decode', () => {
  it('round-trips a live effect toggle', () => {
    const d = decode(packets.toggleEffect('reverb', 3, 'pre', false))
    expect(d).toEqual({ kind: 'effectToggle', family: 'reverb', slot: 3, position: 'pre', enabled: false })
  })

  it('reads signed tuner cents', () => {
    const p = new Uint8Array(64)
    p.set([0x0b, 1, 9, 0xfb])
    expect(decode(p)).toEqual({ kind: 'tuner', note: 9, cents: -5 })
  })

  it('reads the amp\'s own effect changes from real reports', () => {
    const real = (hex: string) => { const p = new Uint8Array(64); p.set(hex.split(' ').map((h) => parseInt(h, 16))); return p }
    // MOD control: Level (parameter 0) of Sine Tremolo
    expect(decode(real('05 01 04 41 00 00 00 01 00 8c 8c'))).toEqual({ kind: 'effectKnob', family: 'mod', model: 0x41, param: 0, value: 0x8c })
    // DLY/REV control: Level of the delay and of the reverb
    expect(decode(real('05 01 05 2a 00 00 00 01 00 60 60'))).toEqual({ kind: 'effectKnob', family: 'delay', model: 0x2a, param: 0, value: 0x60 })
    expect(decode(real('05 01 06 3b 00 00 00 01 00 5d 5d'))).toEqual({ kind: 'effectKnob', family: 'reverb', model: 0x3b, param: 0, value: 0x5d })
    // TAP button: Delay Time (parameter 1) of Stereo Tape Delay, a fast and a slow tap
    expect(decode(real('05 01 05 2a 00 01 01 06 00 24 24'))).toEqual({ kind: 'effectKnob', family: 'delay', model: 0x2a, param: 1, value: 0x24 })
    expect(decode(real('05 01 05 2a 00 01 01 06 00 ff ff'))).toEqual({ kind: 'effectKnob', family: 'delay', model: 0x2a, param: 1, value: 0xff })
    // TAP button with only a mod effect: Rate (parameter 1) of Sine Chorus
    expect(decode(real('05 01 04 12 00 01 01 10 00 9b 9b'))).toEqual({ kind: 'effectKnob', family: 'mod', model: 0x12, param: 1, value: 0x9b })
    // A tuner stop has no model in byte 3 and must not be taken for an effect change.
    expect(decode(real('05 01 04 00'))).toEqual({ kind: 'tunerStatus', active: false })
  })

  it('reads tuner status reports', () => {
    const on = new Uint8Array(64); on.set([0x0a, 1, 1])
    const off = new Uint8Array(64); off.set([0x0a, 1, 0])
    const stop = new Uint8Array(64); stop.set([0x05, 1, 4])
    expect(decode(on)).toEqual({ kind: 'tunerStatus', active: true })
    expect(decode(off)).toEqual({ kind: 'tunerStatus', active: false })
    expect(decode(stop)).toEqual({ kind: 'tunerStatus', active: false })
  })

  it('reads a physical knob turn', () => {
    const p = new Uint8Array(64)
    p.set([5, 1, 2, 0, 0, 4], 0)
    p[10] = 200
    expect(decode(p)).toEqual({ kind: 'ampKnob', knob: 4, value: 200 })
  })
})

describe('hasDigitalMaster', () => {
  it('is false for the Mustang I/II and true for the III/IV/V', async () => {
    const { hasDigitalMaster, DEVICES } = await import('./packets')
    expect(DEVICES.map((d) => [d.productId, hasDigitalMaster(d)])).toEqual([[4, false], [5, true], [20, false], [21, true]])
  })
})
