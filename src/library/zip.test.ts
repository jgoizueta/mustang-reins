// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { newPreset } from '../protocol/preset'
import { unzip, importFiles } from './import'
import { bankZip, zip } from './zip'
import { LibraryStore, memoryBackend, type Collection, type LibraryEntry } from './store'

const entry = (collectionId: string, position: number, name: string): LibraryEntry => ({
  id: `e-${position}`, collectionId, savedAt: 0, position,
  preset: newPreset(name), search: name.toLowerCase(),
})

const bank: Collection = { id: 'b1', name: 'My Gig', createdAt: 0, bank: { size: 24 } }

describe('zip writer', () => {
  it('writes a readable stored zip with UTF-8 names', async () => {
    const buf = zip([{ name: 'a/x.fuse', data: new TextEncoder().encode('hello') }])
    const files = await unzip(buf.buffer as ArrayBuffer)
    expect(files.map((f) => f.path)).toEqual(['a/x.fuse'])
    expect(await files[0].data()).toBe('hello')
  })
})

describe('bankZip → unzip → import round trip', () => {
  it('re-imports an identical bank', async () => {
    const entries = [entry('b1', 0, 'First'), entry('b1', 7, 'Eighth'), entry('b1', 20, 'Twenty one')]
    const buf = bankZip(bank, entries, true)
    const files = await unzip(buf.buffer as ArrayBuffer)
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([
      'My Gig/M2_BackupName.fuse',
      'My Gig/Presets/00_First.fuse',
      'My Gig/Presets/07_Eighth.fuse',
      'My Gig/Presets/20_Twenty one.fuse',
    ])
    expect(await files.find((f) => f.path.endsWith('BackupName.fuse'))!.data()).toBe('My Gig\n')

    const store = new LibraryStore(memoryBackend())
    await store.ready
    const r = await importFiles(store, files, null)
    expect(r.banks).toEqual({ added: 1, skipped: 0, presets: 3 })
    const imported = store.getSnapshot().collections.find((c) => c.bank)!
    expect(imported.name).toBe('My Gig')
    expect(imported.bank!.size).toBe(24)
    for (const e of entries) {
      const got = store.entryAt(imported.id, e.position!)
      expect(got?.preset.name).toBe(e.preset.name)
    }
  })

  it('uses the MU_ prefix for a v1 amp', () => {
    const buf = bankZip(bank, [], false)
    const names = centralNames(buf)
    expect(names).toEqual(['My Gig/MU_BackupName.fuse'])
  })
})

/** Central-directory file names, for a quick look without unzipping. */
function centralNames(buf: Uint8Array): string[] {
  const dec = new TextDecoder()
  const out: string[] = []
  for (let i = 0; i + 46 <= buf.length; i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 1 && buf[i + 3] === 2) {
      const nlen = buf[i + 28] | (buf[i + 29] << 8)
      out.push(dec.decode(buf.subarray(i + 46, i + 46 + nlen)))
    }
  }
  return out
}
