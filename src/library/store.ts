// The browser preset library: presets in one-level collections, persisted to IndexedDB.
// Replaces the old localStorage library (whose entries are migrated once into "My Presets").
import { useSyncExternalStore } from 'react'
import { ampById } from '../data/amps'
import { effectById } from '../data/effects'
import { clonePreset, FAMILIES, samePreset, type Preset } from '../protocol/preset'
import { isPreset, readJson, writeJson } from '../amp/storage'

export interface Collection { id: string; name: string; createdAt: number; bank?: { size: 8 | 24 | 100 } }
export interface LibraryEntry { id: string; collectionId: string; savedAt: number; preset: Preset; search: string; position?: number }

export interface LibrarySnapshot {
  collections: Collection[]
  entries: LibraryEntry[]
  loaded: boolean
  error: string | null
}

export interface LibraryBackend {
  load(): Promise<{ collections: Collection[]; entries: LibraryEntry[] }>
  putCollections(c: Collection[]): Promise<void>
  deleteCollection(id: string): Promise<void>
  putEntries(e: LibraryEntry[]): Promise<void>
  deleteEntries(ids: string[]): Promise<void>
}

export const DEFAULT_COLLECTION_NAME = 'My Presets'
const LEGACY_KEY = 'mustang-amp-control.library.v1'
const MIGRATED_KEY = 'mustang.library.migrated'

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Lower-case text for the search box: name, author/tags/description, amp and effect names. */
export function searchText(preset: Preset): string {
  const info = preset.fuseInfo
  const parts = [
    preset.name,
    info?.author, info?.tags, info?.description,
    ampById(preset.amp.model)?.name,
    ...FAMILIES.map((f) => { const m = effectById(f, preset.effects[f].model); return m?.name ?? (preset.effects[f].model ? String(preset.effects[f].model) : undefined) }),
  ]
  return parts.filter(Boolean).join('\n').toLowerCase()
}

const makeEntry = (collectionId: string, preset: Preset, savedAt = Date.now(), id?: string, position?: number): LibraryEntry => ({
  id: id ?? makeId(), collectionId, savedAt, preset: clonePreset(preset), search: searchText(preset),
  ...(position !== undefined ? { position } : {}),
})

export class LibraryStore {
  private collections: Collection[] = []
  private entries: LibraryEntry[] = []
  private loaded = false
  private error: string | null = null
  private persistAsked = false
  private defaultId: string | null = null
  private collectionsLoaded = false
  private listeners = new Set<() => void>()
  private snap: LibrarySnapshot = { collections: [], entries: [], loaded: false, error: null }
  readonly ready: Promise<void>
  private backend: LibraryBackend

  constructor(backend: LibraryBackend) {
    this.backend = backend
    this.ready = backend.load().then(async ({ collections, entries }) => {
      this.collections = collections.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
      this.entries = entries.filter((e) => e && typeof e.id === 'string' && isPreset(e.preset))
      this.collectionsLoaded = true
      await this.migrateLegacy()
      this.ensureDefault()
      this.loaded = true
      this.emit()
    }).catch((e) => {
      this.error = `Could not load the library: ${(e as Error).message}`
      this.loaded = true
      this.emit()
    })
  }

  private async migrateLegacy() {
    const flag = readJson<string | null>(MIGRATED_KEY, null)
    if (flag) return
    const legacy = readJson<{ id?: string; savedAt?: number; preset?: unknown }[]>(LEGACY_KEY, [])
      .filter((e) => e && isPreset(e.preset))
    if (legacy.length) {
      const my = this.ensureDefault()!
      const migrated = legacy.map((e, i) =>
        makeEntry(my.id, e.preset as Preset, typeof e.savedAt === 'number' ? e.savedAt : Date.now() - i,
          typeof e.id === 'string' ? e.id : undefined))
      this.entries = [...this.entries.filter((x) => !migrated.some((m) => m.id === x.id)), ...migrated]
      await this.persist(() => this.backend.putEntries(migrated))
    }
    writeJson(MIGRATED_KEY, true)
    // The old localStorage library stays as a backup.
  }

  /**
   * The default collection (target for new presets and loose imports in the ALL view): the oldest
   * normal (non-bank) collection, whatever its name. "My Presets" is created only when there is none.
   */
  private ensureDefault(): Collection | null {
    // Never create before the stored collections are known: that would persist a
    // phantom "My Presets" on top of the real one (and another on every render).
    if (!this.collectionsLoaded) return null
    const regular = this.collections.filter((c) => !c.bank)
    const kept = regular.find((c) => c.id === this.defaultId)
    if (kept) return kept
    if (regular.length) {
      const found = regular.reduce((a, b) => (b.createdAt < a.createdAt || (b.createdAt === a.createdAt && b.id < a.id) ? b : a))
      this.defaultId = found.id
      return found
    }
    const c = { id: makeId(), name: DEFAULT_COLLECTION_NAME, createdAt: Date.now() }
    this.defaultId = c.id
    this.collections = [c, ...this.collections]
    void this.persist(() => this.backend.putCollections([c]))
    return c
  }

  /** The default collection id — null until the library has loaded. */
  defaultCollectionId(): string | null {
    return this.ensureDefault()?.id ?? null
  }

  /** Banks and normal collections can be deleted, except the last normal one. */
  canDelete(id: string): boolean {
    const c = this.collections.find((x) => x.id === id)
    return !!c && (!!c.bank || this.collections.some((x) => x.id !== id && !x.bank))
  }

  private async persist(fn: () => Promise<void>) {
    try {
      await fn()
      if (this.error) { this.error = null; this.emit() }
    } catch (e) {
      this.error = `Could not save to browser storage: ${(e as Error).message}`
      this.emit()
    }
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = (): LibrarySnapshot => this.snap
  private emit() {
    // Snapshot order is fixed regardless of storage order: newest entries first,
    // the default collection first, the rest by name.
    this.ensureDefault()
    const entries = [...this.entries].sort((a, b) => b.savedAt - a.savedAt)
    const collections = [...this.collections].sort((a, b) =>
      a.id === this.defaultId ? -1 : b.id === this.defaultId ? 1 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    this.snap = { collections, entries, loaded: this.loaded, error: this.error }
    this.listeners.forEach((l) => l())
  }

  collectionFor(name: string): Collection | undefined {
    return this.collections.find((c) => c.name.toLowerCase() === name.toLowerCase())
  }

  /** Get or create a collection by name (case-insensitive reuse, used by imports). */
  ensureCollection(name: string): Collection {
    const found = this.collectionFor(name)
    if (found) return found
    const c = { id: makeId(), name: name.trim() || 'Imported', createdAt: Date.now() }
    this.collections = [...this.collections, c]
    void this.persist(() => this.backend.putCollections([c]))
    this.emit()
    return c
  }

  addCollection(name: string): Collection | null {
    const trimmed = name.trim()
    if (!trimmed || this.collectionFor(trimmed)) return null
    const c = { id: makeId(), name: trimmed, createdAt: Date.now() }
    this.collections = [...this.collections, c]
    void this.persist(() => this.backend.putCollections([c]))
    this.emit()
    return c
  }

  renameCollection(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return false
    const other = this.collections.find((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())
    if (other) return false
    const c = this.collections.find((x) => x.id === id)
    if (!c) return false
    const next = { ...c, name: trimmed }
    this.collections = this.collections.map((x) => (x.id === id ? next : x))
    void this.persist(() => this.backend.putCollections([next]))
    this.emit()
    return true
  }

  removeCollection(id: string) {
    const c = this.collections.find((x) => x.id === id)
    if (!c || !this.canDelete(id)) return false // the last normal collection stays
    const gone = new Set(this.entries.filter((e) => e.collectionId === id).map((e) => e.id))
    this.collections = this.collections.filter((x) => x.id !== id)
    this.entries = this.entries.filter((e) => e.collectionId !== id)
    void this.persist(async () => {
      await this.backend.deleteCollection(id)
      await this.backend.deleteEntries([...gone])
    })
    this.emit()
    return true
  }

  // --- Banks (collections whose entries hold fixed positions, like amp slots) ---

  /** A name no collection uses yet: "Bank", "Bank (2)", "Bank (3)"… */
  private uniqueName(base: string): string {
    const stem = base.trim() || 'Bank'
    const taken = new Set(this.collections.map((c) => c.name.toLowerCase()))
    let name = stem
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} (${n})`
    return name
  }

  addBank(name: string, size: 8 | 24 | 100): Collection {
    const c: Collection = { id: makeId(), name: this.uniqueName(name), createdAt: Date.now(), bank: { size } }
    this.collections = [...this.collections, c]
    void this.persist(() => this.backend.putCollections([c]))
    this.emit()
    return c
  }

  /** The entry at a bank position, if filled. */
  entryAt(bankId: string, position: number): LibraryEntry | undefined {
    return this.entries.find((e) => e.collectionId === bankId && e.position === position)
  }

  /** Put a preset at a bank position, replacing whatever was there. */
  putAt(bankId: string, position: number, preset: Preset): LibraryEntry | null {
    const bank = this.collections.find((c) => c.id === bankId && c.bank)
    if (!bank || position < 0 || position >= bank.bank!.size) return null
    const old = this.entryAt(bankId, position)
    const e = makeEntry(bankId, preset, Date.now(), undefined, position)
    this.entries = [e, ...this.entries.filter((x) => x.id !== old?.id)]
    void this.persist(async () => {
      if (old) await this.backend.deleteEntries([old.id])
      await this.backend.putEntries([e])
    })
    this.emit()
    return e
  }

  clearAt(bankId: string, position: number) {
    const e = this.entryAt(bankId, position)
    if (!e) return
    this.entries = this.entries.filter((x) => x.id !== e.id)
    void this.persist(() => this.backend.deleteEntries([e.id]))
    this.emit()
  }

  /** Swap two bank positions (either may be empty). */
  swap(bankId: string, a: number, b: number) {
    if (a === b) return
    const ea = this.entryAt(bankId, a)
    const eb = this.entryAt(bankId, b)
    if (!ea && !eb) return
    const moved: LibraryEntry[] = []
    this.entries = this.entries.map((e) => {
      if (e.id === ea?.id) { const n = { ...e, position: b }; moved.push(n); return n }
      if (e.id === eb?.id) { const n = { ...e, position: a }; moved.push(n); return n }
      return e
    })
    void this.persist(() => this.backend.putEntries(moved))
    this.emit()
  }

  /**
   * Insert an imported backup as a new bank. When a bank with the same name (case-insensitive)
   * AND identical contents already exists, the import is a duplicate: returns `{ collection, created: false }`.
   */
  addImportedBank(name: string, size: 8 | 24 | 100, items: { position: number; preset: Preset }[]):
    { collection: Collection; created: boolean } {
    const sameName = this.collections.find((c) => c.bank && c.name.toLowerCase() === name.trim().toLowerCase())
    if (sameName) {
      const existing = this.entries.filter((e) => e.collectionId === sameName.id)
      const identical = existing.length === items.length &&
        items.every((it) => {
          const e = existing.find((x) => x.position === it.position)
          return e && e.preset.name === it.preset.name && samePreset(e.preset, it.preset)
        })
      if (identical) return { collection: sameName, created: false }
    }
    const taken = this.collectionFor(name.trim()) // any collection or bank with this name
    const bankName = taken ? this.uniqueName(name) : name.trim() || 'Backup'
    const bank: Collection = { id: makeId(), name: bankName, createdAt: Date.now(), bank: { size } }
    this.collections = [...this.collections, bank]
    void this.persist(() => this.backend.putCollections([bank]))
    const added = items.map((it, i) => makeEntry(bank.id, it.preset, Date.now() - i, undefined, it.position))
    this.entries = [...added, ...this.entries]
    void this.persist(() => this.backend.putEntries(added))
    this.emit()
    return { collection: bank, created: true }
  }

  /** Newest first within a collection. */
  add(collectionId: string, presets: Preset[]): LibraryEntry[] {
    const added = presets.map((p, i) => makeEntry(collectionId, p, Date.now() - i))
    this.entries = [...added, ...this.entries]
    void this.persist(() => this.backend.putEntries(added))
    this.emit()
    return added
  }

  /** Bulk insert used by imports; keeps each entry's own id/savedAt. */
  putImported(entries: LibraryEntry[]) {
    this.entries = [...entries, ...this.entries]
    void this.persist(() => this.backend.putEntries(entries))
    this.emit()
  }

  update(id: string, preset: Preset) {
    const e = this.entries.find((x) => x.id === id)
    if (!e) return
    const next = { ...e, savedAt: Date.now(), preset: clonePreset(preset), search: searchText(preset) }
    this.entries = this.entries.map((x) => (x.id === id ? next : x))
    void this.persist(() => this.backend.putEntries([next]))
    this.emit()
  }

  rename(id: string, name: string) {
    const e = this.entries.find((x) => x.id === id)
    const trimmed = name.trim()
    if (!e || !trimmed || trimmed === e.preset.name) return
    this.update(id, { ...e.preset, name: trimmed })
  }

  remove(id: string) {
    if (!this.entries.some((e) => e.id === id)) return
    this.entries = this.entries.filter((e) => e.id !== id)
    void this.persist(() => this.backend.deleteEntries([id]))
    this.emit()
  }

  /** Import .fuse sources (files, folders, zips, drops) — see import.ts for the mapping. */
  async importFiles(files: import('./import').SourceFile[], targetCollectionId: string | null,
    onProgress?: import('./import').ImportProgress): Promise<import('./import').ImportResult> {
    const { importFiles } = await import('./import')
    return importFiles(this, files, targetCollectionId, onProgress)
  }

  /** Ask the browser not to evict the storage on the first import. */
  noteImport() {
    if (this.persistAsked) return
    this.persistAsked = true
    try { void navigator.storage?.persist?.() } catch { /* not available */ }
  }
}

// --- Backends ---

const DB = 'mustang-library'

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('collections', { keyPath: 'id' })
      req.result.createObjectStore('entries', { keyPath: 'id' })
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

function tx(db: IDBDatabase, store: string, run: (s: IDBObjectStore) => void): Promise<void> {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite')
    run(t.objectStore(store))
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).getAll()
    req.onsuccess = () => res(req.result as T[])
    req.onerror = () => rej(req.error)
  })
}

export function idbBackend(): LibraryBackend {
  let db: Promise<IDBDatabase> | null = null
  const get = () => (db ??= idb())
  return {
    async load() {
      const d = await get()
      const [collections, entries] = await Promise.all([getAll<Collection>(d, 'collections'), getAll<LibraryEntry>(d, 'entries')])
      return { collections, entries }
    },
    async putCollections(c) { const d = await get(); await tx(d, 'collections', (s) => c.forEach((x) => s.put(x))) },
    async deleteCollection(id) { const d = await get(); await tx(d, 'collections', (s) => s.delete(id)) },
    async putEntries(e) { const d = await get(); await tx(d, 'entries', (s) => e.forEach((x) => s.put(x))) },
    async deleteEntries(ids) { const d = await get(); await tx(d, 'entries', (s) => ids.forEach((x) => s.delete(x))) },
  }
}

export function memoryBackend(): LibraryBackend {
  const data: { collections: Collection[]; entries: LibraryEntry[] } = { collections: [], entries: [] }
  return {
    async load() { return { collections: [...data.collections], entries: [...data.entries] } },
    async putCollections(c) { c.forEach((x) => { const i = data.collections.findIndex((y) => y.id === x.id); if (i < 0) data.collections.push(x); else data.collections[i] = x }) },
    async deleteCollection(id) { data.collections = data.collections.filter((x) => x.id !== id) },
    async putEntries(e) { e.forEach((x) => { const i = data.entries.findIndex((y) => y.id === x.id); if (i < 0) data.entries.push(x); else data.entries[i] = x }) },
    async deleteEntries(ids) { const gone = new Set(ids); data.entries = data.entries.filter((x) => !gone.has(x.id)) },
  }
}

/** The store for the running app: IndexedDB when the browser has it, memory otherwise. */
export const library = new LibraryStore(typeof indexedDB === 'undefined' ? memoryBackend() : idbBackend())

export function useLibrary(): LibrarySnapshot {
  return useSyncExternalStore(library.subscribe, library.getSnapshot)
}
