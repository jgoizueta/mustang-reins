import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { withEffectModel } from '../protocol/preset'
import { SimulatedTransport } from '../transport/simulated'
import type { Transport } from '../transport/types'
import { devicePresent, watchDevice, webHidSupported, WebHidTransport } from '../transport/webhid'
import { isPreset, readJson, writeJson, WORKING_KEY } from './storage'
import { trafficLog } from './trafficLog'
import { AmpSession } from './session'

const SETTINGS_KEY = 'mustang-amp-control.settings.v1'

function loadSettings(): { liveSync: boolean; autoReconnect: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    return {
      liveSync: typeof v.liveSync === 'boolean' ? v.liveSync : true,
      autoReconnect: typeof v.autoReconnect === 'boolean' ? v.autoReconnect : true,
    }
  } catch {
    return { liveSync: true, autoReconnect: true }
  }
}

/** `?sim` in the URL swaps the USB link for an in-memory amp, for developing without hardware. */
export const isSimulator = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('sim')

function createTransport(): Transport {
  if (isSimulator()) {
    const sim = new SimulatedTransport(undefined, 15, true)
    const p = sim.presets[0]
    p.name = 'Demo Crunch'
    p.effects.stomp = withEffectModel('stomp', p.effects.stomp, 60)
    p.effects.delay = withEffectModel('delay', p.effects.delay, 22)
    p.effects.reverb = { ...withEffectModel('reverb', p.effects.reverb, 11), slot: 3 }
    p.effects.stomp.knobs[1] = 200
    return sim
  }
  if (!webHidSupported()) {
    return {
      kind: 'OFFLINE', open: async () => { throw new Error('WebHID is not supported in this browser. Use Chrome or Edge.') },
      close: async () => {}, send: async () => {}, receive: async () => null, drain: () => {}, onPacket: () => () => {},
    }
  }
  return new WebHidTransport()
}

const hex = (p: Uint8Array) => Array.from(p, (b) => b.toString(16).padStart(2, '0')).join(' ')

/** One shared buffer: React may build the session twice in dev, and both must write to the array on `window`. */
const packetLog: string[] = []
if (typeof window !== 'undefined') (window as unknown as { __mustangLog: string[] }).__mustangLog = packetLog

/**
 * Keeps the last 3000 packets in `window.__mustangLog`, always. Copy them with `copy(__mustangLog.join('\n'))`.
 * `?debug` also prints each one to the console.
 */
function packetLogger() {
  if (typeof window === 'undefined') return undefined
  const echo = new URLSearchParams(location.search).has('debug')
  return (dir: 'tx' | 'rx' | 'note' | 'error', p: Uint8Array | string) => {
    const line = `${new Date().toISOString().slice(11, 23)} ${dir} ${typeof p === 'string' ? p : hex(p)}`
    packetLog.push(line)
    if (packetLog.length > 3000) packetLog.shift()
    trafficLog.push(dir === 'note' ? 'info' : dir, typeof p === 'string' ? p : '', typeof p === 'string' ? undefined : p)
    if (echo) console.debug('[mustang]', line)
  }
}

export function useAmp() {
  const session = useMemo(
    () => {
      const settings = loadSettings()
      return new AmpSession({
      createTransport,
      devicePresent: isSimulator() ? undefined : devicePresent,
      watchDevice: isSimulator() ? undefined : watchDevice,
      autoReconnect: settings.autoReconnect,
      liveSync: settings.liveSync,
      debug: packetLogger(),
      initialPreset: (() => {
        const saved = readJson<unknown>(WORKING_KEY, null)
        return isPreset(saved) ? saved : undefined
      })(),
      })
    },
    [],
  )
  useEffect(() => {
    session.start()
    if (isSimulator()) {
      void session.connect().then(() => {
        if (location.hash === '#tuner') void session.setTuner(true)
      })
    }
    return () => session.dispose()
  }, [session])
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  // Keep the editor contents across reloads (shortly after the last change).
  useEffect(() => {
    const t = setTimeout(() => writeJson(WORKING_KEY, state.preset), 300)
    return () => clearTimeout(t)
  }, [state.preset])
  // Persist the live-sync and auto-reconnect switches.
  useEffect(() => {
    writeJson(SETTINGS_KEY, { liveSync: state.liveSync, autoReconnect: state.autoReconnect })
  }, [state.liveSync, state.autoReconnect])
  return { session, state }
}
