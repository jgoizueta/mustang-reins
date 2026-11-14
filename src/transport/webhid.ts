import { DEVICES, VENDOR_ID, type DeviceInfo } from '../protocol/packets'
import { PacketQueue, type Transport, type TransportKind } from './types'

const productIds = DEVICES.map((d) => d.productId)
const isMustang = (d: HIDDevice) => d.vendorId === VENDOR_ID && productIds.includes(d.productId)

export const webHidSupported = () => typeof navigator !== 'undefined' && 'hid' in navigator

export function deviceInfo(productId: number): DeviceInfo {
  return (
    DEVICES.find((d) => d.productId === productId) ?? {
      productId, name: `Unknown Mustang (0x${productId.toString(16)})`, isV2: true, initValue: 193, presetCount: 24,
    }
  )
}

export interface DeviceProbe {
  at: number
  transport: TransportKind
  present: boolean
  opened: boolean
  vendorId: number | null
  productId: number | null
  model: string | null
  strings: Record<string, string>
  interfaces: { number: number; class: number | undefined; protocol: number | undefined; endpoints: string[] }[]
  notes: string[]
}

const hex4 = (v: number) => `0x${v.toString(16).padStart(4, '0')}`

/** Look at the authorised HID device without opening it, for the diagnostics card. */
export async function probeDevice(): Promise<DeviceProbe> {
  const probe: DeviceProbe = {
    at: Date.now(),
    transport: webHidSupported() ? 'WebHID' : 'OFFLINE',
    present: false,
    opened: false,
    vendorId: null,
    productId: null,
    model: null,
    strings: {},
    interfaces: [],
    notes: [],
  }
  try {
    if (webHidSupported()) {
      const device = (await navigator.hid.getDevices()).find(isMustang)
      if (device) {
        probe.present = true
        probe.opened = device.opened
        probe.vendorId = device.vendorId
        probe.productId = device.productId
        if (device.productName?.trim()) probe.strings.Product = device.productName.trim()
        ;(device.collections ?? []).forEach((c, i) => {
          probe.interfaces.push({
            number: i,
            class: c.usagePage,
            protocol: c.usage,
            endpoints: [
              `in reports: ${(c.inputReports ?? []).length}`,
              `out reports: ${(c.outputReports ?? []).length}`,
              `feature reports: ${(c.featureReports ?? []).length}`,
            ],
          })
        })
      } else {
        probe.notes.push('No authorised HID device — click Connect amp and pick it in the prompt.')
      }
    } else {
      probe.notes.push('Offline mode: this environment exposes no USB API.')
    }
  } catch (e) {
    probe.notes.push(`Probe failed: ${(e as Error).message}`)
  }
  if (probe.productId != null && !probe.model) probe.model = deviceInfo(probe.productId).name
  if (probe.vendorId != null && probe.vendorId !== VENDOR_ID) {
    probe.notes.push(`Unexpected vendor ${hex4(probe.vendorId)} — Fender is ${hex4(VENDOR_ID)}.`)
  }
  return probe
}

/** True when an authorised Mustang is plugged in. */
export async function devicePresent(): Promise<boolean> {
  try {
    return webHidSupported() && (await navigator.hid.getDevices()).some(isMustang)
  } catch {
    return false
  }
}

/** Calls `cb` when an authorised Mustang is plugged in or unplugged. Returns an unsubscribe function. */
export function watchDevice(cb: (event: 'attach' | 'detach') => void): () => void {
  if (!webHidSupported()) return () => {}
  const onConnect = (e: HIDConnectionEvent) => isMustang(e.device) && cb('attach')
  const onDisconnect = (e: HIDConnectionEvent) => isMustang(e.device) && cb('detach')
  navigator.hid.addEventListener('connect', onConnect)
  navigator.hid.addEventListener('disconnect', onDisconnect)
  return () => {
    navigator.hid.removeEventListener('connect', onConnect)
    navigator.hid.removeEventListener('disconnect', onDisconnect)
  }
}

type Pending = { resolve: (v: { productId?: number }) => void; reject: (e: Error) => void }

export class WebHidTransport implements Transport {
  readonly kind = 'WebHID' as const
  private worker: Worker | null = null
  private msgId = 0
  private pending = new Map<number, Pending>()
  private rx = new PacketQueue()

  private command(type: 'open' | 'close' | 'send', extra?: object) {
    const worker = this.worker
    if (!worker) return Promise.reject(new Error('Worker not initialised'))
    const id = ++this.msgId
    return new Promise<{ productId?: number }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      worker.postMessage({ type, id, ...extra })
    })
  }

  private async authorise() {
    if (!webHidSupported()) throw new Error('WebHID is not supported in this browser. Use Chrome or Edge.')
    if (!(await navigator.hid.getDevices()).some(isMustang)) {
      await navigator.hid.requestDevice({ filters: productIds.map((productId) => ({ vendorId: VENDOR_ID, productId })) })
    }
  }

  async open(): Promise<DeviceInfo> {
    await this.authorise()
    this.worker = new Worker(new URL('./hid.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'packet') this.rx.push(e.data.data)
      else if (e.data.type === 'response') {
        const p = this.pending.get(e.data.id)
        if (!p) return
        this.pending.delete(e.data.id)
        if (e.data.success) p.resolve(e.data)
        else p.reject(new Error(e.data.error))
      }
    }
    try {
      const { productId } = await this.command('open')
      return deviceInfo(productId ?? 0)
    } catch (err) {
      this.worker.terminate()
      this.worker = null
      throw err
    }
  }

  async close() {
    if (this.worker) {
      try { await this.command('close') } catch { /* already gone */ }
      this.worker.terminate()
      this.worker = null
    }
    this.pending.forEach((p) => p.reject(new Error('Transport closed')))
    this.pending.clear()
    this.rx.flush()
  }

  async send(packet: Uint8Array) {
    await this.command('send', { data: Array.from(packet) })
  }
  drain() {
    this.rx.clear()
  }
  receive(timeoutMs = 500) {
    return this.worker ? this.rx.receive(timeoutMs) : Promise.resolve(null)
  }
  onPacket(listener: (packet: Uint8Array) => void) {
    return this.rx.subscribe(listener)
  }
}
