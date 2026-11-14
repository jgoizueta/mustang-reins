// 64-byte HID packet builders for Fender Mustang amps.
// Layouts follow the community-documented protocol (python-mustang, mustang-midi-ctl).

export const PACKET_SIZE = 64

export const VENDOR_ID = 0x1ed8

export interface DeviceInfo {
  productId: number
  name: string
  isV2: boolean
  initValue: number
  presetCount: number
}

export const DEVICES: DeviceInfo[] = [
  { productId: 4, name: 'Mustang I/II (v1)', isV2: false, initValue: 3, presetCount: 24 },
  { productId: 5, name: 'Mustang III/IV/V (v1)', isV2: false, initValue: 3, presetCount: 100 },
  { productId: 20, name: 'Mustang I/II (v2)', isV2: true, initValue: 193, presetCount: 24 },
  { productId: 21, name: 'Mustang III/IV/V (v2)', isV2: true, initValue: 193, presetCount: 100 },
]

/** The Mustang I/II sets Master with a hardware control: the amp neither reports nor accepts it over USB. */
export const hasDigitalMaster = (d: DeviceInfo) => d.presetCount > 24

export type EffectFamily = 'stomp' | 'mod' | 'delay' | 'reverb'

/** DSP type byte (packet byte 2) for each effect family. */
export const DSP_TYPE: Record<EffectFamily, number> = { stomp: 6, mod: 7, delay: 8, reverb: 9 }

class Packet {
  private readonly buf = new Uint8Array(PACKET_SIZE)

  header(...bytes: number[]) {
    return this.bytes(0, bytes)
  }
  byte(offset: number, value: number) {
    if (offset >= 0 && offset < PACKET_SIZE) this.buf[offset] = value & 0xff
    return this
  }
  bytes(offset: number, values: ArrayLike<number>) {
    for (let i = 0; i < values.length; i++) this.byte(offset + i, values[i])
    return this
  }
  ascii(offset: number, text: string, length: number) {
    for (let i = 0; i < length; i++) this.byte(offset + i, i < text.length ? text.charCodeAt(i) & 0x7f : 0)
    return this
  }
  build() {
    return new Uint8Array(this.buf)
  }
}

export interface AmpModelInfo {
  /** Five model-specific bytes the amp needs next to the user parameters. */
  magic: [number, number, number, number, number]
}

export interface AmpSettings {
  model: number
  volume: number
  gain: number
  gain2: number
  masterVolume: number
  treble: number
  middle: number
  bass: number
  presence: number
  depth: number
  bias: number
  noiseGate: number
  threshold: number
  cabinet: number
  sag: number
  brightness: number
}

export interface EffectSettings {
  model: number
  slot: number
  position: 'pre' | 'post'
  enabled: boolean
  knobs: number[]
  /**
   * Bytes the amp sends in an effect report that are not knobs: bytes 19-21 and 38-39. They differ per effect,
   * and the amp wants them back when the effect is written, or it may play the effect weaker or not at all.
   */
  extra?: number[]
}

export const packets = {
  init0: () => new Packet().header(0x00, 0xc3).build(),
  init1: (initValue: number) => new Packet().header(0x1a, initValue).build(),
  requestDump: () => new Packet().header(0xff, 0xc1).build(),
  tunerOn: () => new Packet().header(0x0a, 1, 1, 1, 1, 0).build(),
  tunerOff: () => new Packet().header(0x0a, 1, 0, 1, 1, 1, 1).build(),
  apply: () => new Packet().header(0x1c, 0x03).build(),
  selectPreset: (slot: number) => new Packet().header(0x1c, 1, 1, 0, slot, 0, 1, 0).build(),
  savePreset: (slot: number, name: string) =>
    new Packet().header(0x1c, 1, 3, 0, slot, 0, 1, 1).ascii(16, name, 32).build(),
  /** Live knob turn (index 0-7 = volume, gain, gain2, master, treble, middle, bass, presence). */
  ampKnob: (index: number, value: number) =>
    new Packet().header(0x05, 1, 2, 246, 0, index, index, 12, 0, value === 255 ? 255 : 0, value).build(),
  usbGain: (value: number) => new Packet().header(0x1c, 3, 13, 0, 0, 0, 1, 1).byte(16, value).build(),
  amp: (a: AmpSettings, info?: AmpModelInfo) => {
    const m = info?.magic ?? [0, 0, 0, 0, 0]
    return new Packet()
      .header(0x1c, 3, 5, 0, 0, 0, 1, 1)
      .byte(16, a.model)
      .bytes(32, [
        a.volume, a.gain, a.gain2, a.masterVolume, a.treble, a.middle, a.bass, a.presence,
        128, a.depth, a.bias, 128, m[0], m[1], m[2],
        a.noiseGate, a.noiseGate === 5 ? a.threshold : 0, a.cabinet,
        m[3], a.sag, a.brightness, 128, m[4],
      ])
      .build()
  },
  effect: (family: EffectFamily, e: EffectSettings) =>
    new Packet()
      .header(0x1c, 3, DSP_TYPE[family], 0, 0, 0, 1, 1)
      .byte(16, e.model)
      .byte(17, e.model >> 8)
      .byte(18, e.position === 'post' ? e.slot + 4 : e.slot)
      .byte(22, e.enabled ? 0 : 1)
      .bytes(32, Array.from({ length: 6 }, (_, i) => e.knobs[i] ?? 0))
      .bytes(19, e.extra ? e.extra.slice(0, 3) : [])
      .bytes(38, e.extra ? e.extra.slice(3, 5) : [])
      .build(),
  clearEffect: (family: EffectFamily) =>
    new Packet().header(0x1c, 3, DSP_TYPE[family], 0, 0, 0, 1, 1).build(),
  /** Live on/off toggle that leaves the effect settings untouched. */
  toggleEffect: (family: EffectFamily, slot: number, position: 'pre' | 'post', enabled: boolean) =>
    new Packet()
      .header(0x19, 0xc3, DSP_TYPE[family] - 3, enabled ? 0 : 1, position === 'post' ? slot + 4 : slot, 0, 1, 1)
      .build(),
}
