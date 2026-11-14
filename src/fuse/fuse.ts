// Reads and writes Fender FUSE preset files (.fuse, an XML format).
// Knob values are stored as 16-bit numbers with the 8-bit value repeated in both bytes (0xCC -> 0xCCCC).
import { ampById, AMPS } from '../data/amps'
import { effectById, EFFECTS } from '../data/effects'
import type { EffectFamily } from '../protocol/packets'
import { FAMILIES, newPreset, normalizeEffect, type Preset } from '../protocol/preset'

const GROUPS: Record<EffectFamily, { tag: string; id: number }> = {
  stomp: { tag: 'Stompbox', id: 1 },
  mod: { tag: 'Modulation', id: 2 },
  delay: { tag: 'Delay', id: 3 },
  reverb: { tag: 'Reverb', id: 4 },
}
const DEFAULT_SLOT: Record<EffectFamily, number> = { stomp: 0, mod: 1, delay: 2, reverb: 3 }
const SIMPLE_COMP = 136
/** Delays with six knobs: Mono Echo Filter, Stereo Echo Filter, Tape Delay, Stereo Tape Delay. */
const SIX_KNOB = new Set([67, 72, 43, 42])

const to16 = (v: number) => ((v & 255) << 8) | (v & 255)
const from16 = (v: number) => Math.max(0, Math.min(255, v >> 8))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const int = (s: string | null | undefined, fallback = 0) => {
  const n = parseInt(s?.trim() ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

const esc = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)

/** File name for an exported preset. */
export const fuseFileName = (p: Preset) => `${(p.name || 'preset').replace(/[^\w\-. ]+/g, '_').trim() || 'preset'}.fuse`

function familyOf(model: number, tag: string | null): EffectFamily | null {
  const byTag = FAMILIES.find((f) => GROUPS[f].tag === tag)
  if (byTag && effectById(byTag, model)) return byTag
  const any = EFFECTS.find((e) => e.id === model && e.id !== 0)
  return any ? any.family : (byTag ?? null)
}

export function parseFuse(xml: string, fallbackName = 'Imported Preset'): Preset {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Not a valid .fuse XML file')
  if (!(doc.querySelector('Preset') ?? doc.documentElement)) throw new Error('Not a valid .fuse file')

  const preset = newPreset(fallbackName)
  const info = doc.querySelector('FUSE > Info')
  const name = info?.getAttribute('name')?.trim()
  if (name) preset.name = name.slice(0, 32)
  if (info) {
    const a = (k: string) => info.getAttribute(k)?.trim() || undefined
    preset.fuseInfo = {
      author: a('author'), tags: a('tags'), rating: a('rating'),
      genre1: a('genre1'), genre2: a('genre2'), genre3: a('genre3'),
      description: info.textContent?.trim() || undefined,
    }
  }
  const usb = doc.querySelector('UsbGain')?.textContent?.trim()
  // Some files store UsbGain as a 16-bit value like the knobs; plain 0-255 values are kept as they are.
  if (usb) preset.usbGain = int(usb) > 255 ? from16(int(usb)) : clamp(int(usb), 0, 255)

  const amp = doc.querySelector('Amplifier > Module')
  if (!amp) throw new Error('No <Amplifier> block found in this .fuse file')
  const model = int(amp.getAttribute('ID'))
  if (AMPS.some((a) => a.id === model)) preset.amp.model = model
  for (const p of Array.from(amp.querySelectorAll('Param'))) {
    const i = int(p.getAttribute('ControlIndex'), -1)
    const v = int(p.textContent)
    const a = preset.amp
    switch (i) {
      case 0: a.volume = from16(v); break
      case 1: a.gain = from16(v); break
      case 2: a.gain2 = from16(v); break
      case 3: a.masterVolume = from16(v); break
      case 4: a.treble = from16(v); break
      case 5: a.middle = from16(v); break
      case 6: a.bass = from16(v); break
      case 7: a.presence = from16(v); break
      case 9: a.depth = from16(v); break
      case 10: a.bias = from16(v); break
      case 15: a.noiseGate = clamp(v, 0, 5); break
      case 16: a.threshold = clamp(v, 0, 9); break
      case 17: a.cabinet = clamp(v, 0, 12); break
      case 19: a.sag = clamp(v, 0, 2); break
      case 20: a.brightness = v === 0 ? 0 : 1; break
    }
  }

  for (const m of Array.from(doc.querySelectorAll('FX Module'))) {
    const id = int(m.getAttribute('ID'))
    if (!id) continue
    const family = familyOf(id, m.parentElement?.tagName ?? null)
    if (!family) continue
    const pos = int(m.getAttribute('POS'), DEFAULT_SLOT[family])
    const bypass = m.getAttribute('BypassState')
    const knobs = [0, 0, 0, 0, 0, 0]
    for (const p of Array.from(m.querySelectorAll('Param'))) {
      const i = int(p.getAttribute('ControlIndex'), -1)
      if (i >= 0 && i < 6) knobs[i] = from16(int(p.textContent))
    }
    preset.effects[family] = normalizeEffect(family, {
      model: id, enabled: bypass === null || bypass !== '0',
      slot: pos > 3 ? pos - 4 : pos, position: pos > 3 ? 'post' : 'pre', knobs,
    })
  }
  return preset
}

export function serializeFuse(p: Preset, defaultAuthor = 'Mustang Control'): string {
  const a = p.amp
  const magic = ampById(a.model)?.magic ?? [0, 0, 0, 0, 0]
  const param = (i: number, v: number) => `        <Param ControlIndex="${i}">${v}</Param>`
  const ampParams: [number, number][] = [
    [0, to16(a.volume)], [1, to16(a.gain)], [2, to16(a.gain2)], [3, to16(a.masterVolume)], [4, to16(a.treble)],
    [5, to16(a.middle)], [6, to16(a.bass)], [7, to16(a.presence)], [8, to16(128)], [9, to16(a.depth)],
    [10, to16(a.bias)], [11, to16(128)], [12, magic[0]], [13, magic[1]], [14, magic[2]], [15, a.noiseGate],
    [16, a.threshold], [17, a.cabinet], [18, magic[3]], [19, a.sag], [20, a.brightness ? 1 : 0], [21, 1],
    [22, to16(magic[4])],
  ]
  const fx = FAMILIES.map((f) => {
    const e = p.effects[f]
    const g = GROUPS[f]
    const pos = e.position === 'post' ? e.slot + 4 : e.slot
    if (!e.model) return `    <${g.tag} ID="${g.id}">\n      <Module ID="0" POS="${pos}" BypassState="1"></Module>\n    </${g.tag}>`
    const count = e.model === SIMPLE_COMP ? 1 : SIX_KNOB.has(e.model) ? 6 : 5
    const params = Array.from({ length: count }, (_, i) => param(i, to16(e.knobs[i] ?? 0))).join('\n')
    return `    <${g.tag} ID="${g.id}">\n      <Module ID="${e.model}" POS="${pos}" BypassState="${e.enabled ? 1 : 0}">\n${params}\n      </Module>\n    </${g.tag}>`
  })
  const i = p.fuseInfo ?? {}
  return `<?xml version="1.0" encoding="UTF-8"?>
<Preset amplifier="Mustang I/II" ProductId="1">
  <Amplifier>
    <Module ID="${a.model}" POS="0" BypassState="1">
${ampParams.map(([k, v]) => param(k, v)).join('\n')}
    </Module>
  </Amplifier>
  <FX>
${fx.join('\n')}
  </FX>
  <FUSE>
    <Info name="${esc(p.name)}" author="${esc(i.author || defaultAuthor)}" rating="${esc(i.rating || '0')}" genre1="${esc(i.genre1 || '-1')}" genre2="${esc(i.genre2 || '-1')}" genre3="${esc(i.genre3 || '-1')}" tags="${esc(i.tags || '')}" fenderid="0">${esc(i.description || '')}</Info>
  </FUSE>
  <UsbGain>${p.usbGain}</UsbGain>
</Preset>
`
}

/** Save text as a file through the browser. */
export function downloadText(fileName: string, text: string, type = 'application/xml') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export const exportFuse = (p: Preset) => downloadText(fuseFileName(p), serializeFuse(p))
