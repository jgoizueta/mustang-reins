// An in-memory amp built from the protocol as understood from the packet layouts.
// It lets the UI and session logic run with no hardware. It is NOT proof that real amps behave this way.
import { DEVICES, packets, type DeviceInfo } from '../protocol/packets'
import { FAMILIES, newPreset, type Preset } from '../protocol/preset'
import { PacketQueue, type Transport } from './types'

const DSP: Record<string, number> = { stomp: 6, mod: 7, delay: 8, reverb: 9 }

function namePacket(slot: number, name: string): Uint8Array {
  const p = packets.savePreset(slot, name)
  p[0] = 0x1c; p[1] = 0x03; p[2] = 0x04
  return p
}

/** The report that ends the amp's answer to a slot select (`1c 01 00 00 <slot>`). */
function slotTrailer(slot: number): Uint8Array {
  const p = new Uint8Array(64)
  p.set([0x1c, 1, 0, 0, slot])
  return p
}

/** The ack a real amp sends after each write packet (`00 00 1c …` "Jun 11 2012"). */
function writeAck(): Uint8Array {
  const p = new Uint8Array(64)
  p.set([0, 0, 0x1c, 0, 0x4a, 0x75, 0x6e, 0x20, 0x31, 0x31, 0x20, 0x32, 0x30, 0x31, 0x32, 0, 0, 0, 0, 0, 0x0b])
  return p
}

export class SimulatedTransport implements Transport {
  readonly kind = 'Simulated' as const
  private rx = new PacketQueue()
  private open_ = false
  readonly presets: Preset[]
  active = 0
  /** True while the host has the tuner switched on. */
  tuning = false
  /** Packets the host sent, for assertions. */
  readonly sent: Uint8Array[] = []
  /** Accept sends but never produce any packet, like an amp whose USB is held by another app. */
  mute = false
  /** Do not send the write acks (a real amp loses some of them; bank writes must not depend on them). The save packet never gets one anyway. */
  dropAcks = false
  /** Ordered record of host sends (`tx`) and emitted packets (`rx`), for ordering assertions. */
  readonly log: { dir: 'tx' | 'rx'; p: Uint8Array }[] = []

  private readonly device: DeviceInfo
  private readonly delayMs: number

  private demoTimer: ReturnType<typeof setInterval> | null = null
  private readonly demoTuner: boolean

  /** `demoTuner` makes the simulated tuner report a note that drifts across the meter, for trying the UI. */
  constructor(device: DeviceInfo = DEVICES[2], delayMs = 0, demoTuner = false) {
    this.demoTuner = demoTuner
    this.device = device
    this.delayMs = delayMs
    this.presets = Array.from({ length: device.presetCount }, (_, i) => newPreset(`Sim Preset ${i + 1}`))
  }

  async open() {
    this.open_ = true
    return this.device
  }
  async close() {
    if (this.demoTimer) clearInterval(this.demoTimer)
    this.open_ = false
    this.rx.flush()
  }

  private emit(list: Uint8Array[]) {
    const run = () => list.forEach((p) => { if (this.open_) { this.log.push({ dir: 'rx', p }); this.rx.push(p) } })
    if (this.delayMs) setTimeout(run, this.delayMs)
    else queueMicrotask(run)
  }

  private ack() {
    if (!this.dropAcks) this.emit([writeAck()])
  }

  private stateBlock(slot: number): Uint8Array[] {
    const pr = this.presets[slot]
    const block = [namePacket(slot, pr.name)]
    block.push(packets.amp(pr.amp))
    block.push(packets.usbGain(pr.usbGain))
    FAMILIES.forEach((f) => block.push(packets.effect(f, pr.effects[f])))
    return block
  }

  async send(p: Uint8Array) {
    if (!this.open_) throw new Error('Not connected')
    this.sent.push(p)
    this.log.push({ dir: 'tx', p })
    if (this.mute) return
    const [a, b, c] = p
    if (a === 0x0a) {
      this.tuning = c === 1
      if (this.demoTimer) clearInterval(this.demoTimer)
      this.demoTimer = null
      if (this.tuning && this.demoTuner) {
        let t = 0
        this.demoTimer = setInterval(() => this.tune(7, Math.round(Math.sin((t += 0.15)) * 40)), 80)
      }
    }
    if (a === 0xff && b === 0xc1) {
      const out: Uint8Array[] = []
      this.presets.forEach((pr, i) => out.push(namePacket(i, pr.name), new Uint8Array(64)))
      out.push(...this.stateBlock(this.active))
      this.emit(out)
    } else if (a === 0x1c && b === 1 && c === 1) {
      this.active = p[4]
      this.emit([...this.stateBlock(this.active), slotTrailer(this.active)])
    } else if (a === 0x1c && b === 1 && c === 3) {
      this.presets[p[4]] = { ...this.presets[this.active], name: String.fromCharCode(...p.slice(16, 48)).replace(/\0.*$/, '') }
      // A real amp sends no ack to the save packet.
    } else if (a === 0x1c && b === 3 && c === 5) {
      const pr = this.presets[this.active]
      pr.amp = { ...pr.amp, model: p[16], volume: p[32], gain: p[33], gain2: p[34], masterVolume: p[35], treble: p[36],
        middle: p[37], bass: p[38], presence: p[39], depth: p[41], bias: p[42], cabinet: p[49], sag: p[51], brightness: p[52] }
      this.ack()
    } else if (a === 0x1c && b === 3 && c === 13) {
      this.presets[this.active].usbGain = p[16]
      this.ack()
    } else if (a === 0x1c && b === 3 && Object.values(DSP).includes(c)) {
      const fam = FAMILIES.find((f) => DSP[f] === c)!
      const model = p[16] | (p[17] << 8)
      this.presets[this.active].effects[fam] = { model, slot: p[18] > 3 ? p[18] - 4 : p[18],
        position: p[18] > 3 ? 'post' : 'pre', enabled: model !== 0 && p[22] === 0, knobs: Array.from(p.slice(32, 38)) }
      this.ack()
    } else if (a === 0x1c && b === 3) {
      // Other writes (clear-effect, the `1c 03 00` apply packet) change nothing here but still get the ack.
      this.ack()
    }
  }

  drain() {
    this.rx.clear()
  }
  receive(timeoutMs = 500) {
    return this.rx.receive(timeoutMs)
  }
  onPacket(l: (p: Uint8Array) => void) {
    return this.rx.subscribe(l)
  }

  /** Deliver raw packets as if the amp had sent them. */
  inject(...list: Uint8Array[]) {
    this.emit(list)
  }

  /**
   * Simulate the amp changing an effect parameter itself (its MOD or DLY/REV control moves Level, index 0; the TAP
   * button moves Delay Time, index 1): the amp changes the parameter and reports it.
   */
  turnEffectKnob(family: (typeof FAMILIES)[number], value: number, param = 0) {
    const fx = this.presets[this.active].effects[family]
    fx.knobs[param] = value
    const p = new Uint8Array(64)
    p.set([0x05, 1, DSP[family] - 3, fx.model & 255, 0, param, param, param === 0 ? 1 : 6, 0, value, value])
    this.emit([p])
  }

  /** Simulate the tuner hearing a note (semitones from A) and how many cents it is off. */
  tune(note: number, cents: number) {
    const p = new Uint8Array(64)
    p.set([0x0b, 1, note, cents & 0xff])
    this.emit([p])
  }
  /** Simulate the amp ending tuner mode by itself. */
  stopTunerOnAmp() {
    const p = new Uint8Array(64)
    p.set([0x05, 1, 4])
    this.tuning = false
    this.emit([p])
  }

  /** Simulate the user turning a physical knob on the amp. */
  turnKnob(index: number, value: number) {
    this.emit([packets.ampKnob(index, value)])
  }
  /** Simulate the user pressing a preset button on the amp. */
  pressPreset(slot: number, pushState = true) {
    this.active = slot
    const p = new Uint8Array(64)
    p.set([0x1c, 1, 0, 0, slot])
    this.emit(pushState ? [p, ...this.stateBlock(slot)] : [p])
  }
  /** Simulate choosing an effect with the amp's own controls: the amp reports the new effect settings. */
  changeEffectOnAmp(family: (typeof FAMILIES)[number], model: number) {
    const fx = { ...this.presets[this.active].effects[family], model, enabled: model !== 0 }
    this.presets[this.active].effects[family] = fx
    this.emit([packets.effect(family, fx)])
  }
}
