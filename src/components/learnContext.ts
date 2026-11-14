import { createContext } from 'react'
import type { MidiMapping, MidiTarget } from '../midi/learn'

export interface MidiLearn {
  active: boolean
  armed: MidiTarget | null
  onArm: (target: MidiTarget) => void
  mappingFor: (target: MidiTarget) => MidiMapping | undefined
}

export const MidiLearnContext = createContext<MidiLearn>({
  active: false, armed: null, onArm: () => {}, mappingFor: () => undefined,
})
