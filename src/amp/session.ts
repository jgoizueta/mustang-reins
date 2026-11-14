import { AMP_KNOB_IDS, decode } from '../protocol/decode'
import { packets, type DeviceInfo } from '../protocol/packets'
import {
  encodeAmp, encodeEffect, encodePreset, encodeUsbGain, moveEffect, newPreset, parsePresetNames,
  parseAmp, parseEffect, parseStateBlock, rememberEffects, withEffectKnob, withEffectModel, type Preset,
} from '../protocol/preset'
import type { EffectFamily, EffectSettings, AmpSettings } from '../protocol/packets'
import { ampById } from '../data/amps'
import { effectById } from '../data/effects'
import { slotLabel } from '../data/slots'
import { OFFLINE_DEVICE, type Transport } from '../transport/types'

export type LinkState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface SessionSnapshot {
  link: LinkState
  device: DeviceInfo
  error: string | null
  presetNames: string[]
  activeSlot: number | null
  loadingSlot: number | null
  preset: Preset
  /** True when the editor holds changes that the amp does not (a preset loaded from a file, say). */
  dirty: boolean
  /** The Local Library entry the editor preset came from, if any. */
  libraryId: string | null
  /** Editor edits go to the amp at once, and its live reports reach the editor. */
  liveSync: boolean
  /** Reopen the USB link automatically after an unplug. */
  autoReconnect: boolean
  /** `note` counts semitones from A. `reading` is false until the amp reports a pitch. */
  tuner: { active: boolean; note: number; cents: number; reading: boolean }
}

export interface SessionOptions {
  createTransport: () => Transport
  /** Presence check used to notice a lost cable and to know when to retry. */
  devicePresent?: () => Promise<boolean>
  watchDevice?: (cb: (e: 'attach' | 'detach') => void) => () => void
  autoReconnect?: boolean
  pollMs?: number
  /** Wait for a packet during dumps and slot loads. */
  receiveMs?: number
  /** Editor contents to start with, such as the work saved from the last visit. */
  initialPreset?: Preset
  /** Called for every packet sent or received, for diagnostics. */
  debug?: (dir: 'tx' | 'rx' | 'note' | 'error', data: Uint8Array | string) => void
  /** Start with live sync off: edits stay in the editor and amp reports are ignored. */
  liveSync?: boolean
  /** After the amp reports a preset change, wait this long for it to push the new settings before asking with a dump. */
  changeSettleMs?: number
  /** Ignore effect-control reports this soon after we sent something (they may be echoes). */
  echoGuardMs?: number
  /** After the tuner is switched off, readings arriving this long are ignored. */
  tunerIgnoreMs?: number
  /** Wait for the amp to answer each handshake packet. */
  handshakeMs?: number
  /** During a bank write, wait this long for the state block of a selected slot (the `1c 01 00 00 <slot>` trailer). */
  slotLoadTimeoutMs?: number
  /** During a bank write, wait this long for the amp's ack (`00 00 1c …`) after each write packet. */
  ackTimeoutMs?: number
  /** During a bank write, pause this long after the save packet: the amp sends no reply to it but needs a moment to store the slot. */
  saveSettleMs?: number
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The amp answers each `1c 03 …` write packet (preset fields and apply) with this report; the save gets none. */
const isWriteAck = (p: Uint8Array) => p[0] === 0 && p[1] === 0 && p[2] === 0x1c

export class AmpSession {
  private snap: SessionSnapshot = {
    link: 'disconnected', device: OFFLINE_DEVICE, error: null, presetNames: [], activeSlot: null,
    loadingSlot: null, preset: newPreset(''), dirty: false, libraryId: null,
    liveSync: true, autoReconnect: true,
    tuner: { active: false, note: 0, cents: 0, reading: false },
  }
  private listeners = new Set<() => void>()
  private transport: Transport | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private busy = false
  private manualDisconnect = false
  private attempts = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private unwatch: (() => void) | null = null
  private unlisten: (() => void) | null = null
  autoReconnect: boolean
  private readonly opts: SessionOptions
  private lastTxAt = 0

  constructor(opts: SessionOptions) {
    this.opts = opts
    if (opts.initialPreset) this.snap = { ...this.snap, preset: opts.initialPreset }
    this.autoReconnect = opts.autoReconnect ?? true
    this.snap = { ...this.snap, liveSync: opts.liveSync ?? true, autoReconnect: this.autoReconnect }
  }

  // --- store plumbing (useSyncExternalStore) ---
  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.snap
  private set(patch: Partial<SessionSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    this.listeners.forEach((l) => l())
  }

  /** Run `fn` after every earlier queued operation, so sends and dumps never interleave. */
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.catch(() => undefined)
    return run
  }

  // --- connection ---
  async connect(): Promise<void> {
    this.manualDisconnect = false
    this.clearRetry()
    this.set({ link: 'connecting', error: null })
    try {
      await this.handshake(false)
    } catch (e) {
      this.transport = null
      const msg = (e as Error).message
      this.opts.debug?.('error', msg)
      this.set({ link: 'error', error: msg })
      if (this.autoReconnect && (await this.opts.devicePresent?.())) this.scheduleRetry()
    }
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true
    this.clearRetry()
    this.stopWatching()
    await this.transport?.close().catch(() => undefined)
    this.transport = null
    this.opts.debug?.('note', 'Disconnected')
    this.set({ link: 'disconnected', device: OFFLINE_DEVICE, presetNames: [], activeSlot: null, error: null,
      tuner: { active: false, note: 0, cents: 0, reading: false } })
  }

  /** Start watching for plug/unplug events and, if enabled, reconnect to an already-authorised amp. */
  start() {
    this.unwatch?.()
    this.unwatch = this.opts.watchDevice?.((e) => {
      if (e === 'detach') this.linkLost('USB cable unplugged')
      else if (this.snap.link === 'reconnecting' || (this.snap.link === 'error' && this.autoReconnect && !this.manualDisconnect)) {
        this.attempts = 0
        this.clearRetry()
        this.opts.debug?.('note', 'Amp detected — reconnecting')
        this.retryTimer = setTimeout(() => void this.retry(), 250)
      }
    }) ?? null
    if (this.autoReconnect && this.snap.link === 'disconnected') {
      void this.opts.devicePresent?.().then((present) => {
        if (present && this.snap.link === 'disconnected') void this.connect()
      })
    }
  }

  dispose() {
    this.clearRetry()
    this.stopWatching()
    if (this.changeTimer) clearTimeout(this.changeTimer)
    if (this.tunerTimer) clearTimeout(this.tunerTimer)
    this.unwatch?.()
    this.unwatch = null
    void this.transport?.close()
  }

  private async handshake(restore: boolean) {
    const t = this.opts.createTransport()
    const device = await t.open()
    this.transport = t
    this.opts.debug?.('note', `Opened ${device.name} over ${t.kind}`)
    this.set({ device })
    this.busy = true
    this.unlisten?.()
    this.unlisten = t.onPacket((p) => this.onPacket(p))
    try {
      t.drain()
      await this.tx(t, packets.init0())
      const init0Rx = await t.receive(this.opts.handshakeMs ?? 300)
      await this.tx(t, packets.init1(device.initValue))
      const init1Rx = await t.receive(this.opts.handshakeMs ?? 300)
      const dump = await this.requestDump(t)
      // A real amp always answers the handshake; silence means something else holds the device.
      if (!init0Rx && !init1Rx && !dump.length) {
        await t.close().catch(() => undefined)
        this.unlisten?.()
        this.unlisten = null
        this.transport = null
        throw new Error('The amp does not answer. Close other windows or apps that use the amp, then switch the amp off and on again.')
      }
      const names = parsePresetNames(dump, device.presetCount)
      const block = dump.slice(names.length * 2, names.length * 2 + 7)
      const patch: Partial<SessionSnapshot> = { presetNames: names }
      if (!restore && block.length) {
        const preset = parseStateBlock(block)
        const idx = names.findIndex((n) => n === preset.name)
        Object.assign(patch, { preset, dirty: false, activeSlot: idx === -1 ? null : idx, libraryId: null })
      }
      this.set({ ...patch, link: 'connected', error: null })
    } finally {
      this.busy = false
    }
    this.attempts = 0
    this.startPolling()
    if (restore) {
      this.opts.debug?.('note', 'Reconnected — restoring editor state to the amp')
      if (this.snap.liveSync) await this.pushPreset()
    }
  }

  private async requestDump(t: Transport, limit = 400): Promise<Uint8Array[]> {
    t.drain()
    await this.tx(t, packets.requestDump())
    const out: Uint8Array[] = []
    for (let i = 0; i < limit; i++) {
      const p = await t.receive(this.opts.receiveMs ?? 300)
      if (!p) break
      out.push(p)
    }
    rememberEffects(out)
    return out
  }

  private startPolling() {
    this.stopWatching()
    if (!this.opts.devicePresent) return
    this.pollTimer = setInterval(async () => {
      if (this.snap.link === 'connected' && !(await this.opts.devicePresent!())) this.linkLost('device no longer present on USB')
    }, this.opts.pollMs ?? 2000)
  }
  private stopWatching() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }
  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private linkLost(reason: string) {
    if (this.snap.link !== 'connected' && this.snap.link !== 'connecting') return
    this.stopWatching()
    this.unlisten?.()
    this.unlisten = null
    void this.transport?.close().catch(() => undefined)
    this.transport = null
    this.opts.debug?.('error', `Link lost: ${reason}`)
    if (this.autoReconnect && !this.manualDisconnect) {
      this.set({ link: 'reconnecting', error: 'Amp disconnected — waiting for the USB cable to come back…', activeSlot: null, presetNames: [],
        tuner: { active: false, note: 0, cents: 0, reading: false } })
      this.scheduleRetry()
    } else {
      this.set({ link: 'disconnected', device: OFFLINE_DEVICE, error: `Amp disconnected (${reason}).`, activeSlot: null, presetNames: [],
        tuner: { active: false, note: 0, cents: 0, reading: false } })
    }
  }

  private scheduleRetry() {
    this.clearRetry()
    this.attempts += 1
    const delay = Math.min(1000 * 2 ** Math.min(this.attempts - 1, 3), 8000)
    this.retryTimer = setTimeout(() => void this.retry(), delay)
  }

  private async retry() {
    if (!this.autoReconnect || this.manualDisconnect || this.snap.link === 'connected') return
    if (!(await this.opts.devicePresent?.())) return this.scheduleRetry()
    try {
      await this.handshake(true)
    } catch (e) {
      this.transport = null
      this.opts.debug?.('error', `Reconnect attempt ${this.attempts} failed: ${(e as Error).message}`)
      this.scheduleRetry()
    }
  }

  private async tx(t: Transport, p: Uint8Array) {
    this.opts.debug?.('tx', p)
    this.lastTxAt = Date.now()
    await t.send(p)
  }

  // --- incoming reports ---
  private lastStateAt = 0
  private changeTimer: ReturnType<typeof setTimeout> | null = null

  private onPacket(p: Uint8Array) {
    this.opts.debug?.('rx', p)
    const msg = decode(p)
    if (this.busy) return
    // With live sync off the amp's own changes and reports stay out of the editor (tuner packets still count).
    if (!this.snap.liveSync && msg.kind !== 'tuner' && msg.kind !== 'tunerStatus') return
    const preset = this.snap.preset
    switch (msg.kind) {
      case 'effect':
        rememberEffects([p])
        this.lastStateAt = Date.now()
        this.set({ preset: { ...preset, effects: { ...preset.effects, [msg.family]: parseEffect(msg.bytes) } } })
        break
      case 'ampSettings':
        this.lastStateAt = Date.now()
        this.set({ preset: { ...preset, amp: parseAmp(msg.bytes) } })
        break
      case 'usbGain':
        this.lastStateAt = Date.now()
        this.set({ preset: { ...preset, usbGain: msg.value } })
        break
      case 'presetName':
        this.lastStateAt = Date.now()
        this.set({ preset: { ...preset, name: msg.text || 'Preset' } })
        break
      case 'ampKnob': {
        const key = AMP_KNOB_IDS[msg.knob]
        if (key) this.set({ preset: { ...this.snap.preset, amp: { ...this.snap.preset.amp, [key]: msg.value } } })
        break
      }
      case 'presetChanged': {
        // The amp normally pushes the new preset's settings right after this. Only ask with a dump when it does not.
        // State that arrived just before this notice counts too: the amp does not always send them in the same order.
        const at = Date.now() - 300
        this.set({ activeSlot: msg.slot, dirty: false, libraryId: null })
        if (this.changeTimer) clearTimeout(this.changeTimer)
        this.changeTimer = setTimeout(() => {
          this.changeTimer = null
          if (this.lastStateAt < at) {
            this.opts.debug?.('note', `no state pushed after preset change to slot ${msg.slot}: reading with a dump`)
            void this.selectSlotPassive(msg.slot)
          }
        }, this.opts.changeSettleMs ?? 600)
        break
      }
      case 'effectKnob':
        this.onEffectKnob(msg.family, msg.model, msg.param, msg.value)
        break
      case 'tuner':
        if (!this.ignoreTuner) this.set({ tuner: { active: true, note: msg.note, cents: msg.cents, reading: true } })
        break
      case 'tunerStatus':
        if (!this.ignoreTuner) this.set({ tuner: { ...this.snap.tuner, active: msg.active, reading: msg.active && this.snap.tuner.reading } })
        break
    }
  }

  /**
   * The amp changed an effect parameter itself: the MOD or DLY/REV control (Level) or the TAP button (Delay Time,
   * or Rate when there is no delay). The report names the effect and the knob index, so the screen follows at once.
   */
  private onEffectKnob(family: EffectFamily, model: number, param: number, value: number) {
    if (Date.now() - this.lastTxAt < (this.opts.echoGuardMs ?? 250)) return
    const fx = this.snap.preset.effects[family]
    if ((fx.model & 255) !== model || param > 5 || fx.knobs[param] === value) return
    const knobs = [...fx.knobs]
    knobs[param] = value
    const p = this.snap.preset
    this.set({ preset: { ...p, effects: { ...p.effects, [family]: { ...fx, knobs } } } })
  }

  // --- commands ---
  private connected() {
    return this.snap.link === 'connected' ? this.transport : null
  }

  private async sendAll(list: Uint8Array[]) {
    const t = this.connected()
    if (!t) return
    await this.queue(async () => {
      for (const p of list) await this.tx(t, p)
    })
  }

  private pending = new Map<string, Uint8Array[]>()

  /** Like sendAll, but a newer write under the same key replaces one that has not gone out yet. */
  private sendLatest(key: string, list: Uint8Array[]) {
    const t = this.connected()
    if (!t) return Promise.resolve()
    const idle = this.pending.size === 0
    this.pending.set(key, list)
    if (!idle) return this.chain.then(() => undefined)
    return this.queue(async () => {
      while (this.pending.size) {
        const [k, v] = this.pending.entries().next().value!
        this.pending.delete(k)
        for (const p of v) await this.tx(t, p)
      }
    })
  }

  /** Select a slot on the amp and read back its state (the editor is not touched). Caller holds `busy`. */
  private async readSlot(t: Transport, slot: number): Promise<Preset> {
    t.drain()
    await this.tx(t, packets.selectPreset(slot))
    const block: Uint8Array[] = []
    for (let i = 0; i < 12; i++) {
      const p = await t.receive(250)
      if (!p) break
      block.push(p)
    }
    if (block.length > 3) return parseStateBlock(block)
    const dump = await this.requestDump(t)
    const n = parsePresetNames(dump, this.snap.device.presetCount).length
    return parseStateBlock(dump.slice(n * 2, n * 2 + 7))
  }

  /** Select a slot on the amp and load its settings into the editor. */
  selectSlot(slot: number): Promise<void> {
    if (!this.snap.liveSync) return Promise.resolve()
    const t = this.connected()
    if (!t) return Promise.resolve()
    this.set({ loadingSlot: slot })
    return this.queue(async () => {
      this.busy = true
      try {
        const preset = await this.readSlot(t, slot)
        preset.name = this.snap.presetNames[slot] ?? `Slot ${slot + 1}`
        this.set({ preset, activeSlot: slot, dirty: false, libraryId: null })
      } finally {
        this.busy = false
        this.set({ loadingSlot: null })
      }
    })
  }

  /** Read the amp's current settings with a dump. Resolves to null when there is nothing to read. */
  private readState(): Promise<Preset | null> {
    const t = this.connected()
    if (!t) return Promise.resolve(null)
    return this.queue(async () => {
      this.busy = true
      try {
        const dump = await this.requestDump(t)
        const n = parsePresetNames(dump, this.snap.device.presetCount).length
        const block = dump.slice(n * 2, n * 2 + 7)
        return block.length ? parseStateBlock(block) : null
      } finally {
        this.busy = false
      }
    })
  }

  /** The amp changed slot by itself: read the new state with a dump instead of sending a select. */
  private async selectSlotPassive(slot: number): Promise<void> {
    const preset = await this.readState()
    if (!preset) return
    preset.name = this.snap.presetNames[slot] ?? preset.name
    this.set({ preset, activeSlot: slot, dirty: false, libraryId: null })
  }

  setName(name: string) {
    this.set({ preset: { ...this.snap.preset, name }, dirty: true })
  }

  /** Live sync off: edits stay in the editor, amp reports are ignored, and nothing is pushed automatically. */
  setLiveSync(on: boolean) {
    this.set({ liveSync: on })
  }

  /** Toggle auto-reconnect: on while disconnected starts retrying, off stops pending retries. */
  setAutoReconnect(on: boolean) {
    this.autoReconnect = on
    this.set({ autoReconnect: on })
    if (on) {
      if (this.snap.link === 'disconnected' && !this.manualDisconnect) {
        this.set({ link: 'reconnecting' })
        this.scheduleRetry()
      }
    } else {
      this.clearRetry()
      if (this.snap.link === 'reconnecting') this.set({ link: 'disconnected', device: OFFLINE_DEVICE })
    }
  }

  /** Update the amp section of the editor; send to the amp when connected. */
  setAmp(patch: Partial<AmpSettings>) {
    if (patch.model !== undefined) {
      const m = ampById(patch.model)
      if (m?.v2Only && !this.snap.device.isV2) {
        this.opts.debug?.('note', `${m.name} needs a Mustang v2; ignored`)
        const { model: _dropped, ...rest } = patch
        patch = rest
      }
    }
    const amp = { ...this.snap.preset.amp, ...patch }
    this.set({ preset: { ...this.snap.preset, amp }, dirty: true })
    if (!this.snap.liveSync) return Promise.resolve()
    return this.sendLatest('amp', encodeAmp(amp))
  }

  /**
   * One of the eight amp knobs. It goes out as the full amp packet: the small live-knob packet of the original
   * app has an amp model byte (246 there) that the user's Mustang II ignores for other models.
   */
  setAmpKnob(key: (typeof AMP_KNOB_IDS)[number], value: number) {
    return this.setAmp({ [key]: value })
  }

  updateAmp(patch: Partial<AmpSettings>) {
    return this.setAmp(patch)
  }

  /** Add a line to the diagnostic log. */
  note(text: string) {
    this.opts.debug?.('note', text)
  }

  setUsbGain(value: number) {
    this.set({ preset: { ...this.snap.preset, usbGain: value }, dirty: true })
    if (!this.snap.liveSync) return Promise.resolve()
    return this.sendLatest('usb', encodeUsbGain(value))
  }

  setEffect(family: EffectFamily, fx: EffectSettings) {
    this.set({ preset: { ...this.snap.preset, effects: { ...this.snap.preset.effects, [family]: fx } }, dirty: true })
    if (!this.snap.liveSync) return Promise.resolve()
    return this.sendLatest(`fx:${family}`, encodeEffect(family, fx))
  }

  setEffectModel(family: EffectFamily, model: number) {
    const m = effectById(family, model)
    if (m?.v2Only && !this.snap.device.isV2) {
      this.opts.debug?.('note', `${m.name} needs a Mustang v2; ignored`)
      return Promise.resolve()
    }
    return this.setEffect(family, withEffectModel(family, this.snap.preset.effects[family], model))
  }
  setEffectKnob(family: EffectFamily, index: number, value: number) {
    return this.setEffect(family, withEffectKnob(this.snap.preset.effects[family], index, value))
  }
  toggleEffect(family: EffectFamily, enabled: boolean) {
    return this.setEffect(family, { ...this.snap.preset.effects[family], enabled })
  }
  /** Move an effect along the chain; the effect it lands on takes its old place. */
  moveEffect(family: EffectFamily, position: 'pre' | 'post', slot: number) {
    const changed = moveEffect(this.snap.preset.effects, family, position, slot)
    const entries = Object.entries(changed) as [EffectFamily, EffectSettings][]
    if (!entries.length) return Promise.resolve()
    const effects = { ...this.snap.preset.effects, ...changed }
    this.set({ preset: { ...this.snap.preset, effects }, dirty: true })
    if (!this.snap.liveSync) return Promise.resolve()
    return this.sendAll(entries.flatMap(([f, fx]) => encodeEffect(f, fx)))
  }

  loadPreset(preset: Preset, send = true, libraryId: string | null = null) {
    this.set({ preset, activeSlot: null, dirty: true, libraryId })
    return send && this.snap.liveSync ? this.pushPreset() : Promise.resolve()
  }

  setLibraryId(id: string | null) {
    this.set({ libraryId: id })
  }

  pushPreset() {
    return this.sendAll(encodePreset(this.snap.preset))
  }

  /** Write the editor state to a slot on the amp under the editor's preset name. */
  async saveToSlot(slot: number) {
    await this.pushPreset()
    await this.sendAll([packets.savePreset(slot, this.snap.preset.name)])
    const names = [...this.snap.presetNames]
    names[slot] = this.snap.preset.name
    this.set({ presetNames: names, activeSlot: slot, dirty: false })
  }

  private requireAmp(): Transport {
    const t = this.connected()
    if (!t) throw new Error('Connect the amp first.')
    if (!this.snap.liveSync) throw new Error('Turn Live sync on to read from or write to the amp.')
    return t
  }

  /**
   * After a bank read/write run: put the amp back on the editor's slot, then make it play what the
   * editor shows again when the editor has unsaved changes (or no slot); reload the editor when its
   * slot was overwritten and it was clean. `a`/`wasDirty` are captured before the run.
   */
  private async settleAfterBankRun(t: Transport, a: number | null, wasDirty: boolean, overwritten: Set<number>) {
    let back: Preset | null = null
    if (a !== null) back = await this.readSlot(t, a)
    if (wasDirty || a === null) {
      for (const p of encodePreset(this.snap.preset)) await this.tx(t, p)
    } else if (overwritten.has(a)) {
      back!.name = this.snap.presetNames[a] ?? back!.name
      this.set({ preset: back!, activeSlot: a, dirty: false, libraryId: null })
    }
  }

  /**
   * Read each slot's full preset from the amp (switches the amp through the slots).
   * The editor is not touched; live reports are ignored while the run is `busy`.
   */
  async backupSlots(slots: number[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal):
    Promise<{ slot: number; preset: Preset }[]> {
    const t = this.requireAmp()
    return this.queue(async () => {
      const a = this.snap.activeSlot
      const wasDirty = this.snap.dirty
      this.busy = true
      try {
        const out: { slot: number; preset: Preset }[] = []
        for (let i = 0; i < slots.length; i++) {
          if (signal?.aborted) break
          const preset = await this.readSlot(t, slots[i])
          preset.name = this.snap.presetNames[slots[i]] ?? `Slot ${slots[i] + 1}`
          out.push({ slot: slots[i], preset })
          onProgress?.(i + 1, slots.length)
        }
        await this.settleAfterBankRun(t, a, wasDirty, new Set())
        return out
      } finally {
        this.busy = false
      }
    })
  }

  /**
   * Write presets into amp slots (`{slot, preset}`; the amp keeps each preset's own name).
   * `presetNames` follows each write. The editor is not touched.
   */
  async restoreSlots(items: { slot: number; preset: Preset }[], onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal): Promise<void> {
    const t = this.requireAmp()
    return this.queue(async () => {
      const a = this.snap.activeSlot
      const wasDirty = this.snap.dirty
      const written = new Set<number>()
      this.busy = true
      try {
        for (let i = 0; i < items.length; i++) {
          if (signal?.aborted) break
          const it = items[i]
          const label = slotLabel(it.slot)
          t.drain()
          await this.tx(t, packets.selectPreset(it.slot))
          // The amp loads the slot, then answers with its state block ending in the `1c 01 00 00 <slot>` trailer.
          const loaded = await this.readUntil(t,
            (p) => p[0] === 0x1c && p[1] === 1 && p[2] === 0 && p[4] === it.slot, this.opts.slotLoadTimeoutMs ?? 1500)
          if (!loaded) this.opts.debug?.('note', `No reply from the amp to the slot select (slot ${label})`)
          // The amp acks each `1c 03 …` write (`00 00 1c …`). Some acks go missing, so a timeout just continues.
          for (const p of encodePreset(it.preset)) {
            await this.tx(t, p)
            const acked = await this.readUntil(t, isWriteAck, this.opts.ackTimeoutMs ?? 100)
            if (!acked) this.opts.debug?.('note', `No reply from the amp to a preset write (slot ${label})`)
          }
          await this.tx(t, packets.savePreset(it.slot, it.preset.name))
          // The amp sends no reply to the save; pause so it can store the slot before the next select.
          await wait(this.opts.saveSettleMs ?? 100)
          written.add(it.slot)
          const names = [...this.snap.presetNames]
          names[it.slot] = it.preset.name
          this.set({ presetNames: names })
          onProgress?.(i + 1, items.length)
        }
        await this.settleAfterBankRun(t, a, wasDirty, written)
      } finally {
        this.busy = false
      }
    })
  }

  /** Read packets until `match` is true or the deadline passes. Packets that do not match are skipped. */
  private async readUntil(t: Transport, match: (p: Uint8Array) => boolean, timeoutMs: number): Promise<boolean> {
    const end = Date.now() + timeoutMs
    for (;;) {
      const left = end - Date.now()
      if (left <= 0) return false
      const p = await t.receive(left)
      if (!p) return false
      if (match(p)) return true
    }
  }

  private ignoreTuner = false
  private tunerTimer: ReturnType<typeof setTimeout> | null = null

  /** Switch the amp's tuner on or off. After off, late readings are ignored so the overlay does not reopen. */
  setTuner(on: boolean) {
    if (this.tunerTimer) clearTimeout(this.tunerTimer)
    this.tunerTimer = null
    if (on && !this.connected()) return Promise.resolve()
    if (on) {
      this.ignoreTuner = false
      this.set({ tuner: { active: true, note: 0, cents: 0, reading: false } })
    } else {
      this.ignoreTuner = true
      this.set({ tuner: { active: false, note: 0, cents: 0, reading: false } })
      this.tunerTimer = setTimeout(() => (this.ignoreTuner = false), this.opts.tunerIgnoreMs ?? 1000)
    }
    return this.sendAll([on ? packets.tunerOn() : packets.tunerOff()])
  }

  /** Test helper: wait until `link` reaches a state. */
  async waitFor(link: LinkState, timeoutMs = 2000) {
    const end = Date.now() + timeoutMs
    while (this.snap.link !== link) {
      if (Date.now() > end) throw new Error(`Timed out waiting for ${link} (now ${this.snap.link})`)
      await wait(5)
    }
  }
}
