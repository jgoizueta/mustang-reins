// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { newPreset } from '../protocol/preset'
import { LibraryStore, memoryBackend, DEFAULT_COLLECTION_NAME, type Collection, type LibraryBackend, type LibraryEntry } from './store'

const LEGACY_KEY = 'mustang-amp-control.library.v1'
const MIGRATED_KEY = 'mustang.library.migrated'

const make = async () => {
  const backend = memoryBackend()
  const store = new LibraryStore(backend)
  await store.ready
  return { store, backend }
}

const snap = (s: LibraryStore) => s.getSnapshot()

beforeEach(() => localStorage.clear())

describe('LibraryStore', () => {
  it('always has a "My Presets" collection', async () => {
    const { store } = await make()
    const c = snap(store).collections.find((x) => x.name === DEFAULT_COLLECTION_NAME)
    expect(c).toBeTruthy()
    expect(store.defaultCollectionId()).toBe(c!.id)
  })

  it('adds, renames and removes collections; removing removes its entries', async () => {
    const { store } = await make()
    const c = store.addCollection(' Gig ')!
    expect(c.name).toBe('Gig')
    expect(snap(store).collections.some((x) => x.id === c.id)).toBe(true)
    store.add(c.id, [newPreset('one'), newPreset('two')])
    expect(snap(store).entries.filter((e) => e.collectionId === c.id)).toHaveLength(2)

    expect(store.renameCollection(c.id, 'Practice')).toBe(true)
    expect(snap(store).collections.find((x) => x.id === c.id)!.name).toBe('Practice')

    expect(store.removeCollection(c.id)).toBe(true)
    expect(snap(store).collections.find((x) => x.id === c.id)).toBeUndefined()
    expect(snap(store).entries.some((e) => e.collectionId === c.id)).toBe(false)
  })

  it('rejects empty and duplicate collection names and cannot delete My Presets', async () => {
    const { store } = await make()
    expect(store.addCollection('  ')).toBeNull()
    expect(store.addCollection(DEFAULT_COLLECTION_NAME.toUpperCase())).toBeNull()
    expect(store.removeCollection(store.defaultCollectionId()!)).toBe(false)
  })

  it('keeps a renamed My Presets as the default and creates no new one on reload', async () => {
    const { store, backend } = await make()
    const my = store.defaultCollectionId()!
    store.renameCollection(my, 'jgoizueta')
    await new Promise((r) => setTimeout(r, 0))
    const again = new LibraryStore(backend)
    await again.ready
    expect(snap(again).collections.map((c) => c.name)).toEqual(['jgoizueta'])
    expect(again.defaultCollectionId()).toBe(my)
  })

  it('uses the oldest normal collection as the default, and lets any but the last normal one be deleted', async () => {
    const { store } = await make()
    const my = store.defaultCollectionId()!
    const gig = store.addCollection('Gig')!
    const bank = store.addBank('Set', 24)
    expect(store.defaultCollectionId()).toBe(my)
    expect(store.canDelete(bank.id)).toBe(true)
    expect(store.removeCollection(my)).toBe(true)
    expect(store.defaultCollectionId()).toBe(gig.id)
    expect(store.canDelete(gig.id)).toBe(false)
    expect(store.removeCollection(gig.id)).toBe(false)
    expect(snap(store).collections.some((c) => c.name === DEFAULT_COLLECTION_NAME)).toBe(false)
  })

  it('adds, updates, renames and removes entries, newest first', async () => {
    const { store } = await make()
    const my = store.defaultCollectionId()!
    const [a, b] = store.add(my, [newPreset('first'), newPreset('second')])
    expect(snap(store).entries[0].id).toBe(a.id) // added first of the batch
    store.add(my, [newPreset('third')])
    expect(snap(store).entries[0].preset.name).toBe('third')

    const changed = { ...a.preset, amp: { ...a.preset.amp, gain: 200 } }
    store.update(a.id, changed)
    expect(snap(store).entries.find((e) => e.id === a.id)!.preset.amp.gain).toBe(200)

    store.rename(b.id, 'Renamed')
    expect(snap(store).entries.find((e) => e.id === b.id)!.preset.name).toBe('Renamed')

    store.remove(a.id)
    expect(snap(store).entries.some((e) => e.id === a.id)).toBe(false)
  })

  it('rebuilds the search text with name, fuse info, amp and effect names', async () => {
    const { store } = await make()
    const p = newPreset('Solo')
    p.fuseInfo = { author: 'David', tags: 'lead', description: 'a singing lead tone' }
    const [e] = store.add(store.defaultCollectionId()!, [p])
    const s = e.search
    expect(s).toContain('solo')
    expect(s).toContain('david')
    expect(s).toContain('lead')
    expect(s).toContain('singing')
    expect(s.length).toBeGreaterThan(10)
  })

  it('persists through the backend: a new store loads the same data', async () => {
    const backend = memoryBackend()
    const s1 = new LibraryStore(backend)
    await s1.ready
    const c = s1.addCollection('Keeps')!
    s1.add(c.id, [newPreset('saved one')])

    const s2 = new LibraryStore(backend)
    await s2.ready
    expect(snap(s2).collections.map((x) => x.name)).toContain('Keeps')
    expect(snap(s2).entries.map((e) => e.preset.name)).toContain('saved one')
  })

  it('migrates the old localStorage library once, keeping ids and savedAt', async () => {
    const old = [
      { id: 'legacy-1', savedAt: 111, preset: newPreset('old one') },
      { id: 'legacy-2', savedAt: 222, preset: newPreset('old two') },
    ]
    localStorage.setItem(LEGACY_KEY, JSON.stringify(old))
    const { store } = await make()
    const my = store.defaultCollectionId()!
    const entries = snap(store).entries.filter((e) => e.collectionId === my)
    expect(entries.map((e) => e.id).sort()).toEqual(['legacy-1', 'legacy-2'])
    expect(entries.find((e) => e.id === 'legacy-1')!.savedAt).toBe(111)
    expect(localStorage.getItem(MIGRATED_KEY)).toBe('true')
    expect(localStorage.getItem(LEGACY_KEY)).toContain('legacy-1') // backup kept

    // Runs only once: a second store must not import them again.
    const { store: s2 } = await make()
    expect(snap(s2).entries).toHaveLength(0)
  })

  it('migrates nothing and still sets the flag when the old library is empty', async () => {
    localStorage.setItem(LEGACY_KEY, '[]')
    const { store } = await make()
    expect(snap(store).entries).toHaveLength(0)
    expect(localStorage.getItem(MIGRATED_KEY)).toBe('true')
  })

  it('never creates a phantom My Presets while the load is still pending', async () => {
    let resolve!: (v: { collections: Collection[]; entries: LibraryEntry[] }) => void
    const gate = new Promise<{ collections: Collection[]; entries: LibraryEntry[] }>((r) => { resolve = r })
    const mem = memoryBackend()
    const written: Collection[] = []
    const backend: LibraryBackend = {
      ...mem,
      load: () => gate.then(() => mem.load()),
      putCollections: async (c) => { written.push(...c); await mem.putCollections(c) },
    }
    const store = new LibraryStore(backend)

    // Early callers (e.g. a render before the load resolves) must not create anything.
    expect(store.defaultCollectionId()).toBeNull()
    resolve({ collections: [], entries: [] })
    await store.ready
    await new Promise((r) => setTimeout(r, 0))
    expect(written.filter((c) => c.name === DEFAULT_COLLECTION_NAME)).toHaveLength(1)
    expect(snap(store).collections.filter((c) => c.name === DEFAULT_COLLECTION_NAME)).toHaveLength(1)

    // A second store on the same backend data still sees exactly one.
    const s2 = new LibraryStore(backend)
    await s2.ready
    expect(snap(s2).collections.filter((c) => c.name === DEFAULT_COLLECTION_NAME)).toHaveLength(1)
    expect(written.filter((c) => c.name === DEFAULT_COLLECTION_NAME)).toHaveLength(1)
  })

  it('sorts a reloaded library: newest entries first, default collection then names', async () => {
    const backend = memoryBackend()
    const my: Collection = { id: 'my', name: DEFAULT_COLLECTION_NAME, createdAt: 0 }
    const zeta: Collection = { id: 'zeta', name: 'Zeta', createdAt: 1 }
    const alpha: Collection = { id: 'alpha', name: 'alpha', createdAt: 2 }
    const mk = (id: string, savedAt: number): LibraryEntry =>
      ({ id, collectionId: 'my', savedAt, preset: newPreset(`e${savedAt}`), search: `e${savedAt}` })
    backend.putCollections([zeta, alpha, my])
    backend.putEntries([mk('a', 10), mk('b', 99), mk('c', 50)])

    const store = new LibraryStore(backend)
    await store.ready
    const s = snap(store)
    expect(s.entries.map((e) => e.id)).toEqual(['b', 'c', 'a'])
    expect(s.collections.map((c) => c.name)).toEqual([DEFAULT_COLLECTION_NAME, 'alpha', 'Zeta'])
  })
})

describe('banks', () => {
  it('creates banks with a unique name suffix', async () => {
    const { store } = await make()
    const a = store.addBank('Gig', 24)
    const b = store.addBank('Gig', 8)
    const c = store.addBank('gig', 8) // case-insensitive clash
    expect([a.name, b.name, c.name]).toEqual(['Gig', 'Gig (2)', 'gig (3)'])
    expect(a.bank?.size).toBe(24)
  })

  it('putAt fills and replaces positions; clearAt empties; swap trades positions', async () => {
    const { store } = await make()
    const bank = store.addBank('B', 24)
    const p1 = newPreset('one'), p2 = newPreset('two'), p3 = newPreset('three')
    store.putAt(bank.id, 0, p1)
    store.putAt(bank.id, 5, p2)
    expect(store.entryAt(bank.id, 0)!.preset.name).toBe('one')
    store.putAt(bank.id, 0, p3)
    expect(store.entryAt(bank.id, 0)!.preset.name).toBe('three')
    expect(store.entryAt(bank.id, 0)!.position).toBe(0)
    expect(snap(store).entries.filter((e) => e.collectionId === bank.id)).toHaveLength(2)

    store.swap(bank.id, 0, 5)
    expect(store.entryAt(bank.id, 5)!.preset.name).toBe('three')
    expect(store.entryAt(bank.id, 0)!.preset.name).toBe('two')
    store.swap(bank.id, 0, 7) // swap with an empty position
    expect(store.entryAt(bank.id, 0)).toBeUndefined()
    expect(store.entryAt(bank.id, 7)!.preset.name).toBe('two')

    store.clearAt(bank.id, 7)
    expect(store.entryAt(bank.id, 7)).toBeUndefined()
    expect(store.putAt(bank.id, 24, p1)).toBeNull() // out of range
  })

  it('skips an identical imported bank and suffixes a different one with the same name', async () => {
    const { store } = await make()
    const items = [{ position: 0, preset: newPreset('a') }, { position: 3, preset: newPreset('b') }]
    const first = store.addImportedBank('Back', 24, items)
    expect(first.created).toBe(true)
    const dupe = store.addImportedBank('back', 24, items)
    expect(dupe.created).toBe(false)
    expect(dupe.collection.id).toBe(first.collection.id)
    const changed = store.addImportedBank('Back', 24, [...items, { position: 9, preset: newPreset('c') }])
    expect(changed.created).toBe(true)
    expect(changed.collection.name).toBe('Back (2)')
  })

  it('persists banks and positions through the backend', async () => {
    const backend = memoryBackend()
    const store = new LibraryStore(backend)
    await store.ready
    const bank = store.addBank('B', 8)
    store.putAt(bank.id, 2, newPreset('keep'))
    const store2 = new LibraryStore(backend)
    await store2.ready
    const c2 = snap(store2).collections.find((c) => c.id === bank.id)!
    expect(c2.bank?.size).toBe(8)
    expect(store2.entryAt(bank.id, 2)!.preset.name).toBe('keep')
  })
})
