import { useCallback, useEffect, useRef, useState } from 'react'

export interface MidiInputInfo {
  id: string
  name: string
  manufacturer: string
}

const ENABLED_KEY = 'mustang.midi.enabled'
const INPUT_KEY = 'mustang.midi.inputId'

const read = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

/**
 * Web MIDI input. When enabled it lists the inputs, remembers the chosen one, and passes the
 * messages of that input to `onMessage(status, data1, data2)`.
 */
export function useMidi(onMessage: (status: number, d1: number, d2: number) => void) {
  const [enabled, setEnabledState] = useState(() => read(ENABLED_KEY) === 'true')
  const [inputs, setInputs] = useState<MidiInputInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(() => read(INPUT_KEY))
  const [error, setError] = useState<string | null>(null)

  // Handlers read the latest values from refs, so the MIDI listeners never need to be rebuilt.
  const handler = useRef(onMessage)
  const active = useRef(activeId)
  useEffect(() => {
    handler.current = onMessage
    active.current = activeId
  })

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on)
    write(ENABLED_KEY, on ? 'true' : 'false')
    if (!on) { setInputs([]); setError(null) }
  }, [])

  const select = useCallback((id: string | null) => {
    setActiveId(id)
    write(INPUT_KEY, id)
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (!('requestMIDIAccess' in navigator)) { setError('Web MIDI is not supported in this browser.'); return }
    let access: MIDIAccess | null = null
    let cancelled = false
    const onMidi = (e: MIDIMessageEvent) => {
      const port = e.target as MIDIInput | null
      if (!port || port.id !== active.current || !e.data) return
      handler.current(e.data[0], e.data[1] ?? 0, e.data[2] ?? 0)
    }
    const refresh = () => {
      if (!access) return
      const list: MidiInputInfo[] = []
      access.inputs.forEach((input) => {
        list.push({ id: input.id, name: input.name || 'Unknown input', manufacturer: input.manufacturer || '' })
        input.onmidimessage = onMidi
      })
      setInputs(list)
    }
    // sysex is not needed for notes and controllers, so the browser does not ask for the stronger permission.
    navigator.requestMIDIAccess({ sysex: false }).then(
      (a) => {
        if (cancelled) return
        access = a
        setError(null)
        refresh()
        a.onstatechange = refresh
      },
      (e: Error) => !cancelled && setError(`Could not open MIDI: ${e.message}`),
    )
    return () => {
      cancelled = true
      if (access) {
        access.inputs.forEach((i) => (i.onmidimessage = null))
        access.onstatechange = null
      }
    }
  }, [enabled])

  // Use the first input when none was chosen before.
  useEffect(() => {
    if (inputs.length && !activeId) select(inputs[0].id)
  }, [inputs, activeId, select])

  return { enabled, setEnabled, inputs, activeId, select, error }
}
