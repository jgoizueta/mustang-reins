import { EffectPanel } from './components/EffectPanel'
import { SignalPath } from './components/SignalPath'
import { LibraryPanel } from './components/LibraryPanel'
import { TunerOverlay } from './components/TunerOverlay'
import { PwaStatus } from './components/PwaStatus'
import { DiagnosticsCard } from './components/DiagnosticsCard'
import { AssistantPanel } from './components/AssistantPanel'
import { TrafficLog } from './components/TrafficLog'
import { trafficLog, useTrafficLog } from './amp/trafficLog'
import { isSimulator } from './amp/useAmp'
import { probeDevice, webHidSupported, type DeviceProbe } from './transport/webhid'
import * as HoverCard from '@radix-ui/react-hover-card'
import { type MidiActions } from './midi/map'
import { useMidi } from './midi/useMidi'
import { midiLearn, routeMidi, sameTarget, targetLabel, useMidiMappings, type MidiTarget } from './midi/learn'
import { Learnable } from './components/Learnable'
import { MidiLearnContext } from './components/learnContext'
import { exportFuse } from './fuse/fuse'
import { clonePreset, FAMILIES } from './protocol/preset'
import { hasDigitalMaster } from './protocol/packets'
import { HelpDialog } from './components/HelpDialog'
import { CircleHelp, ChevronsLeft, ChevronsRight, Download, GraduationCap, Library, Loader2, Plug, Radio, Save, Send, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Knob } from './components/Knob'
import { Button, Select, Slider, Switch, cx } from './components/ui'
import { useAmp } from './amp/useAmp'
import { CABINETS, NOISE_GATE, SAG } from './data/amps'
import { AmpSelect } from './components/AmpSelect'
import { BANKS, bankPositionLabel, LETTERS, slotLabel } from './data/slots'
import { useLibrary } from './library/store'
import type { AMP_KNOB_IDS } from './protocol/decode'

export default function App() {
  const [bank, setBank] = useState<string>('all')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(() => location.hash === '#help')
  const [logOpen, setLogOpen] = useState(false)
  const [logCollapsed, setLogCollapsed] = useState(false)
  const [learnActive, setLearnActive] = useState(false)
  const [armed, setArmed] = useState<MidiTarget | null>(null)
  const mappings = useMidiMappings()
  const [probe, setProbe] = useState<DeviceProbe | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const entries = useTrafficLog()
  const { session, state } = useAmp()
  const { preset, link } = state
  const midiActions: MidiActions = {
    loadSlot: (i) => void session.selectSlot(i),
    setTuner: (on) => void session.setTuner(on),
    toggleEffect: (f, on) => void session.toggleEffect(f, on),
    setEffectModel: (f, m) => void session.setEffectModel(f, m),
    setEffectKnob: (f, i, v) => void session.setEffectKnob(f, i, v),
    updateAmp: (p) => void session.updateAmp(p),
    setUsbGain: (v) => void session.setUsbGain(v),
    setBright: (on) => void session.setAmp({ brightness: on ? 1 : 0 }),
    note: (t) => session.note(t),
  }
  const onMidi = (status: number, d1: number, d2: number) => routeMidi(status, d1, d2, {
    learn: { active: learnActive, armed },
    mappings,
    actions: midiActions,
    ctx: { preset, activeSlot: state.activeSlot, slotCount: state.device.presetCount },
    onAssign: (channel, cc, target) => { midiLearn.assign(channel, cc, target); setArmed(null) },
  })
  const midi = useMidi(onMidi)
  // For testing without a controller: __mustangMidi(0xc0, 5) sends program change 5, __mustangMidi(0xb0, 20, 127) controller 20.
  const midiTest = useRef(onMidi)
  useEffect(() => {
    midiTest.current = onMidi
    ;(window as unknown as { __mustangMidi: (s: number, d1: number, d2?: number) => void }).__mustangMidi =
      (s, d1, d2 = 0) => midiTest.current(s, d1, d2)
  })
  const amp = preset.amp
  const connected = link === 'connected'
  const arm = (t: MidiTarget) => setArmed((a) => (a && sameTarget(a, t) ? null : t))
  const learnCtx = {
    active: learnActive,
    armed,
    onArm: arm,
    mappingFor: (t: MidiTarget) => mappings.find((m) => sameTarget(m.target, t)),
  }
  // While learn is on: Esc disarms (or leaves learn), Delete/Backspace removes the armed mapping.
  useEffect(() => {
    if (!learnActive) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        if (armed) setArmed(null)
        else setLearnActive(false)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && armed) {
        midiLearn.remove(armed)
        setArmed(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [learnActive, armed])
  const refreshProbe = () => {
    if (isSimulator()) {
      setProbe({
        at: Date.now(), transport: 'Simulated', present: true, opened: link === 'connected',
        vendorId: null, productId: null, model: state.device.name, strings: {}, interfaces: [],
        notes: ['Simulated amp (?sim): there is no USB device.'],
      })
      return
    }
    setProbeBusy(true)
    void probeDevice().then(setProbe).finally(() => setProbeBusy(false))
  }
  // Refresh the diagnostics probe when the card opens and when the link changes.
  const [cardOpen, setCardOpen] = useState(false)
  useEffect(() => {
    if (cardOpen) refreshProbe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardOpen, link])
  // The tuner covers the screen; the editor behind it stays visible but cannot be used.
  const dim = state.tuner.active && 'opacity-20 pointer-events-none grayscale'
  const digitalMaster = hasDigitalMaster(state.device)
  const lib = useLibrary()
  const librarySource = (() => {
    if (!state.libraryId) return null
    const e = lib.entries.find((x) => x.id === state.libraryId)
    const c = e && lib.collections.find((x) => x.id === e.collectionId)
    if (!e || !c) return 'From the Library'
    const pos = c.bank && e.position !== undefined ? ` · ${bankPositionLabel(c.bank.size, e.position)}` : ''
    return `From the Library · ${c.name}${pos}`
  })()
  const source = state.activeSlot !== null
    ? `From amp slot ${slotLabel(state.activeSlot)}${state.dirty ? ' · changed, not saved to the slot' : ''}`
    : librarySource
  const knob = (k: (typeof AMP_KNOB_IDS)[number]) => (v: number) => void session.setAmpKnob(k, v)
  const setAmp = (patch: Partial<typeof amp>) => void session.setAmp(patch)
  const saveSlot = (i: number) => {
    const old = state.presetNames[i] ?? `Preset ${i + 1}`
    if (confirm(`Overwrite amp slot ${i + 1} ("${old}") with "${preset.name || 'Untitled'}"?`)) void session.saveToSlot(i)
  }

  return (
    <MidiLearnContext.Provider value={learnCtx}>
    <div className="h-screen flex flex-col overflow-hidden">
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <PwaStatus />
      {state.tuner.active && <TunerOverlay tuner={state.tuner} onClose={() => void session.setTuner(false)} />}
      <header className="shrink-0 sticky top-0 z-20 border-b border-border bg-rail backdrop-blur">
        <div className="mx-auto flex w-full max-w-full items-center gap-4 px-6 py-3 overflow-x-auto">
          <div className="flex items-center gap-3 shrink-0">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="App icon" className="h-14 w-14 -my-2.5" />
            <div>
              <h1 className="text-sm font-bold tracking-[0.2em] uppercase">Mustang Reins</h1>
              <HoverCard.Root open={cardOpen} onOpenChange={setCardOpen}>
                <HoverCard.Trigger asChild>
                  <button type="button" className="text-[11px] text-left text-muted-foreground cursor-pointer w-fit hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                    {state.device.name}
                  </button>
                </HoverCard.Trigger>
                <HoverCard.Portal>
                  <HoverCard.Content side="bottom" align="start" className="p-0 border-0 bg-transparent text-foreground shadow-xl w-[400px] z-50">
                    <DiagnosticsCard
                      probe={probe} busy={probeBusy} onRefresh={refreshProbe}
                      transportKind={isSimulator() ? 'Simulated' : webHidSupported() ? 'WebHID' : 'OFFLINE'}
                      link={link} error={state.error}
                      trafficLog={logOpen} setTrafficLog={setLogOpen}
                      autoReconnect={state.autoReconnect} setAutoReconnect={(v) => session.setAutoReconnect(v)}
                      liveSync={state.liveSync} setLiveSync={(v) => session.setLiveSync(v)}
                      midiEnabled={midi.enabled}
                      midiActiveInputName={midi.inputs.find((i) => i.id === midi.activeId)?.name ?? null}
                      midiInputsCount={midi.inputs.length}
                      midiError={midi.error} />
                  </HoverCard.Content>
                </HoverCard.Portal>
              </HoverCard.Root>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <label className="flex items-center gap-2 text-label" title="Enable MIDI Control">
              MIDI<Switch checked={midi.enabled} onCheckedChange={midi.setEnabled} />
            </label>
            {midi.enabled && (midi.error ? (
              <div className="max-w-[200px] text-[10px] text-destructive" title={midi.error}>{midi.error}</div>
            ) : (
              <Select compact className="min-w-[140px] max-w-[200px]" value={midi.activeId ?? ''} onChange={midi.select}
                disabled={midi.inputs.length === 0}
                placeholder={midi.inputs.length === 0 ? 'No devices' : 'Select MIDI Device'}
                options={midi.inputs.map((i) => ({ value: i.id, label: i.name }))} />
            ))}
            {midi.enabled && (
              <Button className={cx('h-8 rounded-md text-xs px-2 min-[1250px]:px-3', learnActive && 'ring-1 ring-primary/60')}
                title="MIDI Learn" aria-pressed={learnActive}
                onClick={() => { setLearnActive((on) => !on); setArmed(null) }}>
                <GraduationCap className="size-4 min-[1250px]:mr-2" /><span className="hidden min-[1250px]:inline">Learn</span>
              </Button>
            )}
            <Button variant="ghost" className="h-8 w-8 rounded-md" title="Help" onClick={() => setHelpOpen(true)}><CircleHelp /></Button>
            <Button className={cx('h-8 rounded-md text-xs px-2 min-[1250px]:px-3', assistantOpen && 'ring-1 ring-primary/60')} title="Tone AI"
              aria-pressed={assistantOpen} onClick={() => setAssistantOpen((o) => !o)}><Sparkles className="size-4 min-[1250px]:mr-2" /><span className="hidden min-[1250px]:inline">Tone AI</span></Button>
            <Button className={cx('h-8 rounded-md text-xs px-2 min-[1250px]:px-3', libraryOpen && 'ring-1 ring-primary/60')} title="Open Library"
              aria-pressed={libraryOpen} onClick={() => setLibraryOpen((o) => !o)}><Library className="size-4 min-[1250px]:mr-2" /><span className="hidden min-[1250px]:inline">Library</span></Button>
            <Learnable target={{ kind: 'tuner' }}>
            <Button variant={state.tuner.active ? 'destructive' : 'secondary'} disabled={!connected}
              className={cx('h-8 rounded-md text-xs px-2 min-[1250px]:px-3 gap-2', state.tuner.active && 'animate-pulse')}
              title={connected ? 'Tune with the amp\'s built-in tuner' : 'Connect the amp to use the tuner'}
              onClick={() => void session.setTuner(!state.tuner.active)}><Radio className="size-4" /><span className="hidden min-[1250px]:inline">Tuner</span></Button>
            </Learnable>
            <Button variant="primary" className="h-8 rounded-md text-xs px-2 min-[1250px]:px-3 gap-2"
              disabled={link === 'connecting'}
              title={connected ? 'Disconnect amp' : state.error ?? 'No amp connected'}
              onClick={() => void (connected || link === 'reconnecting' ? session.disconnect() : session.connect())}>
              <span className="h-2 w-2 rounded-full shrink-0"
                style={{ background: connected ? 'var(--online)' : link === 'connecting' || link === 'reconnecting' ? 'var(--warning)' : 'var(--offline)' }} />
              <span className="hidden min-[1250px]:inline">{connected ? 'Connected' : link === 'connecting' ? 'Connecting…' : link === 'reconnecting' ? 'Reconnecting…' : 'Connect amp'}</span><Plug className="size-4 opacity-50" />
            </Button>
          </div>
        </div>
        {link === 'reconnecting' ? (
          <p className="flex items-center gap-2 border-t border-border bg-warning/10 px-6 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />Amp went away — reconnecting automatically. Your edits are kept and pushed back once the cable is in.
          </p>
        ) : state.error ? (
          <p className="border-t border-border bg-destructive/10 px-6 py-1.5 text-xs text-destructive">{state.error}</p>
        ) : null}
        {learnActive && (
          <div className="flex items-center gap-3 border-t border-border bg-primary/10 px-6 py-1.5 text-xs text-muted-foreground">
            <span>
              MIDI Learn: click a control, then move a knob or press a button on your controller.
              Esc cancels the selection. Delete removes the mapping of the selected control.
            </span>
            {([-1, 1] as const).map((step) => {
              const t: MidiTarget = { kind: 'slotStep', step }
              const m = learnCtx.mappingFor(t)
              const isArmed = armed !== null && sameTarget(armed, t)
              return (
                <button key={step} type="button" onClick={() => arm(t)} title={targetLabel(t)}
                  className={cx('rounded px-2 py-0.5 text-[11px] font-medium ring-1 transition-colors',
                    isArmed ? 'ring-primary bg-primary/20 animate-pulse' : 'ring-border hover:bg-background/50')}>
                  {targetLabel(t)}{m ? ` · CC ${m.cc}${m.channel !== 1 ? ` ch ${m.channel}` : ''}` : ''}
                </button>
              )
            })}
            <button type="button" className="ml-auto rounded px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10"
              onClick={() => { if (confirm('Remove all learned MIDI mappings?')) midiLearn.clear() }}>
              Clear all
            </button>
            <Button variant="ghost" className="h-7 rounded-md text-xs px-2"
              onClick={() => { setLearnActive(false); setArmed(null) }}>Done</Button>
          </div>
        )}
      </header>

      <main className="mx-auto grid w-full max-w-full gap-5 px-6 py-6 flex-1 min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: `${sidebarCollapsed ? '40px' : '300px'} 1fr ${logOpen ? (logCollapsed ? '40px' : '350px') : ''} ${libraryOpen ? '350px' : ''} ${assistantOpen ? '350px' : ''}`.trim() }}>
        {sidebarCollapsed ? (
          <aside className={cx('flex flex-col items-center border-r border-border bg-rail/50 pt-4 h-full rounded-md', dim)}>
            <Button variant="ghost" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
              title="Expand Sidebar" onClick={() => setSidebarCollapsed(false)}><ChevronsRight /></Button>
          </aside>
        ) : (
        <aside className={cx('space-y-5 flex flex-col h-full min-h-0 overflow-y-auto -mr-2 pr-2', dim)}>
          <section className="panel-surface p-4 flex flex-col shrink-0">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-label">Active Preset</div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" className="h-7 w-7 rounded-md" title="Collapse Sidebar" onClick={() => setSidebarCollapsed(true)}><ChevronsLeft /></Button>
                  <Button variant="ghost" disabled={!connected || (state.liveSync && !state.dirty)} onClick={() => void session.pushPreset()} className="h-7 w-7 rounded-md" title="Send full preset to amp"><Send /></Button>
                  <Button variant="ghost" className="h-7 w-7 rounded-md" title="Export as .fuse file" onClick={() => exportFuse(preset)}><Download /></Button>
                </div>
              </div>
              <div className="mt-1">
                <input value={preset.name} maxLength={32} onChange={(e) => session.setName(e.target.value)} title="Click to rename"
                  className={cx('block w-full bg-transparent text-xl font-black tracking-tight truncate py-1 border-b border-border/50 hover:border-primary/50 focus:border-primary outline-none transition-colors',
                    !preset.name && 'h-[9px] py-0 focus:h-9')} />
              </div>
              {source && <div className="mt-2 text-[11px] text-muted-foreground">{source}</div>}
            </div>
          </section>
          <section className="panel-surface p-4 flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="text-label">Amp Slots</div>
              <div className="flex bg-rail rounded p-0.5">
                {[{ key: 'all', label: 'ALL', dot: '' }, ...BANKS].map((b) => (
                  <button key={b.key} onClick={() => setBank(b.key)}
                    className={cx('px-2 text-[10px] py-1 font-bold rounded transition-colors flex items-center justify-center gap-1.5',
                      bank === b.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:bg-card/50')}>
                    {b.dot && <span className={cx('h-2 w-2 rounded-full', b.dot)} />}
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="-mx-2 px-2">
              <div className="space-y-1">
                {Array.from({ length: 24 }, (_, i) => i)
                  .filter((i) => bank === 'all' || BANKS[Math.floor(i / 8)].key === bank)
                  .map((i) => (
                    <div key={i} className="flex items-center rounded transition-colors hover:bg-accent gap-1">
                      <Learnable target={{ kind: 'slot', slot: i }} className="flex flex-1 min-w-0">
                      <button disabled={!connected} onClick={() => void session.selectSlot(i)}
                        className={cx('flex-1 flex items-center justify-between truncate rounded px-2 py-1.5 text-left text-xs disabled:opacity-40',
                          state.activeSlot === i && 'bg-primary/15 text-primary')}>
                        <div className="flex-1 flex items-center min-w-0">
                          <span className="text-readout mr-2 flex items-center gap-1.5 w-10 shrink-0 text-muted-foreground">
                            <span className={cx('h-2 w-2 rounded-full shadow-sm', BANKS[Math.floor(i / 8)].dot)} />{LETTERS[i % 8]}
                          </span>
                          <span className="truncate">{state.presetNames[i] ?? `Preset ${i + 1}`}</span>
                        </div>
                      </button>
                      </Learnable>
                      {state.dirty && connected && (
                        <Button variant="ghost" className={cx('h-7 w-7 shrink-0 rounded-md', state.activeSlot === i ? 'text-primary' : 'opacity-30 hover:opacity-100')}
                          title="Save current preset to this amp slot" onClick={() => saveSlot(i)}>
                          <Save className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </aside>
        )}

        <div className={cx('relative overflow-y-auto h-full -mr-2.5', dim)}>
          <div className="space-y-5 flex flex-col pr-2.5">
            <SignalPath className="h-fit shrink-0" preset={preset}
              onToggleEffect={(f, on) => void session.toggleEffect(f, on)}
              onMoveEffect={(f, pos, slot) => void session.moveEffect(f, pos, slot)}
              onToggleCabinet={() => setAmp({ cabinet: amp.cabinet === 0 ? 1 : 0 })} />

            <div className="shrink-0">
              <section className="panel-surface border-2 border-primary/20 p-5 shadow-sm shadow-primary/5">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="flex flex-col gap-6">
                    <div>
                      <div className="text-label">Amplifier model</div>
                      <AmpSelect model={amp.model} isV2={state.device.isV2} onChange={(v) => setAmp({ model: +v })} />
                    </div>
                    <div className="flex flex-wrap gap-x-7 gap-y-6">
                      {(['volume', 'gain', 'treble', 'middle', 'bass'] as const).map((k) => (
                        <Learnable key={k} target={{ kind: 'amp', key: k }}>
                          <Knob label={k} value={amp[k]} onChange={knob(k)} />
                        </Learnable>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-6">
                    <div>
                      <div className="text-label">Cabinet</div>
                      <Select large plain className="mt-1.5 w-80" value={String(amp.cabinet)} onChange={(v) => setAmp({ cabinet: +v })}
                        options={CABINETS.map((c) => ({ value: String(c.id), label: c.name, hint: c.basedOn || undefined }))} />
                    </div>
                    <div className="flex flex-wrap gap-x-7 gap-y-6">
                      <Learnable target={{ kind: 'amp', key: 'presence' }}>
                        <Knob label="presence" value={amp.presence} onChange={knob('presence')} />
                      </Learnable>
                      <Learnable target={{ kind: 'amp', key: 'masterVolume' }}>
                        <div title={digitalMaster ? undefined : 'This amp sets Master with its own knob.'}>
                          <Knob label="master" value={amp.masterVolume} onChange={knob('masterVolume')} disabled={!digitalMaster} />
                        </div>
                      </Learnable>
                    </div>
                  </div>
                </div>
                <div className="mt-6 border-t border-border pt-5">
                  <div className="text-label mb-4">Advanced</div>
                  <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="flex flex-wrap gap-x-7 gap-y-6">
                      <Learnable target={{ kind: 'amp', key: 'depth' }}>
                        <Knob label="Blend / Depth" value={amp.depth} onChange={(v) => setAmp({ depth: v })} />
                      </Learnable>
                      <Learnable target={{ kind: 'amp', key: 'bias' }}>
                        <Knob label="Bias" value={amp.bias} onChange={(v) => setAmp({ bias: v })} />
                      </Learnable>
                      <Learnable target={{ kind: 'usbGain' }}>
                        <Knob label="USB Gain" value={preset.usbGain} onChange={(v) => void session.setUsbGain(v)} accent="var(--slot-mod)" />
                      </Learnable>
                    </div>
                    <div className="flex flex-col items-start gap-6">
                      <div className="flex justify-start gap-x-7 gap-y-6 w-80">
                        <div className="min-w-36 space-y-2 flex-1">
                          <div className="text-label">Noise Gate · {NOISE_GATE[amp.noiseGate]}</div>
                          <Slider value={amp.noiseGate} max={5} onChange={(v) => setAmp({ noiseGate: v })} />
                        </div>
                        <div className="min-w-36 space-y-2 flex-1">
                          <div className="text-label">Sag · {SAG[amp.sag]}</div>
                          <Slider value={amp.sag} max={2} onChange={(v) => setAmp({ sag: v })} />
                          <div className="flex items-center justify-between pt-3">
                            <span className="text-label">Bright</span>
                            <Learnable target={{ kind: 'bright' }}>
                              <Switch checked={amp.brightness !== 0} onCheckedChange={(v) => setAmp({ brightness: v ? 1 : 0 })} />
                            </Learnable>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className={cx(libraryOpen ? 'effects-grid' : 'grid gap-5 xl:grid-cols-2', 'shrink-0')}>
              {FAMILIES.map((f) => (
                <EffectPanel key={f} family={f} fx={preset.effects[f]} isV2={state.device.isV2}
                  onModel={(m) => void session.setEffectModel(f, m)}
                  onKnob={(i, v) => void session.setEffectKnob(f, i, v)}
                  onToggle={(on) => void session.toggleEffect(f, on)}
                  onMove={(pos, slot) => void session.moveEffect(f, pos, slot)} />
              ))}
            </div>
          </div>
        </div>
        {logOpen && (
          <div className="relative h-full">
            {logCollapsed ? (
              <aside className={cx('absolute inset-0 flex flex-col items-center border-l border-border bg-rail/50 pt-4', dim)}>
                <Button variant="ghost" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
                  title="Expand USB Traffic Log" onClick={() => setLogCollapsed(false)}><ChevronsLeft /></Button>
              </aside>
            ) : (
              <aside className={cx('absolute inset-0 flex flex-col', dim)}>
                <TrafficLog log={entries} onClear={() => trafficLog.clear()}
                  onClose={() => setLogOpen(false)} onCollapse={() => setLogCollapsed(true)} />
              </aside>
            )}
          </div>
        )}
        {libraryOpen && (
          <div className="relative h-full">
            <aside className={cx('absolute inset-0 flex flex-col panel-surface overflow-hidden', dim)}>
              <LibraryPanel onClose={() => setLibraryOpen(false)}
                current={preset} activeId={state.libraryId} onMark={(id) => session.setLibraryId(id)}
                onLoad={(p, id) => void session.loadPreset(clonePreset(p), true, id ?? null)}
                amp={{
                  connected,
                  slotCount: state.device.presetCount,
                  isV2: state.device.isV2,
                  backupSlots: (slots, onProgress, signal) => session.backupSlots(slots, onProgress, signal),
                  restoreSlots: (items, onProgress, signal) => session.restoreSlots(items, onProgress, signal),
                }} />
            </aside>
          </div>
        )}
        {assistantOpen && (
          <div className="relative h-full">
            <aside className={cx('absolute inset-0 flex flex-col panel-surface overflow-hidden', dim)}>
              <AssistantPanel device={state.device} editor={preset} onClose={() => setAssistantOpen(false)}
                onApply={(p) => void session.loadPreset(clonePreset(p), true, null)} />
            </aside>
          </div>
        )}
      </main>
    </div>
    </MidiLearnContext.Provider>
  )
}
