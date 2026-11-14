import { describe, expect, it } from 'vitest'
import {
  describePacket, directionLabel, matchOffsets, matchSearch, packetType, parseHex, parseOffsets,
} from './describe'
import { packets } from './packets'
import { DEFAULT_AMP } from './preset'

const pkt = (head: number[], at = 0, tail: number[] = []): Uint8Array => {
  const p = new Uint8Array(64)
  p.set(head, 0)
  if (at) p.set(tail, at)
  return p
}
const hex = (s: string) => s.trim().split(/\s+/).map((h) => parseInt(h, 16))

const field = (d: ReturnType<typeof describePacket>, name: string) => d.fields.find((f) => f.name === name)

describe('describePacket', () => {
  it('decodes amp settings', () => {
    const d = describePacket(packets.amp({ ...DEFAULT_AMP, treble: 200, gain: 77 }))
    expect(d.title).toBe('Amp settings')
    expect(field(d, 'Amp model')?.value).toBe("Fender '65 Deluxe Reverb")
    expect(field(d, 'Treble')?.value).toBe('78%')
    expect(field(d, 'Gain')?.value).toBe('30%')
    expect(field(d, 'Cabinet')?.value).toBe("'65 Deluxe 1×12")
  })

  it('decodes an amp-pushed effect report (sub-opcode 1)', () => {
    // Real capture: 1c 01 07 — a mod report for Sine Chorus (model 0x12).
    const p = pkt(hex('1c 01 07 01 00 00 01 01'), 16, hex('12 00 05 01 01 01 00 00 00 00 00 00 00 00 00 00 d5 0a 47 80 80 80 80 80'))
    const d = describePacket(p)
    expect(d.title).toBe('Mod effect')
    expect(field(d, 'Effect model')?.value).toBe('Sine Chorus')
    expect(field(d, 'Status')?.value).toBe('Enabled')
    expect(field(d, 'Slot / position')?.value).toBe('2 · post')
    expect(field(d, 'Knob 1 · Level')?.value).toBe('84%')
  })

  it('decodes a preset name record', () => {
    const p = packets.savePreset(2, 'Crunchy')
    p[1] = 3; p[2] = 4
    const d = describePacket(p)
    expect(d.title).toBe('Preset name')
    expect(field(d, 'Name')?.value).toBe('Crunchy')
  })

  it('decodes USB gain, tuner packets, apply and the handshake', () => {
    const gain = describePacket(packets.usbGain(200))
    expect(gain.title).toBe('USB gain')
    expect(field(gain, 'USB gain')?.value).toBe('78%')
    expect(describePacket(packets.tunerOn()).title).toBe('Tuner activate')
    expect(describePacket(packets.tunerOff()).title).toBe('Tuner deactivate')
    const reading = describePacket(pkt([0x0b, 1, 3, 0xf0]))
    expect(reading.title).toBe('Tuner reading')
    expect(field(reading, 'Cents offset')?.value).toBe('-16')
    expect(describePacket(packets.apply()).title).toBe('Apply / commit')
    expect(describePacket(packets.requestDump()).title).toBe('Request dump')
    expect(describePacket(packets.init0()).title).toBe('Init 0')
    expect(describePacket(packets.init1(193)).title).toBe('Init 1')
  })

  it("decodes the amp's own effect knob report", () => {
    // 05 01 <dsp-3> <model> 00 <param> <param> <kind> 00 <v> <v>: delay, model 0x2b, param 0, value 200.
    const d = describePacket(pkt(hex('05 01 05 2b 00 00 00 06 00 c8 c8')))
    expect(d.title).toBe('Effect knob turn')
    expect(field(d, 'DSP - 3')?.value).toBe('Delay')
    expect(field(d, 'Effect model')?.value).toBe('Tape Delay')
    expect(field(d, 'Value')?.value).toBe('78%')
  })

  it('decodes the amp knob turn, tuner stop and the preset-changed trailer', () => {
    const knob = describePacket(pkt(hex('05 01 02 f6 00 04 04 0c 00 00 4d')))
    expect(knob.title).toBe('Amp knob turn')
    expect(field(knob, 'Knob ID')?.value).toBe('Treble')
    expect(describePacket(pkt(hex('05 01 04 00'))).title).toBe('Tuner stop')
    const trailer = describePacket(pkt(hex('1c 01 00 00 09')))
    expect(trailer.title).toBe('Preset change notification')
    expect(field(trailer, 'Slot')?.value).toBe('10')
  })

  it('decodes select, save, bypass and the effect-preset notice', () => {
    const sel = describePacket(packets.selectPreset(7))
    expect(sel.title).toBe('Select bank slot')
    expect(field(sel, 'Slot')?.value).toBe('8')
    const save = describePacket(packets.savePreset(5, 'From file'))
    expect(save.title).toBe('Save preset')
    expect(field(save, 'Preset name')?.value).toBe('From file')
    const bypass = describePacket(packets.toggleEffect('mod', 1, 'pre', false))
    expect(bypass.title).toBe('Effect bypass')
    expect(field(bypass, 'State')?.value).toBe('Bypassed')
    const notice = describePacket(pkt(hex('1d 01 02 03 09')))
    expect(notice.title).toBe('Effect preset notice')
    expect(field(notice, 'Slot')?.raw).toBe('0x09 (9)')
  })

  it('labels anything else unknown', () => {
    const d = describePacket(pkt([0x77, 0x77, 0x77]))
    expect(d.title).toBe('Unknown packet')
  })
})

describe('log helpers', () => {
  const entry = (id: number, dir: string, text: string, packet?: Uint8Array) => ({ id, dir, text, packet })

  it('directionLabel maps tx/rx to endpoints', () => {
    expect(directionLabel('tx')).toBe('0x01 OUT')
    expect(directionLabel('rx')).toBe('0x81 IN')
    expect(directionLabel('info')).toBe('—')
  })

  it('parseHex reads spaced hex and needs 16 bytes', () => {
    expect(parseHex('1c 03 0d 00 00 00 01 01 00 00 00 00 00 00 00 00 80')).not.toBeNull()
    expect(parseHex('1c 03 0d')).toBeNull()
  })

  it('packetType uses the decoded title for packets and text guesses otherwise', () => {
    expect(packetType(entry(1, 'tx', '', packets.requestDump()))).toBe('Request dump')
    expect(packetType(entry(2, 'info', 'Opened Mustang I/II (v2) over Simulated'))).toBe('link')
    expect(packetType(entry(3, 'info', 'something odd'))).toBe('other')
  })

  it('parseOffsets handles decimal, hex and ranges', () => {
    expect(parseOffsets('32, 0x20, 36-38')).toEqual(new Set([32, 36, 37, 38]))
    expect(parseOffsets('16..18 [20] 0x10')).toEqual(new Set([16, 17, 18, 20]))
    expect(parseOffsets('nonsense')).toEqual(new Set())
  })

  it('matchSearch and matchOffsets find fields', () => {
    const d = describePacket(packets.amp(DEFAULT_AMP))
    expect(matchSearch(d, 'treble')).toMatchObject({ name: 'Treble' })
    expect(matchSearch(d, 'amp settings')).toBe('packet')
    expect(matchSearch(d, 'nonexistent')).toBeNull()
    expect(matchOffsets(d, new Set([36]))).toMatchObject({ name: 'Treble' })
    expect(matchOffsets(d, new Set([60]))).toBeNull()
    expect(matchOffsets(d, new Set())).toBeNull()
  })
})
