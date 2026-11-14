import * as Dialog from '@radix-ui/react-dialog'
import * as HoverCard from '@radix-ui/react-hover-card'
import { Activity, ChevronLeft, ChevronRight, ChevronsRight, ClipboardCopy, ListFilter, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogEntry } from '../amp/trafficLog'
import {
  describeEntry, directionLabel, matchOffsets, matchSearch, packetType, parseHex, parseOffsets,
  type PacketDescription, type PacketField,
} from '../protocol/describe'
import { Button, cx } from './ui'

const DIRECTIONS: LogEntry['dir'][] = ['tx', 'rx', 'info', 'error']
const SEARCH_SCOPES = [
  { key: 'both', label: 'all' },
  { key: 'text', label: 'raw text' },
  { key: 'decoded', label: 'decoded' },
] as const

const timeStamp = (at: number) => {
  const d = new Date(at)
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

const hexText = (p: Uint8Array) => Array.from(p, (b) => b.toString(16).padStart(2, '0')).join(' ')

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cx(
        'rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors',
        active ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 bg-rail text-muted-foreground hover:text-foreground',
      )}>
      {children}
    </button>
  )
}

const fieldKey = (f: PacketField, i: number) => `${f.offset}-${f.name}-${i}`

export function PacketDetails({
  entry, titleDesc, onPrev, onNext, hasPrev, hasNext,
}: {
  entry: LogEntry
  titleDesc?: boolean
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}) {
  const [pinned, setPinned] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const packet = useMemo(() => entry.packet || parseHex(entry.text), [entry])
  const desc = useMemo(() => (packet ? describeEntry({ ...entry, packet }) : null), [entry, packet])
  useEffect(() => {
    setPinned(null)
    setHovered(null)
  }, [entry])

  const byteField = useMemo(() => {
    const m = new Map<number, string>()
    desc?.fields.forEach((f, i) => f.bytes?.forEach((b) => !m.has(b) && m.set(b, fieldKey(f, i))))
    return m
  }, [desc])
  const byKey = useMemo(() => {
    const m = new Map<string, PacketField>()
    desc?.fields.forEach((f, i) => m.set(fieldKey(f, i), f))
    return m
  }, [desc])
  const current = hovered ?? pinned
  const currentBytes = useMemo(() => new Set(current ? (byKey.get(current)?.bytes ?? []) : []), [current, byKey])
  const hoveredField = hovered ? byKey.get(hovered) : undefined
  const firstByte = useMemo(() => (currentBytes.size ? Math.min(...currentBytes) : null), [currentBytes])
  const scrollRef = (b: number) => (el: HTMLElement | null) => {
    if (el && b === firstByte && !pinned) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }

  return (
    <div className="flex flex-col max-h-[85vh] overflow-y-auto w-full p-4">
      {titleDesc && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="font-mono text-sm uppercase tracking-wider font-semibold">{desc?.title ?? 'Packet details'}</h2>
            <p className="text-sm text-muted-foreground">{desc?.summary ?? "This log line carries no raw packet bytes — it's a status message."}</p>
          </div>
          {onPrev && onNext && (
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="secondary" className="h-7 w-7 rounded-md" onClick={onPrev} disabled={!hasPrev} title="Previous packet"><ChevronLeft /></Button>
              <Button variant="secondary" className="h-7 w-7 rounded-md" onClick={onNext} disabled={!hasNext} title="Next packet"><ChevronRight /></Button>
            </div>
          )}
        </div>
      )}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
          <span className="rounded border border-border/60 bg-rail px-1.5 py-0.5 font-mono">{entry.dir}</span>
          <span className="rounded border border-border/60 bg-rail px-1.5 py-0.5 font-mono">{directionLabel(entry.dir)}</span>
          <span className="rounded border border-border/60 bg-rail px-1.5 py-0.5 font-mono">{packetType(entry)}</span>
          <span className="rounded border border-border/60 bg-rail px-1.5 py-0.5 font-mono">{timeStamp(entry.at)}</span>
        </div>
        {desc && (
          <div className="overflow-hidden rounded border border-border/60">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-rail text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-2 py-1">Offset</th><th className="px-2 py-1">Field</th><th className="px-2 py-1">Raw</th><th className="px-2 py-1">Value</th></tr>
              </thead>
              <tbody>
                {desc.fields.map((f, i) => {
                  const key = fieldKey(f, i)
                  const clickable = !!(packet && f.bytes?.length)
                  return (
                    <tr key={key}
                      onClick={() => clickable && setPinned(pinned === key ? null : key)}
                      onMouseEnter={() => clickable && setHovered(key)}
                      onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                      className={cx('border-t border-border/40 transition-colors',
                        clickable && 'cursor-pointer hover:bg-primary/10',
                        (pinned === key || hovered === key) && 'bg-primary/15')}>
                      <td className="px-2 py-1 text-muted-foreground">{f.offset}</td>
                      <td className="px-2 py-1">{f.name}</td>
                      <td className="px-2 py-1 text-muted-foreground">{f.raw}</td>
                      <td className="px-2 py-1 text-primary">{f.value}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-label text-muted-foreground">{packet ? 'Raw bytes' : 'Log text'}</div>
            {packet && (
              <Button variant="ghost" className="h-5 w-5 rounded-md text-muted-foreground hover:text-foreground"
                title="Copy bytes"
                onClick={() => void navigator.clipboard.writeText(hexText(packet).toUpperCase())}>
                <ClipboardCopy className="size-3.5" />
              </Button>
            )}
          </div>
          {packet ? (
            <div className="overflow-x-auto rounded bg-rail p-2 font-mono text-[11px] leading-5 text-foreground/70">
              {Array.from({ length: Math.ceil(packet.length / 16) }, (_, row) => (
                <div key={row} className="flex gap-1 whitespace-pre">
                  <span className="mr-1 text-muted-foreground">{(row * 16).toString(16).padStart(2, '0').toUpperCase()}</span>
                  {Array.from({ length: 16 }, (_, col) => {
                    const b = row * 16 + col
                    if (b >= packet.length) return null
                    const key = byteField.get(b)
                    return (
                      <span key={b} ref={currentBytes.has(b) ? scrollRef(b) : undefined}
                        onMouseEnter={() => key && setHovered(key)}
                        onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                        onClick={() => key && setPinned((p) => (p === key ? null : key))}
                        className={cx('rounded px-0.5 transition-colors', key && 'cursor-pointer', currentBytes.has(b) && 'bg-primary/30 text-primary')}>
                        {packet[b].toString(16).padStart(2, '0').toUpperCase()}
                      </span>
                    )
                  })}
                </div>
              ))}
              <div className="mt-2 border-t border-border/40 pt-2 text-[10px]">
                {hoveredField ? (
                  <span>
                    <span className="text-muted-foreground">{hoveredField.offset}</span>{' '}
                    <span className="text-foreground">{hoveredField.name}</span>{' '}
                    <span className="text-muted-foreground">{hoveredField.raw}</span>{' '}
                    <span className="text-primary">= {hoveredField.value}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Hover a byte to see the protocol field it belongs to.</span>
                )}
              </div>
            </div>
          ) : (
            <pre className="overflow-x-auto rounded bg-rail p-2 font-mono text-[11px] text-foreground/70">{entry.text}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

export function TrafficLog({ log, onClear, onClose, onCollapse }: {
  log: LogEntry[]
  onClear: () => void
  onClose?: () => void
  onCollapse?: () => void
}) {
  const [dirs, setDirs] = useState<Set<string>>(new Set())
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<(typeof SEARCH_SCOPES)[number]['key']>('both')
  const [offsets, setOffsets] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState<LogEntry | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log.length])

  const toggle = (set: Set<string>, apply: (s: Set<string>) => void, v: string) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    apply(next)
  }

  const offsetSet = useMemo(() => parseOffsets(offsets), [offsets])
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    const out: { entry: LogEntry; hint: PacketField | null }[] = []
    for (const entry of log) {
      if (dirs.size && !dirs.has(entry.dir)) continue
      if (types.size && !types.has(packetType(entry))) continue
      let hint: PacketField | null = null
      let desc: PacketDescription | null = null
      if (offsetSet.size || (term !== '' && scope !== 'text')) desc = describeEntry(entry)
      if (offsetSet.size) {
        hint = matchOffsets(desc, offsetSet)
        if (!hint) continue
      }
      if (term) {
        const inText = scope !== 'decoded' && entry.text.toLowerCase().includes(term)
        const inDecoded = scope === 'text' ? null : matchSearch(desc, term)
        if (!inText && !inDecoded) continue
        if (!hint && inDecoded && inDecoded !== 'packet') hint = inDecoded
      }
      out.push({ entry, hint })
    }
    return out
  }, [log, dirs, types, search, scope, offsetSet])
  const activeFilters = dirs.size + types.size + (search.trim() ? 1 : 0) + (offsets.trim() ? 1 : 0)

  const selIndex = useMemo(() => (selected ? shown.findIndex((s) => s.entry.id === selected.id) : -1), [selected, shown])
  const hasPrev = selIndex > 0
  const hasNext = selIndex !== -1 && selIndex < shown.length - 1
  const prev = () => hasPrev && setSelected(shown[selIndex - 1].entry)
  const next = () => hasNext && setSelected(shown[selIndex + 1].entry)

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (hasPrev) { e.preventDefault(); prev() }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (hasNext) { e.preventDefault(); next() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section className="panel-surface p-4 flex flex-col h-full min-h-0">
      <div className="text-label mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5" /> Log
          <span className="font-mono text-[10px] text-muted-foreground">{shown.length}/{log.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setFiltersOpen((o) => !o)}
            className="h-6 px-2 text-[10px] uppercase tracking-wider gap-1">
            <ListFilter className="size-3" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
          <Button variant="ghost" onClick={onClear} className="h-6 px-2 text-[10px] uppercase tracking-wider">Clear</Button>
          {onCollapse && (
            <Button variant="ghost" className="h-6 w-6 rounded-md" aria-label="Collapse traffic log" onClick={onCollapse}><ChevronsRight /></Button>
          )}
          {onClose && (
            <Button variant="ghost" className="h-6 w-6 rounded-md" aria-label="Close traffic log" onClick={onClose}><X /></Button>
          )}
        </div>
      </div>
      {filtersOpen && (
        <div className="mb-3 space-y-2 rounded bg-rail p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-label w-16 shrink-0 text-muted-foreground">Direction</span>
            {DIRECTIONS.map((d) => <Chip key={d} active={dirs.has(d)} onClick={() => toggle(dirs, setDirs, d)}>{d}</Chip>)}
          </div>
          {types.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-label w-16 shrink-0 text-muted-foreground">Type</span>
              {Array.from(types).map((t) => <Chip key={t} active onClick={() => toggle(types, setTypes, t)}>{t}</Chip>)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-label w-16 shrink-0 text-muted-foreground">Search in</span>
            {SEARCH_SCOPES.map((s) => <Chip key={s.key} active={scope === s.key} onClick={() => setScope(s.key)}>{s.label}</Chip>)}
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search text, hex, or decoded field / value…"
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
            {activeFilters > 0 && (
              <Button variant="ghost" className="h-7 px-2 text-[10px] uppercase tracking-wider"
                onClick={() => { setDirs(new Set()); setTypes(new Set()); setSearch(''); setOffsets(''); setScope('both') }}>
                Reset
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input value={offsets} onChange={(e) => setOffsets(e.target.value)}
              placeholder="Offsets: 32, 0x20, 36-38"
              className="h-7 w-full rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:border-primary" />
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-0.5">
          {shown.length === 0 && (
            <p className="text-xs text-muted-foreground">{log.length === 0 ? 'No USB traffic yet.' : 'No packets match the current filters.'}</p>
          )}
          {shown.map(({ entry, hint }) => (
            <HoverCard.Root key={entry.id} openDelay={100} closeDelay={50}>
              <HoverCard.Trigger asChild>
                <button type="button" onClick={() => setSelected(entry)}
                  className="block w-full cursor-pointer rounded px-1 text-left transition-colors hover:bg-primary/10">
                  <div className="text-readout whitespace-pre font-mono text-[11px]">
                    <span className="mr-2 text-muted-foreground opacity-60">{timeStamp(entry.at)}</span>
                    <span className="text-label mr-2">{entry.dir}</span>
                    <span className="mr-2 text-[10px] text-muted-foreground">{packetType(entry)}</span>
                    {hint && (
                      <span className="mr-2 rounded bg-primary/15 px-1 text-[10px] text-primary">
                        {hint.offset} {hint.name} = {hint.value}
                      </span>
                    )}
                    <span className={entry.dir === 'error' ? 'text-destructive' : 'text-foreground/70'}>
                      {entry.text || (entry.packet ? hexText(entry.packet) : '')}
                    </span>
                  </div>
                </button>
              </HoverCard.Trigger>
              <HoverCard.Portal>
                <HoverCard.Content side="left" align="start"
                  className="w-[32rem] p-0 shadow-2xl z-[100] overflow-hidden border-2 border-primary/40 rounded-xl">
                  <div className="bg-secondary/95 backdrop-blur-xl">
                    <PacketDetails entry={entry} titleDesc />
                  </div>
                </HoverCard.Content>
              </HoverCard.Portal>
            </HoverCard.Root>
          ))}
          <div ref={bottom} />
        </div>
      </div>
      <Dialog.Root open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <Dialog.Portal>
          <Dialog.Content
            className="fixed right-0 top-0 z-50 h-full w-full sm:max-w-lg overflow-y-auto border-l border-border bg-card p-0 pt-10 shadow-2xl outline-none">
            <Dialog.Title className="sr-only">Packet details</Dialog.Title>
            {selected && <PacketDetails entry={selected} titleDesc onPrev={prev} onNext={next} hasPrev={hasPrev} hasNext={hasNext} />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
