// Minimal zip writer (stored, no compression) and FUSE-backup export for library banks.
// Layout matches Fender FUSE backups: <name>/<M2_|MU_>BackupName.fuse + <name>/Presets/NN_<preset>.fuse.
import { fuseFileName, serializeFuse } from '../fuse/fuse'
import type { Collection, LibraryEntry } from './store'

// --- CRC-32 ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Files named `{name, data}` → one stored zip (UTF-8 names, flag bit 11). */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const push = (a: Uint8Array) => { chunks.push(a); offset += a.length }
  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff])
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff])
  const cat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of parts) { out.set(p, o); o += p.length }
    return out
  }
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = cat(u32(0x04034b50), u16(20), u16(1 << 11), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), name)
    const cd = cat(u32(0x02014b50), u16(20), u16(20), u16(1 << 11), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name)
    push(local); push(f.data)
    central.push(cd)
  }
  const cdStart = offset
  for (const c of central) push(c)
  push(cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(offset - cdStart), u32(cdStart), u16(0)))
  return cat(...chunks)
}

const sanitize = (s: string) => s.replace(/[^\w\-. ]+/g, '_').trim() || 'bank'

/**
 * The zip bytes of a FUSE backup folder for this bank. `isV2` picks the M2_/MU_ name-file prefix.
 * `entries` are the bank's filled positions; empty ones are skipped.
 */
export function bankZip(bank: Collection, entries: LibraryEntry[], isV2: boolean): Uint8Array {
  const dir = sanitize(bank.name)
  const enc = new TextEncoder()
  const files = [{ name: `${dir}/${isV2 ? 'M2' : 'MU'}_BackupName.fuse`, data: enc.encode(bank.name + '\n') }]
  for (const e of [...entries].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    const base = fuseFileName(e.preset).replace(/\.fuse$/i, '')
    files.push({
      name: `${dir}/Presets/${String(e.position ?? 0).padStart(2, '0')}_${base}.fuse`,
      data: enc.encode(serializeFuse(e.preset)),
    })
  }
  return zip(files)
}

/** Save the bank as a `<bank name>.zip` download. */
export function exportBank(bank: Collection, entries: LibraryEntry[], isV2: boolean) {
  const blob = new Blob([bankZip(bank, entries, isV2) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitize(bank.name)}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
