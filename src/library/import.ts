// Import .fuse presets into the library: single files, folders, zips, and drag & drop.
// Mapping: one collection per first-level subfolder (deeper levels flatten into it),
// top-level files of a zip/folder go to a collection named after that source;
// plain files go into the selected collection.

import { parseFuse } from '../fuse/fuse'
import { samePreset } from '../protocol/preset'
import { searchText, type Collection, type LibraryEntry, type LibraryStore } from './store'

export interface SourceFile {
  /** Relative path inside the source ("/" separated); plain files use just their name. */
  path: string
  /** When set, this file goes to the chosen collection instead of a folder-derived one. */
  flat?: boolean
  data: () => Promise<string>
}

export interface ImportResult {
  added: number
  duplicates: number
  failed: { path: string; error: string }[]
  /** FUSE backup folders imported as banks. `skipped` = identical bank already in the library. */
  banks: { added: number; skipped: number; presets: number }
}

export type ImportProgress = (done: number, total: number) => void

// --- Sources ---

const isFuse = (name: string) => /\.fuse$/i.test(name)
const isZip = (name: string) => /\.zip$/i.test(name)
const baseName = (path: string) => path.split('/').pop() ?? path

/** Files picked with the file input or folder input (webkitdirectory). */
export async function sourceFiles(files: File[]): Promise<SourceFile[]> {
  const out: SourceFile[] = []
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    if (isZip(f.name)) out.push(...await unzip(await f.arrayBuffer()))
    else if (isFuse(f.name)) out.push({ path: rel, flat: !rel.includes('/'), data: () => f.text() })
  }
  return out
}

interface WebKitEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath: string
  file?: (cb: (f: File) => void, eb?: (e: Error) => void) => void
  createReader?: () => { readEntries: (cb: (e: WebKitEntry[]) => void, eb?: (e: Error) => void) => void }
}

async function walkEntry(entry: WebKitEntry, out: SourceFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej))
    const rel = entry.fullPath.replace(/^\//, '')
    if (isZip(file.name)) out.push(...await unzip(await file.arrayBuffer()))
    else if (isFuse(file.name)) out.push({ path: rel, flat: !rel.includes('/'), data: () => file.text() })
  } else if (entry.isDirectory) {
    const reader = entry.createReader!()
    // readEntries returns batches; call until an empty batch comes back.
    for (;;) {
      const entries = await new Promise<WebKitEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (!entries.length) break
      for (const e of entries) await walkEntry(e, out)
    }
  }
}

/** Files, folders and zips dropped on the panel. */
export async function droppedFiles(dt: DataTransfer): Promise<SourceFile[]> {
  const out: SourceFile[] = []
  const items = Array.from(dt.items).filter((i) => i.kind === 'file')
  const entries = items.map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => WebKitEntry | null }).webkitGetAsEntry?.()).filter(Boolean) as WebKitEntry[]
  if (entries.length === items.length && entries.length) {
    for (const e of entries) await walkEntry(e, out)
  } else {
    // Fallback (Firefox etc.): treat dropped files like the file input.
    for (const i of items) {
      const f = i.getAsFile()
      if (f) out.push(...await sourceFiles([f]))
    }
  }
  return out
}

// --- Minimal zip reader (central directory; stored + deflate-raw) ---

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  void writer.write(data as Uint8Array<ArrayBuffer>).then(() => writer.close())
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

export async function unzip(buf: ArrayBuffer): Promise<SourceFile[]> {
  const b = new Uint8Array(buf)
  // End of central directory: find its signature scanning back from the end.
  let eocd = -1
  for (let i = b.length - 22; i >= 0; i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid .zip file')
  const count = u16(b, eocd + 10)
  let off = u32(b, eocd + 16)
  const names: { name: string; method: number; size: number; local: number }[] = []
  for (let i = 0; i < count && off + 46 <= b.length; i++) {
    if (u32(b, off) !== 0x02014b50) break
    const method = u16(b, off + 10)
    const csize = u32(b, off + 20)
    const nlen = u16(b, off + 28)
    const elen = u16(b, off + 30)
    const clen = u16(b, off + 32)
    const local = u32(b, off + 42)
    const name = new TextDecoder().decode(b.subarray(off + 46, off + 46 + nlen))
    names.push({ name, method, size: csize, local })
    off += 46 + nlen + elen + clen
  }
  const out: SourceFile[] = []
  for (const e of names) {
    const name = e.name.replace(/\\/g, '/')
    if (name.endsWith('/')) continue // directory
    const file = baseName(name)
    if (!isFuse(file)) continue
    if (name.split('/').some((p) => p === '__MACOSX' || p.startsWith('.'))) continue
    out.push({
      path: name,
      data: async () => {
        // Local header: name/extra lengths there differ from the central ones.
        const nl = u16(b, e.local + 26), el = u16(b, e.local + 28)
        const start = e.local + 30 + nl + el
        const raw = b.subarray(start, start + e.size)
        const bytes = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : (() => { throw new Error(`Unsupported zip compression method ${e.method}`) })()
        return new TextDecoder().decode(bytes)
      },
    })
  }
  return out
}

// --- Mapping: which collection does each file go to ---

/** Strip one common root folder when every file shares it. */
export function stripCommonRoot(paths: string[]): string[] {
  const first = paths[0]?.split('/')[0]
  if (!first || !paths.every((p) => p.startsWith(first + '/'))) return paths
  return paths.map((p) => p.slice(first.length + 1))
}

/**
 * Decide the collection name for each structured file (folder/zip contents).
 * `fallback` is the name of the zip or folder, used for top-level files.
 */
export function mapFiles(
  paths: string[],
  ensure: (name: string) => Collection,
  fallback: string,
): { collectionId: string; path: string }[] {
  const stripped = stripCommonRoot(paths)
  return stripped.map((p, i) => {
    const parts = p.split('/')
    const name = parts.length > 1 ? parts[0] : fallback
    return { collectionId: ensure(name).id, path: paths[i] }
  })
}

/** Derive a name for the zip/folder source (top-level files land in a collection with this name). */
export function sourceName(files: SourceFile[]): string {
  const roots = new Set(files.filter((f) => !f.flat).map((f) => f.path.split('/')[0]))
  return roots.size === 1 ? [...roots][0].replace(/\.zip$/i, '') : 'Imported'
}

// --- FUSE backup folders: <dir>/<M2_|MU_>BackupName.fuse + <dir>/Presets/NN_<name>.fuse ---
// A directory holding such files is ONE bank; its FUSE/ extras and SystemSettings.fuse are ignored.

const SLOT_FILE = /^(\d{2,3})_.+\.fuse$/i
const NAME_FILE = /_BackupName\.fuse$/i

interface BackupFiles {
  dir: string
  nameFile?: SourceFile
  slots: { position: number; file: SourceFile }[]
}

/** Find backup directories among the stripped paths; '' = the root itself is a backup folder. */
export function detectBackups(strippedPaths: string[]): string[] {
  const dirs = new Set<string>()
  for (const s of strippedPaths) {
    const m = /^(.*\/)?Presets\/\d{2,3}_.+\.fuse$/i.exec(s)
    if (m) { dirs.add((m[1] ?? '').replace(/\/$/, '')); continue }
    if (NAME_FILE.test(baseName(s)) && !s.endsWith('/')) {
      const dir = s.slice(0, s.length - baseName(s).length).replace(/\/$/, '')
      dirs.add(dir)
    }
  }
  return [...dirs]
}

const inDir = (path: string, dir: string) => (dir ? path.startsWith(dir + '/') : true)

/** Role of a file relative to one backup directory. */
function backupRole(stripped: string, dir: string): 'slot' | 'name' | 'skip' | null {
  if (!inDir(stripped, dir)) return null
  const rel = dir ? stripped.slice(dir.length + 1) : stripped
  if (rel.startsWith('Presets/') && SLOT_FILE.test(rel.slice(8)) && !rel.slice(8).includes('/')) return 'slot'
  if (rel.startsWith('FUSE/')) return 'skip'
  if (!rel.includes('/')) {
    if (NAME_FILE.test(rel)) return 'name'
    if (/^SystemSettings\.fuse$/i.test(rel)) return 'skip'
  }
  return null
}

// --- Import ---

const CHUNK = 200
const yieldToUi = () => new Promise((r) => setTimeout(r, 0))

/**
 * Parse and add the files. `targetCollectionId` is used for flat files;
 * `null` means "My Presets". Calls `onProgress` after every file.
 */
export async function importFiles(
  store: LibraryStore,
  files: SourceFile[],
  targetCollectionId: string | null,
  onProgress?: ImportProgress,
): Promise<ImportResult> {
  store.noteImport()
  const fallback = sourceName(files)
  const structured = files.filter((f) => !f.flat)
  const target = targetCollectionId ?? store.defaultCollectionId() ?? ''

  // FUSE backup folders become banks; their files stay out of the normal collection mapping.
  const stripped = stripCommonRoot(structured.map((f) => f.path))
  const strippedOf = new Map(structured.map((f, i) => [f.path, stripped[i]]))
  const backupDirs = detectBackups(stripped)
  const backups = new Map<string, BackupFiles>()
  const consumed = new Set<string>() // paths handled as part of a bank
  for (const dir of backupDirs) {
    const b: BackupFiles = { dir, slots: [] }
    for (const f of structured) {
      const s = strippedOf.get(f.path)!
      const role = backupRole(s, dir)
      if (role === 'slot') b.slots.push({ position: parseInt(SLOT_FILE.exec(baseName(s))![1], 10), file: f })
      else if (role === 'name' && !b.nameFile) b.nameFile = f
      if (role) consumed.add(f.path)
    }
    backups.set(dir, b)
  }
  const loose = structured.filter((f) => !consumed.has(f.path))

  const mapped = new Map<string, string>() // path → collectionId
  mapFiles(loose.map((f) => f.path), (n) => store.ensureCollection(n), fallback)
    .forEach((m) => mapped.set(m.path, m.collectionId))

  const result: ImportResult = { added: 0, duplicates: 0, failed: [], banks: { added: 0, skipped: 0, presets: 0 } }
  const pending: LibraryEntry[] = []
  const flush = () => { if (pending.length) { store.putImported(pending.splice(0)) } }
  let done = 0
  const tick = async () => { done++; onProgress?.(done, files.length); if (done % CHUNK === 0) { flush(); await yieldToUi() } }

  // Banks first: each directory → one bank (name from *_BackupName.fuse or the folder name).
  for (const b of backups.values()) {
    let bankName = ''
    if (b.nameFile) {
      try { bankName = (await b.nameFile.data()).split('\n')[0].trim() } catch { /* fall back to the folder name */ }
      await tick()
    }
    if (!bankName) bankName = b.dir ? baseName(b.dir) : fallback
    const max = b.slots.reduce((m, s) => Math.max(m, s.position), -1)
    const size = max < 8 ? 8 : max < 24 ? 24 : 100
    const items: { position: number; preset: import('../protocol/preset').Preset }[] = []
    for (const s of b.slots.sort((a, c) => a.position - c.position)) {
      try {
        items.push({ position: s.position, preset: parseFuse(await s.file.data(), baseName(s.file.path).replace(/\.fuse$/i, '')) })
      } catch (e) {
        result.failed.push({ path: s.file.path, error: e instanceof Error ? e.message : 'Could not parse' })
      }
      await tick()
    }
    const { created } = store.addImportedBank(bankName, size, items)
    if (created) { result.banks.added++; result.banks.presets += items.length } else result.banks.skipped++
  }

  for (const f of files) {
    if (consumed.has(f.path)) {
      if (![...backups.values()].some((b) => b.nameFile === f || b.slots.some((s) => s.file === f))) await tick() // extras: counted, not parsed
      continue
    }
    const collectionId = f.flat ? target : mapped.get(f.path)!
    try {
      const preset = parseFuse(await f.data(), baseName(f.path).replace(/\.fuse$/i, ''))
      const dup = store.getSnapshot().entries.some((e) =>
        e.collectionId === collectionId && e.preset.name === preset.name && samePreset(e.preset, preset))
        || pending.some((e) => e.collectionId === collectionId && e.preset.name === preset.name && samePreset(e.preset, preset))
      if (dup) {
        result.duplicates++
      } else {
        pending.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${done}`, collectionId, savedAt: Date.now() - done, preset, search: searchText(preset) })
        result.added++
      }
    } catch (e) {
      result.failed.push({ path: f.path, error: e instanceof Error ? e.message : 'Could not parse' })
    }
    done++
    onProgress?.(done, files.length)
    if (done % CHUNK === 0) { flush(); await yieldToUi() }
  }
  flush()
  return result
}
