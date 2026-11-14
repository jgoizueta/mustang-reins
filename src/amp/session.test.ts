import { describe, expect, it } from 'vitest'
import { AmpSession } from './session'
import { SimulatedTransport } from '../transport/simulated'
import { newPreset, withEffectModel } from '../protocol/preset'
import { DEVICES, type DeviceInfo } from '../protocol/packets'

function setup(opts: { autoReconnect?: boolean; device?: DeviceInfo } = {}) {
  const sim = new SimulatedTransport(opts.device)
  sim.presets[3].name = 'Crunch'
  sim.presets[3].amp.gain = 200
  sim.active = 3
  let present = true
  const notes: string[] = []
  const session = new AmpSession({
    createTransport: () => sim,
    devicePresent: async () => present,
    receiveMs: 20,
    handshakeMs: 5,
    changeSettleMs: 60,
    tunerIgnoreMs: 60,
    echoGuardMs: 0,
    pollMs: 10,
    autoReconnect: opts.autoReconnect ?? false,
    debug: (dir, data) => { if (dir === 'note') notes.push(String(data)) },
  })
  return { sim, session, notes, setPresent: (v: boolean) => (present = v) }
}

describe('AmpSession', () => {
  it('connects, reads the preset names and the active preset', async () => {
    const { session } = setup()
    await session.connect()
    const s = session.getSnapshot()
    expect(s.link).toBe('connected')
    expect(s.device.name).toBe('Mustang I/II (v2)')
    expect(s.presetNames).toHaveLength(24)
    expect(s.presetNames[3]).toBe('Crunch')
    expect(s.activeSlot).toBe(3)
    expect(s.preset.amp.gain).toBe(200)
  })

  it('sends the handshake before the dump', async () => {
    const { session, sim } = setup()
    await session.connect()
    expect(sim.sent.slice(0, 3).map((p) => [p[0], p[1]])).toEqual([[0, 0xc3], [0x1a, 193], [0xff, 0xc1]])
  })

  it('selects a slot and loads its settings', async () => {
    const { session, sim } = setup()
    sim.presets[7].amp.treble = 33
    await session.connect()
    await session.selectSlot(7)
    const s = session.getSnapshot()
    expect(s.activeSlot).toBe(7)
    expect(s.preset.amp.treble).toBe(33)
    expect(s.preset.name).toBe('Sim Preset 8')
    expect(s.loadingSlot).toBeNull()
  })

  it('sends amp changes to the amp', async () => {
    const { session, sim } = setup()
    await session.connect()
    await session.setAmp({ bass: 10, model: 117 })
    expect(sim.presets[3].amp.bass).toBe(10)
    expect(sim.presets[3].amp.model).toBe(117)
    expect(session.getSnapshot().dirty).toBe(true)
  })

  it('sends a knob turn in the app as a full amp packet, not the small live-knob packet', async () => {
    const { session, sim } = setup()
    await session.connect()
    const sent: number[][] = []
    const send = sim.send.bind(sim)
    sim.send = async (p: Uint8Array) => { sent.push([p[0], p[1], p[2]]); return send(p) }
    await session.setAmpKnob('treble', 91)
    expect(sent[0]).toEqual([0x1c, 3, 5])
    expect(sent.some((p) => p[0] === 0x05)).toBe(false)
    expect(sim.presets[3].amp.treble).toBe(91)
  })

  it('follows a physical knob turn', async () => {
    const { session, sim } = setup()
    await session.connect()
    sim.turnKnob(4, 77)
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().preset.amp.treble).toBe(77)
  })

  it('follows a preset button on the amp using the settings the amp pushes, without a dump', async () => {
    const { session, sim } = setup()
    sim.presets[9].amp.volume = 9
    await session.connect()
    const dumps = () => sim.sent.filter((p) => p[0] === 0xff).length
    const before = dumps()
    sim.pressPreset(9)
    await new Promise((r) => setTimeout(r, 150))
    expect(session.getSnapshot().activeSlot).toBe(9)
    expect(session.getSnapshot().preset.amp.volume).toBe(9)
    expect(dumps()).toBe(before)
  })

  it('asks with a dump when the amp changes preset but pushes nothing', async () => {
    const { session, sim } = setup()
    sim.presets[9].amp.volume = 9
    await session.connect()
    sim.pressPreset(9, false)
    await new Promise((r) => setTimeout(r, 300))
    expect(session.getSnapshot().activeSlot).toBe(9)
    expect(session.getSnapshot().preset.amp.volume).toBe(9)
  })

  it('does not dump when the state arrives just before the preset-change notice', async () => {
    const { session, sim } = setup()
    await session.connect()
    const dumps = () => sim.sent.filter((p) => p[0] === 0xff).length
    const before = dumps()
    sim.changeEffectOnAmp('mod', 18)
    await new Promise((r) => setTimeout(r, 30))
    sim.pressPreset(3, false)
    await new Promise((r) => setTimeout(r, 250))
    expect(dumps()).toBe(before)
    expect(session.getSnapshot().preset.effects.mod.model).toBe(18)
  })

  it('shows an effect chosen on the amp and keeps it', async () => {
    const { session, sim } = setup()
    await session.connect()
    sim.changeEffectOnAmp('delay', 22)
    await new Promise((r) => setTimeout(r, 20))
    expect(session.getSnapshot().preset.effects.delay).toMatchObject({ model: 22, enabled: true })
    await new Promise((r) => setTimeout(r, 300))
    expect(session.getSnapshot().preset.effects.delay.model).toBe(22)
  })

  it('sends a loaded preset to the amp and saves it into a slot', async () => {
    const { session, sim } = setup()
    await session.connect()
    const preset = newPreset('From file')
    preset.amp = { ...preset.amp, model: 94, gain: 77 }
    preset.effects.stomp = withEffectModel('stomp', preset.effects.stomp, 60)
    await session.loadPreset(preset)
    expect(sim.presets[3].amp).toMatchObject({ model: 94, gain: 77 })
    expect(sim.presets[3].effects.stomp.model).toBe(60)
    expect(session.getSnapshot().dirty).toBe(true)
    await session.saveToSlot(5)
    expect(sim.presets[5].name).toBe('From file')
    expect(session.getSnapshot()).toMatchObject({ activeSlot: 5, dirty: false })
    expect(session.getSnapshot().presetNames[5]).toBe('From file')
  })

  it('tracks the library entry the editor preset came from', async () => {
    const { session, sim } = setup()
    await session.connect()
    await session.loadPreset(newPreset('Lib'), true, 'abc')
    expect(session.getSnapshot().libraryId).toBe('abc')
    session.setName('Lib renamed')
    expect(session.getSnapshot().libraryId).toBe('abc')
    await session.saveToSlot(5)
    expect(session.getSnapshot().libraryId).toBe('abc')
    await session.loadPreset(newPreset('Lib'), true, 'abc')
    await session.selectSlot(7)
    expect(session.getSnapshot().libraryId).toBeNull()
    await session.loadPreset(newPreset('Lib'), true, 'abc')
    sim.pressPreset(9)
    await new Promise((r) => setTimeout(r, 150))
    expect(session.getSnapshot().libraryId).toBeNull()
  })

  it('live sync off keeps edits local and ignores amp reports until switched back on', async () => {
    const { session, sim } = setup()
    await session.connect()
    session.setLiveSync(false)
    const sent = sim.sent.length
    await session.setAmp({ bass: 10 })
    expect(sim.sent.length).toBe(sent)
    expect(session.getSnapshot().dirty).toBe(true)
    expect(session.getSnapshot().preset.amp.bass).toBe(10)
    sim.turnKnob(4, 77)
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().preset.amp.treble).not.toBe(77)
    await session.selectSlot(7)
    expect(sim.sent.length).toBe(sent)
    expect(session.getSnapshot().activeSlot).toBe(3)
    expect(session.getSnapshot().loadingSlot).toBeNull()
    session.setLiveSync(true)
    sim.turnKnob(4, 77)
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().preset.amp.treble).toBe(77)
    await session.setAmp({ bass: 20 })
    expect(sim.sent.length).toBeGreaterThan(sent)
    expect(sim.presets[3].amp.bass).toBe(20)
  })

  it('writes the diagnostics log: opened, disconnected, and setAutoReconnect in the snapshot', async () => {
    const lines: [string, string][] = []
    const sim = new SimulatedTransport()
    sim.active = 3
    const session = new AmpSession({ createTransport: () => sim, receiveMs: 20, handshakeMs: 5, autoReconnect: false,
      debug: (dir, data) => lines.push([dir, String(typeof data === 'string' ? data : data.length)]) })
    await session.connect()
    expect(lines.some(([d, t]) => d === 'note' && t.startsWith('Opened Mustang I/II (v2) over Simulated'))).toBe(true)
    await session.disconnect()
    expect(lines.some(([d, t]) => d === 'note' && t === 'Disconnected')).toBe(true)
    expect(session.getSnapshot().autoReconnect).toBe(false)
    session.setAutoReconnect(true)
    expect(session.getSnapshot().autoReconnect).toBe(true)
    session.dispose()
  })

  it('runs the tuner: on, readings, off, and ignores late readings', async () => {
    const { session, sim } = setup()
    await session.connect()
    await session.setTuner(true)
    expect(sim.tuning).toBe(true)
    expect(session.getSnapshot().tuner).toMatchObject({ active: true, reading: false })
    sim.tune(3, -12)
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().tuner).toEqual({ active: true, note: 3, cents: -12, reading: true })
    await session.setTuner(false)
    expect(sim.tuning).toBe(false)
    sim.tune(5, 4) // arrives just after switching off
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().tuner.active).toBe(false)
    await new Promise((r) => setTimeout(r, 80))
    sim.tune(5, 4)
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().tuner.active).toBe(true)
  })

  it('closes the tuner when the amp ends tuner mode itself', async () => {
    const { session, sim } = setup()
    await session.connect()
    await session.setTuner(true)
    sim.stopTunerOnAmp()
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().tuner.active).toBe(false)
  })

  it('does not close the tuner when an effect control moves', async () => {
    const { session, sim } = setup()
    sim.presets[3].effects.mod = withEffectModel('mod', sim.presets[3].effects.mod, 65)
    await session.connect()
    await session.setTuner(true)
    sim.turnEffectKnob('mod', 90)
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().tuner.active).toBe(true)
  })

  it('follows the amp\'s MOD and DLY/REV controls (Level) at once', async () => {
    const { session, sim } = setup()
    const fx = sim.presets[3].effects
    fx.mod = withEffectModel('mod', fx.mod, 65)
    fx.delay = withEffectModel('delay', fx.delay, 42)
    fx.reverb = withEffectModel('reverb', fx.reverb, 59)
    await session.connect()
    sim.turnEffectKnob('mod', 211)
    sim.turnEffectKnob('delay', 200)
    sim.turnEffectKnob('reverb', 190)
    await new Promise((r) => setTimeout(r, 15))
    const now = session.getSnapshot().preset.effects
    expect([now.mod.knobs[0], now.delay.knobs[0], now.reverb.knobs[0]]).toEqual([211, 200, 190])
  })

  it('follows the TAP button, which sets the delay time (parameter 1)', async () => {
    const { session, sim } = setup()
    sim.presets[3].effects.delay = withEffectModel('delay', sim.presets[3].effects.delay, 42)
    await session.connect()
    const level = session.getSnapshot().preset.effects.delay.knobs[0]
    sim.turnEffectKnob('delay', 36, 1)
    await new Promise((r) => setTimeout(r, 15))
    sim.turnEffectKnob('delay', 255, 1)
    await new Promise((r) => setTimeout(r, 15))
    const knobs = session.getSnapshot().preset.effects.delay.knobs
    expect(knobs[1]).toBe(255)
    expect(knobs[0]).toBe(level)
  })

  it('ignores a report for an effect the screen does not show, and an impossible parameter', async () => {
    const { session, sim } = setup()
    sim.presets[3].effects.mod = withEffectModel('mod', sim.presets[3].effects.mod, 65)
    await session.connect()
    const before = JSON.stringify(session.getSnapshot().preset.effects)
    sim.inject(Uint8Array.from([5, 1, 4, 0x99, 0, 1, 1, 6, 0, 77, 77])) // another mod model
    sim.inject(Uint8Array.from([5, 1, 4, 65, 0, 9, 9, 6, 0, 77, 77])) // parameter 9 does not exist
    await new Promise((r) => setTimeout(r, 15))
    expect(JSON.stringify(session.getSnapshot().preset.effects)).toBe(before)
  })

  it('ignores reports that look like echoes of our own writes', async () => {
    const sim = new SimulatedTransport()
    sim.active = 3
    sim.presets[3].effects.mod = withEffectModel('mod', sim.presets[3].effects.mod, 65)
    const session = new AmpSession({ createTransport: () => sim, handshakeMs: 5, receiveMs: 20, autoReconnect: false }) // default echo guard
    await session.connect()
    const before = session.getSnapshot().preset.effects.mod.knobs[0]
    sim.turnEffectKnob('mod', 77) // arrives right after our handshake and dump
    await new Promise((r) => setTimeout(r, 10))
    expect(session.getSnapshot().preset.effects.mod.knobs[0]).toBe(before)
    session.dispose()
  })

  it('does nothing while disconnected', async () => {
    const { session, sim } = setup()
    await session.setAmp({ bass: 1 })
    await session.selectSlot(2)
    expect(sim.sent).toHaveLength(0)
  })

  it('reports an error when the transport cannot open', async () => {
    const session = new AmpSession({
      createTransport: () => ({ kind: 'OFFLINE', open: async () => { throw new Error('No USB access') } }) as never,
      autoReconnect: false,
    })
    await session.connect()
    expect(session.getSnapshot().link).toBe('error')
    expect(session.getSnapshot().error).toBe('No USB access')
  })

  it('reconnects after the cable is pulled and restores the editor state', async () => {
    const { session, sim, setPresent } = setup({ autoReconnect: true })
    await session.connect()
    session.setAmp({ bass: 5 })
    await new Promise((r) => setTimeout(r, 5))
    setPresent(false)
    await session.waitFor('reconnecting')
    sim.presets[3].amp.bass = 128
    setPresent(true)
    await session.waitFor('connected', 5000)
    await new Promise((r) => setTimeout(r, 50))
    expect(sim.presets[3].amp.bass).toBe(5)
    session.dispose()
  })

  it('errors when the amp answers nothing at all', async () => {
    const sim = new SimulatedTransport()
    sim.mute = true
    const lines: [string, string][] = []
    const session = new AmpSession({ createTransport: () => sim, handshakeMs: 5, receiveMs: 5, autoReconnect: false,
      debug: (dir, data) => lines.push([dir, String(typeof data === 'string' ? data : data.length)]) })
    await session.connect()
    const msg = 'The amp does not answer. Close other windows or apps that use the amp, then switch the amp off and on again.'
    const s = session.getSnapshot()
    expect(s.link).toBe('error')
    expect(s.error).toBe(msg)
    expect(lines.some(([d, t]) => d === 'error' && t === msg)).toBe(true)
    session.dispose()
  })

  it('keeps retrying a muted amp and connects once it answers', async () => {
    const { session, sim } = setup({ autoReconnect: true })
    sim.mute = true
    await session.connect()
    expect(session.getSnapshot().link).toBe('error')
    sim.mute = false
    await session.waitFor('connected', 5000)
    expect(session.getSnapshot().link).toBe('connected')
    session.dispose()
  })

  it('closes cleanly on disconnect', async () => {
    const { session } = setup()
    await session.connect()
    await session.disconnect()
    const s = session.getSnapshot()
    expect(s.link).toBe('disconnected')
    expect(s.device.name).toContain('offline')
  })

  it('ignores a v2-only amp model on a v1 amp but applies the rest, with a note', async () => {
    const { session, notes } = setup({ device: DEVICES[0] }) // Mustang I/II v1
    await session.connect()
    expect(session.getSnapshot().device.isV2).toBe(false)
    const before = session.getSnapshot().preset.amp.model
    await session.setAmp({ model: 246, gain: 10 })
    const s = session.getSnapshot()
    expect(s.preset.amp.model).toBe(before)
    expect(s.preset.amp.gain).toBe(10)
    expect(notes.some((n) => n === "Fender '57 Twin needs a Mustang v2; ignored")).toBe(true)
  })

  it('ignores a v2-only effect model on a v1 amp, with a note', async () => {
    const { session, notes } = setup({ device: DEVICES[0] })
    await session.connect()
    const before = session.getSnapshot().preset.effects.stomp.model
    await session.setEffectModel('stomp', 259) // Ranger Boost is v2-only
    expect(session.getSnapshot().preset.effects.stomp.model).toBe(before)
    expect(notes.some((n) => n === 'Ranger Boost needs a Mustang v2; ignored')).toBe(true)
  })

  it('accepts v2-only models on a v2 amp', async () => {
    const { session } = setup() // DEVICES[2], v2
    await session.connect()
    await session.setAmp({ model: 246 })
    expect(session.getSnapshot().preset.amp.model).toBe(246)
    await session.setEffectModel('stomp', 259)
    expect(session.getSnapshot().preset.effects.stomp.model).toBe(259)
  })
})

describe('bank backup/restore', () => {
  it('reads slots into presets without touching the editor and reselects the active slot', async () => {
    const { session, sim } = setup()
    await session.connect()
    const before = session.getSnapshot().preset
    const progress: number[] = []
    const out = await session.backupSlots([0, 1, 2], (d) => progress.push(d))
    expect(out.map((o) => o.slot)).toEqual([0, 1, 2])
    expect(out[0].preset.name).toBe('Sim Preset 1')
    expect(progress).toEqual([1, 2, 3])
    expect(session.getSnapshot().preset).toBe(before) // same object: untouched
    expect(sim.active).toBe(3) // back on the editor's slot
    expect(session.getSnapshot().activeSlot).toBe(3)
  })

  it('writes presets into slots and updates presetNames', async () => {
    const { session, sim, notes } = setup()
    await session.connect()
    await session.restoreSlots([
      { slot: 0, preset: { ...newPreset('Bank A'), amp: { ...newPreset('x').amp, gain: 111 } } },
      { slot: 1, preset: newPreset('Bank B') },
    ])
    expect(sim.presets[0].name).toBe('Bank A')
    expect(sim.presets[0].amp.gain).toBe(111)
    expect(sim.presets[1].name).toBe('Bank B')
    const s = session.getSnapshot()
    expect(s.presetNames.slice(0, 2)).toEqual(['Bank A', 'Bank B'])
    expect(s.activeSlot).toBe(3) // the editor stayed on its slot
    expect(notes.filter((n) => n.startsWith('No reply'))).toHaveLength(0) // all writes acked
  })

  it('pushes a dirty editor preset back onto the amp after the run', async () => {
    const { session, sim } = setup()
    await session.connect()
    await session.setAmp({ gain: 100 })
    expect(session.getSnapshot().dirty).toBe(true)
    await session.backupSlots([0, 1])
    const s = session.getSnapshot()
    expect(s.dirty).toBe(true) // editor flags kept
    expect(s.activeSlot).toBe(3)
    expect(sim.active).toBe(3)
    expect(sim.presets[3].amp.gain).toBe(100) // amp plays what the editor shows again
  })

  it('reloads a clean editor when its active slot was overwritten', async () => {
    const { session } = setup()
    await session.connect()
    expect(session.getSnapshot().dirty).toBe(false)
    await session.restoreSlots([{ slot: 3, preset: newPreset('Restored') }])
    const s = session.getSnapshot()
    expect(s.preset.name).toBe('Restored')
    expect(s.activeSlot).toBe(3)
    expect(s.dirty).toBe(false)
  })

  it('pushes the editor when no amp slot was selected', async () => {
    const { session, sim } = setup()
    await session.connect()
    await session.loadPreset({ ...newPreset('Loose'), amp: { ...newPreset('x').amp, gain: 77 } }, true, null)
    expect(session.getSnapshot().activeSlot).toBeNull()
    await session.backupSlots([0])
    expect(session.getSnapshot().activeSlot).toBeNull()
    expect(sim.presets[sim.active].amp.gain).toBe(77)
  })

  it('aborts between slots', async () => {
    const { session } = setup()
    await session.connect()
    const ctrl = new AbortController()
    const out = await session.backupSlots([0, 1, 2, 3], (d) => { if (d === 1) ctrl.abort() }, ctrl.signal)
    expect(out).toHaveLength(1)

    const ctrl2 = new AbortController()
    const written: number[] = []
    await session.restoreSlots(
      [0, 1, 2].map((slot) => ({ slot, preset: newPreset(`W${slot}`) })),
      (d) => { written.push(d); if (d === 1) ctrl2.abort() },
      ctrl2.signal)
    expect(written).toEqual([1])
    expect(session.getSnapshot().presetNames[0]).toBe('W0')
    expect(session.getSnapshot().presetNames[1]).not.toBe('W1')
  })

  it('waits for the slot reply and each write ack before sending the next packet', async () => {
    const sim = new SimulatedTransport(DEVICES[2], 15)
    const session = new AmpSession({ createTransport: () => sim, handshakeMs: 5, receiveMs: 20, autoReconnect: false,
      slotLoadTimeoutMs: 500, ackTimeoutMs: 200, saveSettleMs: 5 })
    await session.connect()
    sim.log.length = 0
    await session.restoreSlots([{ slot: 0, preset: newPreset('T0') }, { slot: 1, preset: newPreset('T1') }])
    const isTrailer = (p: Uint8Array, slot: number) => p[0] === 0x1c && p[1] === 1 && p[2] === 0 && p[4] === slot
    const isAck = (p: Uint8Array) => p[0] === 0 && p[1] === 0 && p[2] === 0x1c
    const isSelect = (p: Uint8Array) => p[0] === 0x1c && p[1] === 1 && p[2] === 1
    const isSave = (p: Uint8Array) => p[0] === 0x1c && p[1] === 1 && p[2] === 3
    const writeTxs: number[] = []
    sim.log.forEach((e, i) => { if (e.dir === 'tx' && !isSelect(e.p) && !isSave(e.p)) writeTxs.push(i) })
    // No `1c 03 …` write goes out while a reply is still pending: each one follows an rx.
    for (const i of writeTxs) expect(sim.log[i - 1]?.dir, `tx #${i}`).toBe('rx')
    // The first write of each slot waits for that slot's trailer; each later write waits for the previous ack.
    expect(isTrailer(sim.log[writeTxs[0] - 1].p, 0)).toBe(true)
    expect(isAck(sim.log[writeTxs[1] - 1].p)).toBe(true)
    // The save gets no ack: the next slot's select follows it after the settle pause.
    const slot1Select = sim.log.findIndex((e) => e.dir === 'tx' && isSelect(e.p) && e.p[4] === 1)
    expect(isSave(sim.log[slot1Select - 1].p)).toBe(true)
    const firstSlot1Write = writeTxs.find((i) => i > slot1Select)!
    expect(isTrailer(sim.log[firstSlot1Write - 1].p, 1)).toBe(true)
  })

  it('finishes the restore when the amp drops its acks', async () => {
    const sim = new SimulatedTransport()
    sim.dropAcks = true
    const notes: string[] = []
    const session = new AmpSession({ createTransport: () => sim, handshakeMs: 5, receiveMs: 20, autoReconnect: false,
      ackTimeoutMs: 10, slotLoadTimeoutMs: 200, saveSettleMs: 5,
      debug: (dir, data) => { if (dir === 'note') notes.push(String(data)) } })
    await session.connect()
    await session.restoreSlots([{ slot: 0, preset: { ...newPreset('Bank X'), amp: { ...newPreset('x').amp, gain: 123 } } }])
    expect(sim.presets[0].name).toBe('Bank X')
    expect(sim.presets[0].amp.gain).toBe(123)
    expect(session.getSnapshot().presetNames[0]).toBe('Bank X')
    // 12 `1c 03 …` writes per slot; the save gets no ack and logs nothing.
    expect(notes.filter((n) => n.startsWith('No reply')).length).toBe(12)
  })

  it('requires a connection and live sync', async () => {
    const { session } = setup()
    await expect(session.backupSlots([0])).rejects.toThrow('Connect the amp first')
    await session.connect()
    session.setLiveSync(false)
    await expect(session.restoreSlots([])).rejects.toThrow('Live sync')
  })
})
