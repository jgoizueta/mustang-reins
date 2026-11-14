// Field-by-field packet descriptions for the USB traffic log. Ported from the original app's decoder
// and extended with what our own decoder knows (see decode.ts and the "Protocol notes" in AGENTS.md).
import { ampById, CABINETS, NOISE_GATE, SAG } from '../data/amps'
import { effectById } from '../data/effects'
import { DSP_TYPE, type EffectFamily } from './packets'
import { readAscii } from './decode'

export interface PacketField {
  offset: string
  name: string
  raw: string
  value: string
  bytes?: number[]
}

export interface PacketDescription {
  title: string
  summary: string
  fields: PacketField[]
}

const FAMILY_BY_DSP = new Map(Object.entries(DSP_TYPE).map(([k, v]) => [v, k as EffectFamily]))
const FAMILY_LABEL: Record<EffectFamily, string> = { stomp: 'Stomp', mod: 'Mod', delay: 'Delay', reverb: 'Reverb' }

const hexByte = (b = 0) => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`
const offsetLabel = (o: number) => `[${String(o).padStart(2, '0')}]`

function field(offset: number, name: string, p: Uint8Array, value?: string): PacketField {
  return { offset: offsetLabel(offset), name, raw: `${hexByte(p[offset])} (${p[offset]})`, value: value ?? String(p[offset]), bytes: [offset] }
}

const percent = (v: number) => `${Math.round((v / 255) * 100)}%`

const KNOB_NAMES = ['Volume', 'Gain', 'Gain 2', 'Master Volume', 'Treble', 'Middle', 'Bass', 'Presence']

function ampFields(p: Uint8Array): PacketField[] {
  return [
    field(16, 'Amp model', p, ampById(p[16])?.name ?? 'Unknown'),
    field(32, 'Volume', p, percent(p[32])),
    field(33, 'Gain', p, percent(p[33])),
    field(34, 'Gain 2', p, percent(p[34])),
    field(35, 'Master volume', p, percent(p[35])),
    field(36, 'Treble', p, percent(p[36])),
    field(37, 'Middle', p, percent(p[37])),
    field(38, 'Bass', p, percent(p[38])),
    field(39, 'Presence', p, percent(p[39])),
    field(41, 'Depth', p, percent(p[41])),
    field(42, 'Bias', p, percent(p[42])),
    field(47, 'Noise gate', p, NOISE_GATE[p[47]] ?? '—'),
    field(48, 'Gate threshold', p),
    field(49, 'Cabinet', p, CABINETS.find((c) => c.id === p[49])?.name ?? 'Unknown'),
    field(51, 'Sag', p, SAG[p[51]] ?? '—'),
    field(52, 'Brightness', p, p[52] ? 'On' : 'Off'),
  ]
}

function effectFields(p: Uint8Array, family: EffectFamily): PacketField[] {
  const model = p[16] | (p[17] << 8)
  const info = effectById(family, model)
  const names = info?.knobs ?? []
  const knobs = Array.from({ length: 6 }, (_, i) =>
    field(32 + i, names[i] ? `Knob ${i + 1} · ${names[i]}` : `Knob ${i + 1}`, p, percent(p[32 + i])))
  const slot = p[18]
  return [
    { offset: `${offsetLabel(16)}${offsetLabel(17)}`, name: 'Effect model', raw: hexByte(model), value: info?.name ?? (model === 0 ? 'Empty' : 'Unknown'), bytes: [16, 17] },
    field(18, 'Slot / position', p, `${(slot > 3 ? slot - 4 : slot) + 1} · ${slot > 3 ? 'post' : 'pre'}`),
    field(19, 'Extra', p),
    field(20, 'Extra', p),
    field(21, 'Extra', p),
    field(22, 'Status', p, p[22] === 0 ? 'Enabled' : 'Bypassed'),
    ...knobs,
    field(38, 'Extra', p),
    field(39, 'Extra', p),
  ]
}

function stateBlockFields(p: Uint8Array, dsp: number, header: PacketField[]): PacketDescription {
  if (dsp === 5) return { title: 'Amp settings', summary: 'Full amp model, tone stack and advanced parameters.', fields: [...header, ...ampFields(p)] }
  if (dsp === 13) return { title: 'USB gain', summary: 'Sets the USB audio output gain.', fields: [...header, field(16, 'USB gain', p, percent(p[16]))] }
  if (dsp === 4) {
    return {
      title: 'Preset name', summary: 'Name record for a preset slot.',
      fields: [...header, { offset: '[16..47]', name: 'Name', raw: 'ASCII', value: readAscii(p) || '—', bytes: Array.from({ length: 32 }, (_, i) => 16 + i) }],
    }
  }
  const family = FAMILY_BY_DSP.get(dsp)
  if (family) {
    return {
      title: `${FAMILY_LABEL[family]} effect`,
      summary: `Writes the ${FAMILY_LABEL[family].toLowerCase()} model, routing and knob values.`,
      fields: [...header, field(2, 'DSP family', p, FAMILY_LABEL[family]), ...effectFields(p, family)],
    }
  }
  return { title: 'Unknown packet', summary: 'No decoder matched this opcode — inspect the raw bytes below.', fields: header }
}

/** Describe one 64-byte packet: title, a one-line summary and the decoded fields. */
export function describePacket(p: Uint8Array): PacketDescription {
  const [a, b, c] = p
  const header = [field(0, 'Report / opcode', p), field(1, 'Sub-opcode', p)]

  // Live amp knob turn (decode.ts).
  if (a === 5 && b === 1 && c === 2) {
    const knob = KNOB_NAMES[p[5]] ?? `Unknown knob (${p[5]})`
    return {
      title: 'Amp knob turn',
      summary: 'Live report when a physical amp knob is turned.',
      fields: [...header, field(2, 'Class', p), field(3, 'Sub-class', p), field(5, 'Knob ID', p, knob), field(10, 'Value', p, percent(p[10]))],
    }
  }
  // The amp's own effect controls: 05 01 <dsp-3> <model> 00 <param> <param> <kind> 00 <v> <v> (decode.ts).
  if (a === 5 && b === 1 && c >= 3 && c <= 6 && p[3] !== 0) {
    const family = FAMILY_BY_DSP.get(c + 3)
    const info = family ? effectById(family, p[3]) : undefined
    const paramName = info?.knobs[p[5]]
    return {
      title: 'Effect knob turn',
      summary: 'Live report when the amp changes an effect parameter itself (MOD/DLY-REV control or TAP).',
      fields: [
        ...header,
        field(2, 'DSP - 3', p, family ? FAMILY_LABEL[family] : 'Unknown'),
        field(3, 'Effect model', p, info?.name ?? 'Unknown'),
        field(5, 'Parameter', p, paramName ? `${p[5]} · ${paramName}` : String(p[5])),
        field(9, 'Value', p, percent(p[9])),
      ],
    }
  }
  // The amp ends tuner mode itself (byte 3 = 0 distinguishes it from an effect report; decode.ts).
  if (a === 5 && c === 4) {
    return { title: 'Tuner stop', summary: 'The amp left tuner mode by itself.', fields: header }
  }
  // Firmware build date reply.
  if (a === 0 && b === 0 && c === 28 && p[3] === 0) {
    let text = ''
    const bytes: number[] = []
    for (let i = 4; i < 64 && p[i] !== 0 && p[i] !== 10; i++) {
      text += String.fromCharCode(p[i])
      bytes.push(i)
    }
    return {
      title: 'Firmware build date',
      summary: 'Amplifier firmware build date response.',
      fields: [...header, field(2, 'Payload length', p, `${p[2]} bytes`), { offset: `[4..${4 + bytes.length - 1}]`, name: 'Build date', raw: 'ASCII', value: text, bytes }],
    }
  }
  if (a === 0 && b === 195) return { title: 'Init 0', summary: "Handshake step 1 — wakes the amp's USB endpoint.", fields: header }
  if (a === 26) return { title: 'Init 1', summary: 'Handshake step 2 — completes the session setup.', fields: header }
  if (a === 255 && b === 193) return { title: 'Request dump', summary: 'Asks the amp to stream its preset names and active state block.', fields: header }
  if (a === 10) {
    return {
      title: c === 1 ? 'Tuner activate' : 'Tuner deactivate',
      summary: "Toggles the amp's built-in chromatic tuner.",
      fields: [...header, field(2, 'Tuner on', p, c === 1 ? 'Yes' : 'No')],
    }
  }
  if (a === 11) {
    let cents = p[3]
    if (cents > 127) cents -= 256
    return {
      title: 'Tuner reading',
      summary: 'Live pitch report while the tuner is running.',
      fields: [...header, field(2, 'Note ID', p), { offset: offsetLabel(3), name: 'Cents offset', raw: hexByte(p[3]), value: `${cents > 0 ? '+' : ''}${cents}`, bytes: [3] }],
    }
  }
  // Live on/off toggle for an effect (decode.ts: effectToggle).
  if (a === 25 && b === 195) {
    const family = FAMILY_BY_DSP.get(c + 3)
    return {
      title: 'Effect bypass',
      summary: `Live on/off toggle for the ${family ? FAMILY_LABEL[family] : 'effect'} slot without rewriting its settings.`,
      fields: [
        ...header,
        field(2, 'DSP - 3', p, family ? FAMILY_LABEL[family] : 'Unknown'),
        field(3, 'State', p, p[3] === 0 ? 'Enabled' : 'Bypassed'),
        field(4, 'Slot / position', p, `${(p[4] > 3 ? p[4] - 4 : p[4]) + 1} · ${p[4] > 3 ? 'post' : 'pre'}`),
      ],
    }
  }
  // Effect-preset notice: 1d 01 <bank> <idx> <slot> (AGENTS.md "Protocol notes").
  if (a === 0x1d && b === 1) {
    return {
      title: 'Effect preset notice',
      summary: 'Notice from the amp about an effect preset (bank / index / slot).',
      fields: [...header, field(2, 'Bank', p), field(3, 'Index', p), field(4, 'Slot', p)],
    }
  }
  if (a === 28 && b === 3 && c === 0) return { title: 'Apply / commit', summary: 'Commits the parameter written by the previous packet.', fields: [...header, field(3, 'FX knob', p)] }
  if (a === 28 && b === 1) {
    // Host commands (select 1, save 3) and the preset-changed trailer (0).
    if (c === 3 || c === 0 || c === 1) {
      const save = c === 3
      const notify = c === 0
      return {
        title: save ? 'Save preset' : notify ? 'Preset change notification' : 'Select bank slot',
        summary: save
          ? 'Stores the current editor state into an amp slot under the given name.'
          : notify
            ? 'Received when the user selects a preset on the amp.'
            : 'Switches the amp to the given preset slot.',
        fields: [
          ...header,
          field(2, 'Action', p, save ? 'Save' : notify ? 'Notify' : 'Select'),
          field(4, 'Slot', p, String(p[4] + 1)),
          ...(save
            ? [{ offset: '[16..47]', name: 'Preset name', raw: 'ASCII', value: readAscii(p) || '—', bytes: Array.from({ length: 32 }, (_, i) => 16 + i) }]
            : []),
        ],
      }
    }
    // Sub-opcode 1 is also how the amp pushes its own state (decode.ts).
    return stateBlockFields(p, c, header)
  }
  if (a === 28 && b === 3) return stateBlockFields(p, c, header)
  return {
    title: 'Unknown packet',
    summary: 'No decoder matched this opcode — inspect the raw bytes below.',
    fields: [...header, field(2, 'Byte 2', p), field(3, 'Byte 3', p)],
  }
}

export function directionLabel(dir: string): string {
  return dir === 'tx' ? '0x01 OUT' : dir === 'rx' ? '0x81 IN' : '—'
}

/** Parse a hex dump text into a 64-byte packet, or null when there are fewer than 16 bytes. */
export function parseHex(text: string): Uint8Array | null {
  const m = text.match(/\b[0-9A-Fa-f]{2}\b/g)
  if (!m || m.length < 16) return null
  const p = new Uint8Array(64)
  m.slice(0, 64).forEach((b, i) => (p[i] = parseInt(b, 16)))
  return p
}

export interface LogLike {
  id: number
  dir: string
  text: string
  packet?: Uint8Array
}

const describeCache = new Map<number, PacketDescription | null>()

/** Cached describePacket for a log entry; falls back to parsing hex bytes out of its text. */
export function describeEntry(entry: LogLike): PacketDescription | null {
  if (describeCache.has(entry.id)) return describeCache.get(entry.id)!
  const packet = entry.packet || parseHex(entry.text)
  const desc = packet ? describePacket(packet) : null
  describeCache.set(entry.id, desc)
  return desc
}

/** A short type label for a log line: the packet title, else a guess from the text. */
export function packetType(entry: LogLike): string {
  const desc = describeEntry(entry)
  if (desc) return desc.title
  const t = entry.text.toLowerCase()
  if (/tuner/.test(t)) return 'tuner'
  if (/dump|state block|packets/.test(t)) return 'dump'
  if (/preset|slot|bank|save/.test(t)) return 'preset'
  if (/stomp|mod|delay|reverb|effect/.test(t)) return 'effect'
  if (/amp|cabinet|gain|eq/.test(t)) return 'amp'
  if (/apply|execute|commit/.test(t)) return 'apply'
  if (/open|connect|disconnect|link|init|detect/.test(t)) return 'link'
  return 'other'
}

/** Search a description's title, summary and fields; returns the matching field, 'packet', or null. */
export function matchSearch(desc: PacketDescription | null, term: string): PacketField | 'packet' | null {
  if (!desc) return null
  if (desc.title.toLowerCase().includes(term) || desc.summary.toLowerCase().includes(term)) return 'packet'
  for (const f of desc.fields) {
    if (f.name.toLowerCase().includes(term) || f.value.toLowerCase().includes(term) || f.raw.toLowerCase().includes(term) || f.offset.toLowerCase().includes(term)) return f
  }
  return null
}

/** `"32, 0x20, 36-38"` → {32, 36, 37, 38}. Decimal and hex, ranges with `-` or `..`. */
export function parseOffsets(text: string): Set<number> {
  const out = new Set<number>()
  const num = (s: string) => {
    const t = s.trim().replace(/^\[|\]$/g, '')
    if (!t) return NaN
    return /^0x/i.test(t) ? parseInt(t.slice(2), 16) : parseInt(t, 10)
  }
  for (const token of text.split(/[,\s]+/).filter(Boolean)) {
    const range = token.match(/^(.+?)(?:\.\.|-)(.+)$/)
    if (range) {
      const lo = num(range[1])
      const hi = num(range[2])
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) out.add(i)
      }
      continue
    }
    const n = num(token)
    if (Number.isFinite(n)) out.add(n)
  }
  return out
}

/** First field of `desc` that covers any of the given byte offsets. */
export function matchOffsets(desc: PacketDescription | null, offsets: Set<number>): PacketField | null {
  if (!desc || !offsets.size) return null
  for (const f of desc.fields) if (f.bytes?.some((b) => offsets.has(b))) return f
  return null
}
