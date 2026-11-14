import * as HoverCard from '@radix-ui/react-hover-card'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Download, FilePlus2, FolderInput, HardDriveDownload, HardDriveUpload, Info, LayoutGrid, Library as LibraryIcon, Loader2, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { droppedFiles, importFiles, sourceFiles, type ImportResult } from '../library/import'
import { library as defaultLibrary, type Collection, type LibraryEntry, type LibraryStore } from '../library/store'
import { exportBank, exportCollection } from '../library/zip'
import { BANKS, bankPositionLabel, LETTERS, slotLabel } from '../data/slots'
import { exportFuse } from '../fuse/fuse'
import { newPreset, samePreset, type Preset } from '../protocol/preset'
import { PresetDetails } from './PresetDetails'
import { Button, cx } from './ui'

const PAGE = 100

const itemClass =
  'flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-40 data-[disabled]:pointer-events-none'

/** The amp side of bank backup/restore, wired by App (absent in tests → amp menu items hidden). */
export interface AmpOps {
  connected: boolean
  slotCount: number
  isV2: boolean
  backupSlots: (slots: number[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal) => Promise<{ slot: number; preset: Preset }[]>
  restoreSlots: (items: { slot: number; preset: Preset }[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal) => Promise<void>
}

/** "YYYY-MM-DD HH:MM" for backup names. */
const stamp = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface Props {
  /** The preset in the editor. */
  current: Preset
  /** Put a preset into the editor (and onto the amp when connected). */
  onLoad: (preset: Preset, id?: string) => void
  /** The entry the editor preset came from, shown marked like the active amp slot. */
  activeId: string | null
  /** Mark an entry as the source of the editor preset. */
  onMark: (id: string) => void
  onClose: () => void
  /** Test seam; the app uses the real IndexedDB store. */
  store?: LibraryStore
  amp?: AmpOps
}

export function LibraryPanel({ current, onLoad, activeId, onMark, onClose, store = defaultLibrary, amp }: Props) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { collections, entries, loaded } = snap
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string | null>(null) // collection id, null = ALL
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [creating, setCreating] = useState<string | null>(null)
  const [renamingCollection, setRenamingCollection] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const [ampRun, setAmpRun] = useState<{ kind: 'read' | 'write'; done: number; total: number } | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const dragCount = useRef(0)
  const dragPos = useRef<number | null>(null)
  const ampAbort = useRef<AbortController | null>(null)
  const more = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedCollection = collections.find((c) => c.id === selected)
  const isDefault = selected !== null && !store.canDelete(selected)

  useEffect(() => setShown(PAGE), [query, selected])
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return entries.filter((e) =>
      (selected === null || e.collectionId === selected) &&
      words.every((w) => e.search.includes(w)))
  }, [entries, selected, query])
  const visible = results.slice(0, shown)
  const countFor = (id: string | null) => id === null ? entries.length : entries.filter((e) => e.collectionId === id).length
  const nameFor = (id: string) => collections.find((c) => c.id === id)?.name ?? ''

  // Show another page of rows when the end of the list scrolls into view.
  useEffect(() => {
    const el = more.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => Math.min(n + PAGE, results.length)), { threshold: 0.1 })
    io.observe(el)
    return () => io.disconnect()
  }, [results.length, shown])

  const runImport = async (files: File[] | DataTransfer) => {
    try {
      setSummary(null); setError(null)
      const src = Array.isArray(files) ? await sourceFiles(files) : await droppedFiles(files)
      if (!src.length) { setError('No .fuse presets found in that selection'); return }
      const target = selected // flat files go to the selected collection, ALL → My Presets
      setImporting({ done: 0, total: src.length })
      const r: ImportResult = await importFiles(store, src, target, (done, total) => setImporting({ done, total }))
      const bits: string[] = []
      if (r.banks.added) bits.push(`${r.banks.added} bank${r.banks.added === 1 ? '' : 's'} (${r.banks.presets.toLocaleString()} presets)`)
      bits.push(`${r.added.toLocaleString()} preset${r.added === 1 ? '' : 's'}`)
      if (r.banks.skipped) bits.push(`${r.banks.skipped} bank${r.banks.skipped === 1 ? '' : 's'} already imported`)
      if (r.duplicates) bits.push(`${r.duplicates.toLocaleString()} duplicate${r.duplicates === 1 ? '' : 's'} skipped`)
      if (r.failed.length) bits.push(`${r.failed.length.toLocaleString()} failed (${r.failed.slice(0, 3).map((f) => f.path.split('/').pop()).join(', ')}${r.failed.length > 3 ? '…' : ''})`)
      setSummary(`Imported ${bits.join(', ')}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import the selection')
    } finally {
      setImporting(null)
    }
  }

  const finishRename = (save: boolean) => {
    if (save && renaming) store.rename(renaming.id, renaming.name)
    setRenaming(null)
  }

  const createCollection = () => {
    const c = creating !== null ? store.addCollection(creating) : null
    if (c) setSelected(c.id)
    setCreating(null)
  }

  const deleteCollection = () => {
    if (!selectedCollection || isDefault) return
    if (confirm(`Delete ${selectedCollection.name} and its ${countFor(selected)} presets?`)) {
      store.removeCollection(selectedCollection.id)
      setSelected(null)
    }
  }

  // --- Banks ---
  const ampSlotLabel = (i: number) => (amp && amp.slotCount === 100 ? String(i + 1) : slotLabel(i))
  const bankEntries = (bankId: string) =>
    entries.filter((e) => e.collectionId === bankId && e.position !== undefined).sort((a, b) => a.position! - b.position!)

  const runAmp = async (kind: 'read' | 'write', total: number,
    fn: (progress: (d: number, t: number) => void, signal: AbortSignal) => Promise<void>) => {
    const ctrl = new AbortController()
    ampAbort.current = ctrl
    setError(null)
    try {
      setAmpRun({ kind, done: 0, total })
      await fn((done, t) => setAmpRun({ kind, done, total: t }), ctrl.signal)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The amp operation failed')
    } finally {
      setAmpRun(null)
      ampAbort.current = null
    }
  }

  /** Read amp slots into a new bank and select it. */
  const backup = (slots: number[], name: string, size: 8 | 24 | 100) => {
    if (!amp) return
    void runAmp('read', slots.length, async (progress, signal) => {
      const res = await amp.backupSlots(slots, progress, signal)
      if (!res.length) { setError('Backup cancelled — nothing was read.'); return }
      const bank = store.addBank(name, size)
      for (const r of res) store.putAt(bank.id, slots.indexOf(r.slot), r.preset)
      setSelected(bank.id)
      setSummary(`Backed up ${res.length} presets to “${bank.name}”`)
    })
  }

  /** Write the filled positions of a bank to amp slots (24-bank groups keep their slot numbers; 8-banks target a colour group). */
  const writeToAmp = (bank: Collection, slots: { bankPos: number; slot: number }[]) => {
    if (!amp) return
    const items = slots
      .map((s) => ({ slot: s.slot, entry: store.entryAt(bank.id, s.bankPos) }))
      .filter((x): x is { slot: number; entry: LibraryEntry } => !!x.entry)
      .map((x) => ({ slot: x.slot, preset: x.entry.preset }))
    if (!items.length) return
    const first = items[0].slot, last = items[items.length - 1].slot
    if (!confirm(`Overwrite ${items.length} amp slot${items.length === 1 ? '' : 's'} (${ampSlotLabel(first)}–${ampSlotLabel(last)})? This cannot be undone.`)) return
    void runAmp('write', items.length, (progress, signal) => amp.restoreSlots(items, progress, signal))
  }

  /** One colour group of a 24-bank exported as an 8-bank zip. */
  const exportGroup = (bank: Collection, group: number) => {
    const sub = {
      ...bank,
      name: `${bank.name} ${BANKS[group].label}`,
      bank: { size: 8 as const },
    }
    const items = bankEntries(bank.id)
      .filter((e) => e.position! >= group * 8 && e.position! < group * 8 + 8)
      .map((e) => ({ ...e, position: e.position! - group * 8 }))
    exportBank(sub, items, !amp?.connected || amp.isV2)
  }

  const selBank = selectedCollection?.bank
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)
  const bankRows = useMemo(() => {
    if (!selBank || !selectedCollection) return []
    const byPos = new Map(entries.filter((e) => e.collectionId === selectedCollection.id).map((e) => [e.position, e]))
    return Array.from({ length: selBank.size }, (_, pos) => ({ pos, e: byPos.get(pos) }))
      .filter((r) => !queryWords.length || (r.e && queryWords.every((w) => r.e!.search.includes(w))))
  }, [selBank, selectedCollection, entries, query]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Rows the arrow keys walk: filled bank positions in order, or the filtered list. */
  const navList = selBank ? bankRows.filter((r) => r.e).map((r) => r.e!) : visible

  /** Second line under a preset name in the ALL view: collection, or "bank · ORG A". */
  const subtitleFor = (e: (typeof entries)[number]) => {
    const c = collections.find((x) => x.id === e.collectionId)
    if (c?.bank && e.position !== undefined) return `${c.name} · ${bankPositionLabel(c.bank.size, e.position)}`
    return nameFor(e.collectionId)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
    e.preventDefault()
    if (!navList.length) return
    const i = navList.findIndex((v) => v.id === activeId)
    const next = e.key === 'ArrowDown' ? (i < navList.length - 1 ? i + 1 : 0) : i > 0 ? i - 1 : navList.length - 1
    const entry = navList[next]
    onLoad(entry.preset, entry.id)
    flash(entry.id)
    const row = document.getElementById(`library-row-${next}`)
    row?.scrollIntoView({ block: 'nearest' })
    row?.focus()
  }

  const flash = (id: string) => {
    setHover(id)
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover(null), 3000)
  }

  return (
    <div className={cx('flex flex-col h-full bg-transparent transition-colors', dragging && 'bg-primary/10')}
      onKeyDown={onKeyDown}
      onDragEnter={(e) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); dragCount.current++; setDragging(true) }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
      onDragLeave={() => { if (--dragCount.current <= 0) { dragCount.current = 0; setDragging(false) } }}
      onDrop={(e) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); dragCount.current = 0; setDragging(false); if (loaded) void runImport(e.dataTransfer) }}>
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <LibraryIcon className="size-5 text-primary" />Library
          <span title="Presets are stored in this browser. Clearing site data removes them. Export important presets as .fuse files.">
            <Info className="size-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <Menu.Root>
            <Menu.Trigger asChild>
              <Button variant="ghost" className="size-8 rounded-md" title="Add to library" disabled={!loaded}><Plus className="size-4" /></Button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={4}
                className="z-50 min-w-44 rounded-md border border-border bg-card p-1 text-foreground shadow-xl">
                <Menu.Item className={itemClass} onSelect={() => { store.add(selected ?? store.defaultCollectionId() ?? '', [newPreset('New Preset')]) }}>
                  <FilePlus2 className="mr-2 size-4" /> New Preset
                </Menu.Item>
                <Menu.Item className={itemClass} onSelect={() => { const [added] = store.add(selected ?? store.defaultCollectionId() ?? '', [current]); onMark(added.id) }}>
                  <Save className="mr-2 size-4" /> Current Preset
                </Menu.Item>
                <Menu.Item className={itemClass} onSelect={() => fileInput.current?.click()}>
                  <Upload className="mr-2 size-4" /> Import Files…
                </Menu.Item>
                <Menu.Item className={itemClass} onSelect={() => dirInput.current?.click()}>
                  <FolderInput className="mr-2 size-4" /> Import Folder…
                </Menu.Item>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item className={itemClass} onSelect={() => setSelected(store.addBank('Bank', 24).id)}>
                  <LayoutGrid className="mr-2 size-4" /> New bank (24)
                </Menu.Item>
                <Menu.Item className={itemClass} onSelect={() => setSelected(store.addBank('Bank', 8).id)}>
                  <LayoutGrid className="mr-2 size-4" /> New bank (8)
                </Menu.Item>
                {amp?.slotCount === 100 && (
                  <Menu.Item className={itemClass} onSelect={() => setSelected(store.addBank('Bank', 100).id)}>
                    <LayoutGrid className="mr-2 size-4" /> New bank (100)
                  </Menu.Item>
                )}
                {amp?.connected && (
                  <>
                    <Menu.Separator className="my-1 h-px bg-border" />
                    <Menu.Item className={itemClass} disabled={!!ampRun}
                      onSelect={() => backup(Array.from({ length: amp.slotCount }, (_, i) => i), `Backup ${stamp()}`, amp.slotCount === 100 ? 100 : 24)}>
                      <HardDriveDownload className="mr-2 size-4" /> Back up amp
                    </Menu.Item>
                    {BANKS.map((b, g) => (
                      <Menu.Item key={b.key} className={itemClass} disabled={!!ampRun}
                        onSelect={() => backup(Array.from({ length: 8 }, (_, i) => g * 8 + i), `${b.label} backup ${stamp()}`, 8)}>
                        <HardDriveDownload className="mr-2 size-4" /> Back up {b.label}
                      </Menu.Item>
                    ))}
                  </>
                )}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
          <Button variant="ghost" className="size-8 rounded-md" title="Close" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <input ref={fileInput} type="file" accept=".fuse,.zip" multiple className="hidden"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void runImport(f) }} />
        <input ref={dirInput} type="file" className="hidden"
          {...{ webkitdirectory: '', directory: '' } as unknown as React.InputHTMLAttributes<HTMLInputElement>}
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void runImport(f) }} />
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1 overflow-hidden">
        <div className="flex flex-wrap gap-1.5 items-center">
          <Button variant={selected === null ? 'primary' : 'secondary'} className="h-6 rounded-md text-[10px] px-2" onClick={() => setSelected(null)}>
            ALL {entries.length > 0 && `· ${entries.length.toLocaleString()}`}
          </Button>
          {collections.map((c) => (
            renamingCollection === c.id ? (
              <input key={c.id} autoFocus defaultValue={c.name}
                className="h-6 w-28 px-2 text-[10px] rounded-md border border-primary bg-rail outline-none"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') { store.renameCollection(c.id, (ev.target as HTMLInputElement).value); setRenamingCollection('') }
                  else if (ev.key === 'Escape') setRenamingCollection('')
                }}
                onBlur={(ev) => { store.renameCollection(c.id, ev.target.value); setRenamingCollection('') }} />
            ) : (
              <span key={c.id} className={cx('inline-flex items-center rounded-md text-[10px] h-6',
                selected === c.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')}>
                <button className="px-2 h-full rounded-l-md flex items-center gap-1" onClick={() => setSelected(c.id)}>
                  {c.bank && <LayoutGrid className="size-3 opacity-70" />}
                  {c.name.toUpperCase()} · {c.bank ? `${countFor(c.id)}/${c.bank.size}` : countFor(c.id).toLocaleString()}
                </button>
                {selected === c.id && (
                  <Menu.Root>
                    <Menu.Trigger asChild>
                      <button className="h-full px-1 rounded-r-md border-l border-black/20" title="Collection actions"><ChevronDown className="size-3" /></button>
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content align="start" sideOffset={4}
                        className="z-50 min-w-48 rounded-md border border-border bg-card p-1 text-foreground shadow-xl">
                        <Menu.Item className={itemClass} onSelect={() => setRenamingCollection(c.id)}>Rename</Menu.Item>
                        {!c.bank && (
                          <Menu.Item className={itemClass} disabled={countFor(c.id) === 0}
                            onSelect={() => exportCollection(c, entries.filter((e) => e.collectionId === c.id))}>
                            <Download className="mr-2 size-4" /> Export .zip
                          </Menu.Item>
                        )}
                        {c.bank && (
                          <>
                            <Menu.Item className={itemClass} onSelect={() => exportBank(c, bankEntries(c.id), !amp?.connected || amp.isV2)}>
                              <Download className="mr-2 size-4" /> Export .zip
                            </Menu.Item>
                            {c.bank.size === 24 && BANKS.map((b, g) => (
                              <Menu.Item key={b.key} className={itemClass} onSelect={() => exportGroup(c, g)}>
                                <Download className="mr-2 size-4" /> Export {b.label} as 8-bank
                              </Menu.Item>
                            ))}
                            {amp?.connected && (
                              <>
                                <Menu.Separator className="my-1 h-px bg-border" />
                                {c.bank.size === 8 ? BANKS.map((b, g) => (
                                  <Menu.Item key={b.key} className={itemClass} disabled={!!ampRun}
                                    onSelect={() => writeToAmp(c, Array.from({ length: 8 }, (_, i) => ({ bankPos: i, slot: g * 8 + i })))}>
                                    <HardDriveUpload className="mr-2 size-4" /> Write to amp: {b.label}
                                  </Menu.Item>
                                )) : (
                                  <>
                                    <Menu.Item className={itemClass} disabled={!!ampRun}
                                      onSelect={() => writeToAmp(c, Array.from({ length: c.bank!.size }, (_, i) => ({ bankPos: i, slot: i })))}>
                                      <HardDriveUpload className="mr-2 size-4" /> Write to amp: all {c.bank.size} slots
                                    </Menu.Item>
                                    {c.bank.size === 24 && BANKS.map((b, g) => (
                                      <Menu.Item key={b.key} className={itemClass} disabled={!!ampRun}
                                        onSelect={() => writeToAmp(c, Array.from({ length: 8 }, (_, i) => ({ bankPos: g * 8 + i, slot: g * 8 + i })))}>
                                        <HardDriveUpload className="mr-2 size-4" /> Write to amp: {b.label} only
                                      </Menu.Item>
                                    ))}
                                  </>
                                )}
                              </>
                            )}
                          </>
                        )}
                        {!isDefault && (
                          <Menu.Item className={cx(itemClass, 'text-destructive')} onSelect={deleteCollection}>Delete</Menu.Item>
                        )}
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu.Root>
                )}
              </span>
            )
          ))}
          {creating !== null ? (
            <input autoFocus value={creating} placeholder="Collection name"
              className="h-6 w-32 px-2 text-[10px] rounded-md border border-primary bg-rail outline-none"
              onChange={(e) => setCreating(e.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') createCollection()
                else if (ev.key === 'Escape') setCreating(null)
              }}
              onBlur={() => creating.trim() ? createCollection() : setCreating(null)} />
          ) : (
            <Button variant="secondary" className="h-6 rounded-md text-[10px] px-2" title="New collection" onClick={() => setCreating('')}>+</Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search presets..."
            className="w-full pl-9 pr-14 h-9 text-sm rounded-md border border-muted bg-background outline-none focus:border-primary" />
          {query && (
            <button onClick={() => setQuery('')} title="Clear search"
              className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-muted/50"><X className="h-3 w-3" /></button>
          )}
          {entries.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded-sm pointer-events-none">
              {results.length.toLocaleString()}
            </div>
          )}
        </div>

        {(error || snap.error) && <p className="text-[11px] text-destructive shrink-0">{error ?? snap.error}</p>}
        {importing && <p className="text-[11px] text-muted-foreground shrink-0">Importing {importing.done.toLocaleString()} / {importing.total.toLocaleString()}…</p>}
        {ampRun && (
          <p className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            {ampRun.kind === 'read' ? 'Reading' : 'Writing'} slot {ampRun.done} / {ampRun.total}…
            <button className="text-destructive hover:underline" onClick={() => ampAbort.current?.abort()}>Cancel</button>
          </p>
        )}
        {summary && <p className="text-[11px] text-muted-foreground shrink-0">{summary}</p>}

        {!loaded ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : entries.length === 0 && !query && !selBank ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="text-sm text-muted-foreground">No presets yet. Import .fuse files, a folder or a .zip, or add the current preset.</p>
            <Button className="h-8 rounded-md px-3 text-xs" onClick={() => { const [added] = store.add(selected ?? store.defaultCollectionId() ?? '', [current]); onMark(added.id) }}>
              Add the current preset
            </Button>
          </div>
        ) : selBank ? (
          <div className="flex-1 -mx-2 px-2 overflow-y-auto">
            <div className="space-y-0.5 pb-4">
              {bankRows.map(({ pos, e }, i) => (
                <div key={pos} draggable
                  onDragStart={(ev) => { dragPos.current = pos; ev.dataTransfer.setData('text/x-bank-pos', String(pos)) }}
                  onDragOver={(ev) => { if (ev.dataTransfer.types.includes('text/x-bank-pos')) { ev.preventDefault(); ev.stopPropagation(); setDropTarget(pos) } }}
                  onDragLeave={() => { if (dropTarget === pos) setDropTarget(null) }}
                  onDrop={(ev) => {
                    if (!ev.dataTransfer.types.includes('text/x-bank-pos')) return
                    ev.preventDefault(); ev.stopPropagation()
                    const from = dragPos.current
                    setDropTarget(null); dragPos.current = null
                    if (from !== null && from !== pos) store.swap(selectedCollection!.id, from, pos)
                  }}
                  onDragEnd={() => { setDropTarget(null); dragPos.current = null }}
                  id={`library-row-${e ? navList.findIndex((x) => x.id === e.id) : i}`} tabIndex={-1}
                  className={cx('flex items-center gap-1 rounded px-1 py-0.5 border transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    dropTarget === pos ? 'border-primary bg-primary/10'
                      : e && e.id === activeId ? 'bg-primary/15 border-primary/30'
                      : 'border-transparent hover:bg-accent/50 hover:border-border')}>
                  <span className="text-readout mr-1 flex items-center gap-1.5 w-11 shrink-0 text-muted-foreground text-[10px]">
                    {selBank.size === 24 ? (
                      <><span className={cx('h-2 w-2 rounded-full shadow-sm', BANKS[Math.floor(pos / 8)].dot)} />{LETTERS[pos % 8]}</>
                    ) : selBank.size === 8 ? LETTERS[pos] : String(pos + 1)}
                  </span>
                  {e ? (
                    <>
                      {renaming?.id === e.id ? (
                        <input autoFocus value={renaming.name} maxLength={32}
                          className="h-7 py-0 px-2 text-xs flex-1 min-w-0 rounded-md border border-border bg-rail outline-none focus:border-primary"
                          onChange={(ev) => setRenaming({ id: e.id, name: ev.target.value })}
                          onBlur={() => finishRename(true)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') finishRename(true)
                            else if (ev.key === 'Escape') finishRename(false)
                          }} />
                      ) : (
                        <button className="flex-1 min-w-0 text-left" onClick={() => onLoad(e.preset, e.id)}
                          onDoubleClick={() => setRenaming({ id: e.id, name: e.preset.name })} title="Double click to rename">
                          <div className={cx('truncate text-xs font-medium', e.id === activeId && 'text-primary')}>{e.preset.name}</div>
                        </button>
                      )}
                      <Button variant="ghost" title="Overwrite with current settings"
                        className={cx('h-6 w-6 shrink-0 rounded-md', e.id === activeId && !samePreset(current, e.preset) && 'text-primary')}
                        onClick={() => {
                          if (confirm(`Overwrite "${e.preset.name}" in the bank with the current settings?`)) {
                            store.update(e.id, current)
                            onMark(e.id)
                          }
                        }}><Save className="size-3" /></Button>
                      <Button variant="ghost" className="h-6 w-6 shrink-0 rounded-md" title="Export as .fuse file"
                        onClick={() => exportFuse(e.preset)}><Download className="size-3" /></Button>
                      <Button variant="ghost" className="h-6 w-6 shrink-0 rounded-md hover:text-destructive" title="Clear this position"
                        onClick={() => { if (confirm(`Clear "${e.preset.name}" from ${bankPositionLabel(selBank.size, pos)}?`)) store.clearAt(selectedCollection!.id, pos) }}>
                        <Trash2 className="size-3" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-xs text-muted-foreground italic">Empty</span>
                      <Button variant="ghost" className="h-6 w-6 shrink-0 rounded-md" title="Put the current preset here"
                        onClick={() => { const added = store.putAt(selectedCollection!.id, pos, current); if (added) onMark(added.id) }}>
                        <Save className="size-3" /></Button>
                    </>
                  )}
                </div>
              ))}
              {!bankRows.length && <div className="text-center p-8 text-sm text-muted-foreground">No presets found.</div>}
            </div>
          </div>
        ) : (
          <div className="flex-1 -mx-2 px-2 overflow-y-auto">
            <div className="space-y-0.5 pb-4">
              {visible.map((e, i) => (
                <HoverCard.Root key={e.id} openDelay={250} closeDelay={150} open={hover === e.id}
                  onOpenChange={(o) => { if (o) flash(e.id); else if (hover === e.id) setHover(null) }}>
                  <HoverCard.Trigger asChild>
                    <div id={`library-row-${i}`} tabIndex={-1}
                      className={cx('flex items-center gap-1 rounded px-1 py-0.5 border transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        e.id === activeId ? 'bg-primary/15 border-primary/30' : 'border-transparent hover:bg-accent/50 hover:border-border')}>
                      {renaming?.id === e.id ? (
                        <input autoFocus value={renaming.name} maxLength={32}
                          className="h-7 py-0 px-2 text-xs flex-1 min-w-0 rounded-md border border-border bg-rail outline-none focus:border-primary"
                          onChange={(ev) => setRenaming({ id: e.id, name: ev.target.value })}
                          onBlur={() => finishRename(true)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') finishRename(true)
                            else if (ev.key === 'Escape') finishRename(false)
                          }} />
                      ) : (
                        <button className="flex-1 min-w-0 text-left" onClick={() => onLoad(e.preset, e.id)}
                          onDoubleClick={() => setRenaming({ id: e.id, name: e.preset.name })} title="Double click to rename">
                          <div className={cx('truncate text-xs font-medium', e.id === activeId && 'text-primary')}>{e.preset.name}</div>
                          {selected === null && <div className="truncate text-[10px] text-muted-foreground">{subtitleFor(e)}</div>}
                        </button>
                      )}
                      <Button variant="ghost" title="Overwrite with current settings"
                        className={cx('h-6 w-6 shrink-0 rounded-md', e.id === activeId && !samePreset(current, e.preset) && 'text-primary')}
                        onClick={() => {
                          if (confirm(`Overwrite "${e.preset.name}" in the library with the current settings?`)) {
                            store.update(e.id, current)
                            onMark(e.id)
                          }
                        }}><Save className="size-3" /></Button>
                      <Button variant="ghost" className="h-6 w-6 shrink-0 rounded-md" title="Export as .fuse file"
                        onClick={() => exportFuse(e.preset)}><Download className="size-3" /></Button>
                      <Button variant="ghost" className="h-6 w-6 shrink-0 rounded-md hover:text-destructive" title="Delete from library"
                        onClick={() => { if (confirm(`Delete "${e.preset.name}" from the library?`)) store.remove(e.id) }}><Trash2 className="size-3" /></Button>
                    </div>
                  </HoverCard.Trigger>
                  <HoverCard.Portal>
                    <HoverCard.Content side="left" align="start" sideOffset={8}
                      className="w-[450px] max-w-[90vw] p-0 shadow-2xl z-[100] overflow-hidden border-2 border-primary/40 rounded-xl bg-card text-foreground">
                      <PresetDetails preset={e.preset} />
                    </HoverCard.Content>
                  </HoverCard.Portal>
                </HoverCard.Root>
              ))}
              {visible.length < results.length && (
                <div ref={more} className="h-10 flex items-center justify-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
              )}
              {results.length === 0 && (entries.length > 0 || query) && (
                <div className="text-center p-8 text-sm text-muted-foreground">No presets found.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
