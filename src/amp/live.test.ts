import { describe, expect, it } from 'vitest'
import { AmpSession } from './session'
import { SimulatedTransport } from '../transport/simulated'

/** Packets copied from a capture on a real Mustang II (v2). Bytes not listed are zero. */
function pkt(head: string, at = 0, tail = ''): Uint8Array {
  const p = new Uint8Array(64)
  const bytes = (s: string) => s.trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16))
  p.set(bytes(head), 0)
  if (tail) p.set(bytes(tail), at)
  return p
}
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0).toString(16)).join(' ')

// User picked a modulation effect on the amp: the effect report, then a trailer that looks like a preset change.
const MOD_VIBRATONE = pkt('1c 01 07 00 09 00 01 01', 16, '2d 00 05 01 01 01 00 00 00 00 00 00 00 00 00 00 f4 ff 27 ad 82 80 80 80')
const TRAILER_SLOT_9 = pkt('1c 01 00 00 09 00 01 01')

// User pressed preset 12 on the amp: the amp pushes the whole preset, then the trailer.
const PUSH_SLOT_11 = [
  pkt('1c 01 04 00 0b 00 01 00', 16, ascii('Cliffs')),
  pkt('1c 01 05 00 0b 00 01 00', 16, '5e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2b 57 80 7d 00 9f ff 00 80 00 80 80 09 09 09 01 02 06 09 01 00 01'),
  pkt('1c 01 06 00 0b 00 01 00', 16, '1a 00 00 00 08 01 00 00 00 00 00 00 00 00 00 00 46 ff 00 de 00 80 80 80'),
  pkt('1c 01 07 00 0b 00 01 00', 16, '00 00 05 08 08 01 00 00 00 00 00 00 00 00 00 00 ff'),
  pkt('1c 01 08 00 0b 00 01 00', 16, '2b 00 06 01 01 01 00 00 00 00 00 00 00 00 00 00 45 40 2a 62 ac 00 80 80'),
  pkt('1c 01 09 00 0b 00 01 00', 16, '3a 00 07 00 08 01 00 00 00 00 00 00 00 00 00 00 20 48 ab 80 ff 80 80 80'),
  pkt('1c 01 0d 00 0b 00 01 00', 16, 'e8'),
  pkt('1c 01 00 00 0b 00 01 00'),
]

function setup() {
  const sim = new SimulatedTransport()
  const session = new AmpSession({
    createTransport: () => sim, receiveMs: 20, handshakeMs: 5, changeSettleMs: 80, autoReconnect: false,
  })
  const dumps = () => sim.sent.filter((p) => p[0] === 0xff).length
  return { sim, session, dumps }
}
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('reports the real amp sends (sub-opcode 1)', () => {
  it('shows an effect chosen on the amp at once, with no dump', async () => {
    const { sim, session, dumps } = setup()
    await session.connect()
    const before = dumps()
    sim.inject(MOD_VIBRATONE, TRAILER_SLOT_9)
    await tick(20)
    expect(session.getSnapshot().preset.effects.mod).toMatchObject({ model: 45, enabled: true, position: 'post', slot: 1 })
    expect(session.getSnapshot().activeSlot).toBe(9)
    await tick(250)
    expect(dumps()).toBe(before)
    expect(session.getSnapshot().preset.effects.mod.model).toBe(45)
  })

  it('loads a whole preset the amp pushes after a preset button, with no dump', async () => {
    const { sim, session, dumps } = setup()
    await session.connect()
    const before = dumps()
    sim.inject(...PUSH_SLOT_11)
    await tick(20)
    const s = session.getSnapshot()
    expect(s.activeSlot).toBe(11)
    expect(s.preset.name).toBe('Cliffs')
    expect(s.preset.amp.model).toBe(0x5e)
    expect(s.preset.effects.stomp).toMatchObject({ model: 0x1a, enabled: true })
    expect(s.preset.effects.delay.model).toBe(0x2b)
    expect(s.preset.effects.mod.model).toBe(0)
    expect(s.preset.usbGain).toBe(0xe8)
    await tick(250)
    expect(dumps()).toBe(before)
  })
})
