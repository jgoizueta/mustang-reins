import type { Preset } from '../protocol/preset'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** True when `p` has the shape of a preset, so a damaged stored value cannot break the editor. */
export function isPreset(p: unknown): p is Preset {
  const x = p as Preset | null
  return !!x && typeof x.name === 'string' && !!x.amp && typeof x.amp.model === 'number' && !!x.effects &&
    ['stomp', 'mod', 'delay', 'reverb'].every((f) => Array.isArray((x.effects as Record<string, { knobs?: unknown }>)[f]?.knobs))
}

/** The editor's working preset, kept across reloads. */
export const WORKING_KEY = 'mustang-amp-control.working.v1'
