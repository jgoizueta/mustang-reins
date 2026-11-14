// @vitest-environment jsdom
/// <reference types="node" />
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseFuse } from '../fuse/fuse'
import { importFiles, mapFiles, sourceName, stripCommonRoot, unzip, type SourceFile } from './import'
import { LibraryStore, memoryBackend } from './store'

// A valid small .fuse document (same shape as src/fuse/fuse.test.ts).
const fuseDoc = (name: string, gain = 52428) =>
  `<?xml version="1.0"?><Preset amplifier="Mustang I/II" ProductId="1"><Amplifier><Module ID="117" POS="0" BypassState="1"><Param ControlIndex="0">${gain}</Param></Module></Amplifier><FX></FX><FUSE><Info name="${name}" author="tester"></Info></FUSE><UsbGain>32896</UsbGain></Preset>`

const src = (path: string, text: string, flat?: boolean): SourceFile => ({ path, flat, data: () => Promise.resolve(text) })

const make = async () => {
  const store = new LibraryStore(memoryBackend())
  await store.ready
  return store
}

describe('mapping', () => {
  it('strips one common root folder only when every file shares it', () => {
    expect(stripCommonRoot(['root/a.fuse', 'root/sub/b.fuse'])).toEqual(['a.fuse', 'sub/b.fuse'])
    expect(stripCommonRoot(['x/a.fuse', 'y/b.fuse'])).toEqual(['x/a.fuse', 'y/b.fuse'])
    expect(stripCommonRoot(['a.fuse', 'b.fuse'])).toEqual(['a.fuse', 'b.fuse'])
  })

  it('maps first-level subfolders to collections and flattens deeper levels', async () => {
    const store = await make()
    const ensure = (n: string) => store.ensureCollection(n)
    const mapped = mapFiles(['blues/srv.fuse', 'rock/deep/innards/x.fuse'], ensure, 'archive')
    const blues = store.ensureCollection('blues')
    const rock = store.ensureCollection('rock')
    expect(mapped[0]).toMatchObject({ collectionId: blues.id, path: 'blues/srv.fuse' })
    expect(mapped[1]).toMatchObject({ collectionId: rock.id, path: 'rock/deep/innards/x.fuse' })
  })

  it('puts top-level files into a collection named after the zip/folder', async () => {
    const store = await make()
    const mapped = mapFiles(['entire-archive/loose.fuse'], (n) => store.ensureCollection(n), 'entire-archive')
    expect(mapped[0].collectionId).toBe(store.ensureCollection('entire-archive').id)
  })

  it('reuses an existing collection case-insensitively', async () => {
    const store = await make()
    const c = store.addCollection('Blues')!
    const mapped = mapFiles(['all/BLUES/x.fuse'], (n) => store.ensureCollection(n), 'z')
    expect(mapped[0].collectionId).toBe(c.id)
    expect(store.getSnapshot().collections.filter((x) => x.name.toLowerCase() === 'blues')).toHaveLength(1)
  })
})

describe('importFiles', () => {
  it('imports structured files into their collections and flat files into the target', async () => {
    const store = await make()
    const target = store.addCollection('Picked')!
    const files = [
      src('all/blues/a.fuse', fuseDoc('Blues A')),
      src('all/rock/deep/b.fuse', fuseDoc('Rock B')),
      src('all/top.fuse', fuseDoc('Top')),
      src('plain.fuse', fuseDoc('Flat'), true),
    ]
    const r = await importFiles(store, files, target.id)
    expect(r).toMatchObject({ added: 4, duplicates: 0, failed: [] })
    const s = store.getSnapshot()
    const byName = (n: string) => s.entries.find((e) => e.preset.name === n)!
    const collName = (id: string) => s.collections.find((c) => c.id === id)!.name
    expect(collName(byName('Blues A').collectionId)).toBe('blues')
    expect(collName(byName('Rock B').collectionId)).toBe('rock') // deeper level flattened
    expect(collName(byName('Top').collectionId)).toBe('all') // common root stripped → top level → source name
    expect(byName('Flat').collectionId).toBe(target.id)
  })

  it('sends flat files to My Presets when ALL (null) is selected', async () => {
    const store = await make()
    await importFiles(store, [src('x.fuse', fuseDoc('X'), true)], null)
    expect(store.getSnapshot().entries[0].collectionId).toBe(store.defaultCollectionId())
  })

  it('skips duplicates and counts failed parses', async () => {
    const store = await make()
    const t = store.defaultCollectionId()!
    store.add(t, [parseFuse(fuseDoc('Dup'), 'x')])
    const r = await importFiles(store, [
      src('d.fuse', fuseDoc('Dup'), true),      // same preset → duplicate
      src('e.fuse', fuseDoc('Fresh'), true),    // parses → added
      src('bad.fuse', 'not xml <', true),       // fails
    ], t)
    expect(r.added).toBe(1)
    expect(r.duplicates).toBe(1)
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].path).toBe('bad.fuse')
  })

  it('reports progress for every file', async () => {
    const store = await make()
    const calls: [number, number][] = []
    await importFiles(store, [src('a.fuse', fuseDoc('a'), true), src('b.fuse', fuseDoc('b'), true)], null,
      (done, total) => calls.push([done, total]))
    expect(calls).toEqual([[1, 2], [2, 2]])
  })
})

// --- Minimal zip writer for tests ---
const te = new TextEncoder()
const u16 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255])
const u32 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255])

function zipOf(entries: { name: string; text: string; deflate?: boolean }[]): ArrayBuffer {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let off = 0
  for (const e of entries) {
    const name = te.encode(e.name)
    const raw = te.encode(e.text)
    const data = e.deflate ? new Uint8Array(deflateRawSync(raw)) : raw
    const method = e.deflate ? 8 : 0
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(name.length), ...u16(0)])
    chunks.push(local, name, data)
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name)
    off += local.length + name.length + data.length
  }
  const cdStart = off
  const cdLen = central.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdLen), ...u32(cdStart), ...u16(0)])
  const all = [...chunks, ...central, eocd]
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0))
  let p = 0
  for (const c of all) { out.set(c, p); p += c.length }
  return out.buffer
}

describe('unzip', () => {
  it('reads stored and deflated entries, skips directories, __MACOSX and dot-files', async () => {
    const buf = zipOf([
      { name: 'root/a.fuse', text: fuseDoc('Stored') },
      { name: 'root/sub/b.fuse', text: fuseDoc('Deflated'), deflate: true },
      { name: 'root/dir/', text: '' },
      { name: '__MACOSX/root/a.fuse', text: 'junk' },
      { name: 'root/.hidden.fuse', text: 'junk' },
      { name: 'root/readme.txt', text: 'junk' },
    ])
    const files = await unzip(buf)
    expect(files.map((f) => f.path)).toEqual(['root/a.fuse', 'root/sub/b.fuse'])
    expect(parseFuse(await files[0].data(), 'x').name).toBe('Stored')
    expect(parseFuse(await files[1].data(), 'x').name).toBe('Deflated')
  })

  it('rejects a non-zip buffer', async () => {
    await expect(unzip(te.encode('no zip here').buffer as ArrayBuffer)).rejects.toThrow(/zip/i)
  })
})

describe('sourceName', () => {
  it('uses the shared root of structured files for top-level placement', () => {
    expect(sourceName([src('mysounds/a.fuse', ''), src('mysounds/b/c.fuse', '')])).toBe('mysounds')
    expect(sourceName([src('x/a.fuse', ''), src('y/b.fuse', '')])).toBe('Imported')
  })
})

describe('FUSE backup folders', () => {
  it('imports a backup dir as one bank: name file, slot positions, extras skipped', async () => {
    const store = await make()
    const r = await importFiles(store, [
      src('pack/backup1/MU_BackupName.fuse', 'My Gig Bank\n'),
      src('pack/backup1/Presets/00_First.fuse', fuseDoc('First')),
      src('pack/backup1/Presets/05_Second.fuse', fuseDoc('Second')),
      src('pack/backup1/FUSE/00.fuse', 'fuse extras, not a preset'),
      src('pack/backup1/SystemSettings.fuse', '<System/>'),
    ], null)
    expect(r.banks).toEqual({ added: 1, skipped: 0, presets: 2 })
    expect(r.added).toBe(0)
    expect(r.failed).toHaveLength(0)
    const bank = store.getSnapshot().collections.find((c) => c.bank)!
    expect(bank.name).toBe('My Gig Bank')
    expect(bank.bank!.size).toBe(8) // max position 5 < 8
    expect(store.entryAt(bank.id, 0)!.preset.name).toBe('First')
    expect(store.entryAt(bank.id, 5)!.preset.name).toBe('Second')
    expect(store.entryAt(bank.id, 1)).toBeUndefined()
  })

  it('falls back to the folder name and sizes by the highest position', async () => {
    const store = await make()
    const r = await importFiles(store, [
      src('wrap/2013_05_09_16_50_38/Presets/09_nine.fuse', fuseDoc('Nine')),
      src('wrap/2013_05_09_16_50_38/Presets/23_last.fuse', fuseDoc('Last')),
    ], null)
    const bank = store.getSnapshot().collections.find((c) => c.bank)!
    expect(bank.name).toBe('2013_05_09_16_50_38')
    expect(bank.bank!.size).toBe(24)
    expect(r.banks.presets).toBe(2)
  })

  it('imports several backups from one source as separate banks', async () => {
    const store = await make()
    const r = await importFiles(store, [
      src('Backups/tour_a/M2_BackupName.fuse', 'Tour A'),
      src('Backups/tour_a/Presets/00_x.fuse', fuseDoc('X')),
      src('Backups/tour_b/M2_BackupName.fuse', 'Tour B'),
      src('Backups/tour_b/Presets/00_y.fuse', fuseDoc('Y')),
      src('Backups/tour_b/Presets/01_z.fuse', fuseDoc('Z')),
    ], null)
    expect(r.banks.added).toBe(2)
    const names = store.getSnapshot().collections.filter((c) => c.bank).map((c) => c.name).sort()
    expect(names).toEqual(['Tour A', 'Tour B'])
  })

  it('leaves loose NN_ files outside Presets/ as normal presets', async () => {
    const store = await make()
    const r = await importFiles(store, [
      src('gigs/05_loose.fuse', fuseDoc('Loose')),
    ], null)
    expect(r.banks.added).toBe(0)
    expect(r.added).toBe(1)
    expect(store.getSnapshot().entries[0].position).toBeUndefined()
  })
})
