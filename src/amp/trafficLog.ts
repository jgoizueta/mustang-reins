import { useSyncExternalStore } from 'react'

export interface LogEntry {
  id: number
  at: number
  dir: 'tx' | 'rx' | 'info' | 'error'
  text: string
  packet?: Uint8Array
}

const CAP = 500

/** USB traffic log: always collected, not persisted, keeps the newest 500 entries. */
export class TrafficLog {
  private entries: LogEntry[] = []
  private listeners = new Set<() => void>()
  private nextId = 0

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.entries

  push(dir: LogEntry['dir'], text: string, packet?: Uint8Array) {
    this.entries = [...this.entries, { id: ++this.nextId, at: Date.now(), dir, text, packet }].slice(-CAP)
    this.listeners.forEach((l) => l())
  }
  clear() {
    this.entries = []
    this.listeners.forEach((l) => l())
  }
}

export const trafficLog = new TrafficLog()

export function useTrafficLog() {
  return useSyncExternalStore(trafficLog.subscribe, trafficLog.getSnapshot)
}
