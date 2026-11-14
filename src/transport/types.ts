import type { DeviceInfo } from '../protocol/packets'

export type TransportKind = 'WebHID' | 'Simulated' | 'OFFLINE'

export interface Transport {
  readonly kind: TransportKind
  open(): Promise<DeviceInfo>
  close(): Promise<void>
  send(packet: Uint8Array): Promise<void>
  /** Resolves with the next incoming packet, or null after `timeoutMs`. */
  receive(timeoutMs?: number): Promise<Uint8Array | null>
  /** Drop packets queued for `receive`. Call before a request so stale live reports are not read as its reply. */
  drain(): void
  /** Every incoming packet, including those also returned by `receive`. */
  onPacket(listener: (packet: Uint8Array) => void): () => void
}

export const OFFLINE_DEVICE: DeviceInfo = {
  productId: 20, name: 'Mustang II (v2, offline)', isV2: true, initValue: 193, presetCount: 24,
}

/** Shared receive queue: a packet goes to every listener and to one waiting `receive` call (or the queue). */
export class PacketQueue {
  private queue: Uint8Array[] = []
  private waiters: ((p: Uint8Array | null) => void)[] = []
  private listeners = new Set<(p: Uint8Array) => void>()

  push(p: Uint8Array) {
    this.listeners.forEach((l) => l(p))
    const w = this.waiters.shift()
    if (w) w(p)
    else {
      this.queue.push(p)
      if (this.queue.length > 512) this.queue.shift()
    }
  }
  receive(timeoutMs = 500): Promise<Uint8Array | null> {
    const next = this.queue.shift()
    if (next) return Promise.resolve(next)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter)
        if (i !== -1) this.waiters.splice(i, 1)
        resolve(null)
      }, timeoutMs)
      const waiter = (p: Uint8Array | null) => { clearTimeout(timer); resolve(p) }
      this.waiters.push(waiter)
    })
  }
  clear() {
    this.queue = []
  }
  /** Release every waiting `receive` with null (used on close). */
  flush() {
    this.clear()
    this.waiters.splice(0).forEach((w) => w(null))
  }
  subscribe(l: (p: Uint8Array) => void) {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
}
