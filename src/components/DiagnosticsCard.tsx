import { Info, Plug, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LinkState } from '../amp/session'
import type { TransportKind } from '../transport/types'
import type { DeviceProbe } from '../transport/webhid'
import { Button, cx, Switch } from './ui'

const APP_VERSION = '0.0.0'

const hex4 = (v: number | null | undefined) => (v == null ? '—' : `0x${v.toString(16).padStart(4, '0')}`)

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1 last:border-0">
      <span className="text-label shrink-0">{label}</span>
      <span className="text-readout truncate text-right text-[11px] font-mono text-foreground/80">{value}</span>
    </div>
  )
}

export interface DiagnosticsCardProps {
  probe: DeviceProbe | null
  busy: boolean
  onRefresh: () => void
  transportKind: TransportKind
  link: LinkState
  error: string | null
  trafficLog: boolean
  setTrafficLog: (v: boolean) => void
  autoReconnect: boolean
  setAutoReconnect: (v: boolean) => void
  liveSync: boolean
  setLiveSync: (v: boolean) => void
  midiEnabled: boolean
  midiActiveInputName: string | null
  midiInputsCount: number
  midiError: string | null
}

export function DiagnosticsCard({
  probe, busy, onRefresh, transportKind, link, error,
  trafficLog, setTrafficLog, autoReconnect, setAutoReconnect, liveSync, setLiveSync,
  midiEnabled, midiActiveInputName, midiInputsCount, midiError,
}: DiagnosticsCardProps) {
  const strings = Object.entries(probe?.strings ?? {})
  return (
    <section className="panel-surface p-4">
      <div className="text-label mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2"><Info className="size-3.5" /> Connection diagnostics</div>
        <Button variant="ghost" onClick={onRefresh} disabled={busy}
          className="h-6 px-2 text-[10px] uppercase tracking-wider gap-1">
          <RefreshCw className={cx('size-3', busy && 'animate-spin')} /> Probe
        </Button>
      </div>
      <div className="max-h-[600px] overflow-y-auto pr-2">
        <div className="grid gap-4">
          <div>
            <div className="text-label mb-1 text-muted-foreground">Link</div>
            <Row label="App Version" value={APP_VERSION} />
            <Row label="Transport" value={transportKind} />
            <Row label="State" value={link} />
            <Row label="Device present" value={probe?.present ? 'yes' : 'no'} />
            <Row label="Handle open" value={probe?.opened ? 'yes' : 'no'} />
            <Row label="Vendor ID" value={hex4(probe?.vendorId)} />
            <Row label="Product ID" value={hex4(probe?.productId)} />
            <Row label="Model" value={probe?.model ?? '—'} />
            <Row label="Probed" value={probe ? new Date(probe.at).toLocaleTimeString() : '—'} />
            {error && <Row label="Last error" value={<span className="text-destructive">{error}</span>} />}
            <Row label="MIDI Support" value={midiEnabled ? 'Enabled' : 'Disabled'} />
            {midiEnabled && (
              <>
                <Row label="MIDI Active Input" value={midiActiveInputName ?? 'None'} />
                <Row label="MIDI Device Count" value={String(midiInputsCount)} />
              </>
            )}
            {midiError && <Row label="MIDI Error" value={<span className="text-destructive">{midiError}</span>} />}
          </div>
          <div>
            <div className="text-label mb-1 text-muted-foreground">Device strings</div>
            {strings.length === 0 ? (
              <p className="text-xs text-muted-foreground">No string descriptors available from this transport.</p>
            ) : (
              strings.map(([k, v]) => <Row key={k} label={k} value={v} />)
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-border/50 pt-2 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-label shrink-0" title="Reopen the USB link automatically after an unplug">Auto-reconnect</span>
            <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label shrink-0">Live sync</span>
            <Switch checked={liveSync} onCheckedChange={setLiveSync} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label shrink-0">Traffic Log</span>
            <Switch checked={trafficLog} onCheckedChange={setTrafficLog} />
          </div>
        </div>
        <div className="mt-4 border-t border-border/50 pt-4">
          <div className="text-label mb-1 text-muted-foreground">Interfaces &amp; endpoints</div>
          {!probe || probe.interfaces.length === 0 ? (
            <p className="text-xs text-muted-foreground">No interface descriptors — connect the amp, then probe again.</p>
          ) : (
            <div className="space-y-2">
              {probe.interfaces.map((i) => (
                <div key={i.number} className="rounded bg-rail p-2">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <Plug className="size-3 text-muted-foreground" />
                    <span className="font-semibold">Interface {i.number}</span>
                    <span className="text-muted-foreground">class {i.class ?? '—'}/{i.protocol ?? '—'}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 pl-5 text-[11px] font-mono text-foreground/70">
                    {i.endpoints.length === 0 ? <div>no endpoints reported</div> : i.endpoints.map((e) => <div key={e}>{e}</div>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {probe && probe.notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {probe.notes.map((n) => <li key={n}>• {n}</li>)}
          </ul>
        )}
      </div>
    </section>
  )
}
