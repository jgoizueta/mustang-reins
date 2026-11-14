import type { EffectFamily } from '../protocol/packets'

export interface EffectModel {
  id: number
  name: string
  basedOn?: string
  family: EffectFamily
  /** Labels of the knobs the effect uses, in packet order (bytes 32..). */
  knobs: string[]
  /** Knobs that pick from named choices instead of a 0-100 value, keyed by knob index. */
  enums?: Record<number, string[]>
  /** Three bytes the amp reports for the effect. The original editor stores them but does not write them. */
  unknown: [number, number, number]
  v2Only?: boolean
}

export const EFFECTS: EffectModel[] = [
  { id: 0, name: 'Empty', family: 'stomp', knobs: [], unknown: [0, 1, 1] },
  { id: 60, name: 'Overdrive', basedOn: 'Ibanez Tube Screamer', family: 'stomp', knobs: ['Level', 'Gain', 'Low', 'Mid', 'High'], unknown: [0, 1, 1] },
  { id: 73, name: 'Wah', basedOn: 'VOX V847A Wah-Wah', family: 'stomp', knobs: ['Level', 'Freq Min', 'Freq Max', 'Q'], unknown: [1, 8, 1] },
  { id: 74, name: 'Touch Wah', basedOn: 'VOX V847A Wah-Wah (Envelope Controlled)', family: 'stomp', knobs: ['Level', 'Sensitivity', 'Freq Min', 'Freq Max', 'Q'], unknown: [1, 8, 1] },
  { id: 26, name: 'Fuzz', basedOn: 'Vox Tone Bender', family: 'stomp', knobs: ['Level', 'Gain', 'Octave', 'Low', 'High'], unknown: [0, 1, 1] },
  { id: 28, name: 'Fuzz Touch Wah', basedOn: 'Fuzz Face + Envelope Filter', family: 'stomp', knobs: ['Level', 'Gain', 'Sensitivity', 'Octave', 'Peak'], unknown: [0, 1, 1] },
  { id: 136, name: 'Simple Comp', basedOn: 'MXR Dyna Comp', family: 'stomp', knobs: ['Type'], enums: { 0: ['Type 1', 'Type 2', 'Type 3', 'Type 4'] }, unknown: [8, 8, 1] },
  { id: 7, name: 'Compressor', basedOn: 'Boss CS-3 Compressor Sustainer', family: 'stomp', knobs: ['Level', 'Threshold', 'Ratio', 'Attack', 'Release'], unknown: [0, 1, 1] },
  { id: 259, name: 'Ranger Boost', basedOn: 'Dallas RangeMaster Treble Booster', family: 'stomp', knobs: ['Level', 'Gain', 'Tone', 'Range', 'Body'], unknown: [0, 1, 1], v2Only: true },
  { id: 186, name: 'Greenbox', basedOn: 'Ibanez Tube Screamer TS808', family: 'stomp', knobs: ['Level', 'Gain', 'Tone', 'Blend', 'Body'], unknown: [0, 1, 1], v2Only: true },
  { id: 272, name: 'Orangebox', basedOn: 'Boss DS-1 Distortion', family: 'stomp', knobs: ['Level', 'Gain', 'Tone', 'Blend', 'Body'], unknown: [0, 1, 1], v2Only: true },
  { id: 273, name: 'Blackbox', basedOn: 'ProCo RAT', family: 'stomp', knobs: ['Level', 'Gain', 'Tone', 'Blend', 'Body'], unknown: [0, 1, 1], v2Only: true },
  { id: 271, name: 'Big Fuzz', basedOn: 'Electro-Harmonix Big Muff Pi', family: 'stomp', knobs: ['Level', 'Gain', 'Tone', 'Blend', 'Body'], unknown: [0, 1, 1], v2Only: true },
  { id: 0, name: 'Empty', family: 'mod', knobs: [], unknown: [1, 1, 1] },
  { id: 18, name: 'Sine Chorus', basedOn: 'Boss CE-2 Chorus', family: 'mod', knobs: ['Level', 'Rate', 'Depth', 'Avg Delay', 'LR Phase'], unknown: [1, 1, 1] },
  { id: 19, name: 'Triangle Chorus', basedOn: 'MXR Stereo Chorus', family: 'mod', knobs: ['Level', 'Rate', 'Depth', 'Avg Delay', 'LR Phase'], unknown: [1, 1, 1] },
  { id: 24, name: 'Sine Flanger', basedOn: 'MXR M117 Flanger', family: 'mod', knobs: ['Level', 'Rate', 'Depth', 'Feedback', 'LR Phase'], unknown: [1, 1, 1] },
  { id: 25, name: 'Triangle Flanger', basedOn: 'Boss BF-2 Flanger', family: 'mod', knobs: ['Level', 'Rate', 'Depth', 'Feedback', 'LR Phase'], unknown: [1, 1, 1] },
  { id: 45, name: 'Vibratone', basedOn: 'Fender Vibratone', family: 'mod', knobs: ['Level', 'Rotor Speed', 'Depth', 'Feedback', 'LR Phase'], unknown: [1, 1, 1] },
  { id: 64, name: 'Vintage Tremolo', basedOn: 'Fender Tube Amp Tremolo', family: 'mod', knobs: ['Level', 'Rate', 'Duty Cycle', 'Attack', 'Release'], unknown: [1, 1, 1] },
  { id: 65, name: 'Sine Tremolo', basedOn: 'Fender Bias Tremolo', family: 'mod', knobs: ['Level', 'Rate', 'Duty Cycle', 'LFO Clipping', 'Tri Shaping'], unknown: [1, 1, 1] },
  { id: 34, name: 'Ring Modulator', basedOn: 'Moog MF-102 Ring Modulator', family: 'mod', knobs: ['Level', 'Frequency', 'Depth', 'LFO Shape', 'LFO Phase'], enums: { 3: ['Sine', 'Square'] }, unknown: [1, 1, 1] },
  { id: 41, name: 'Step Filter', basedOn: 'ZVex Seek Wah', family: 'mod', knobs: ['Level', 'Rate', 'Resonance', 'Min Freq', 'Max Freq'], unknown: [1, 1, 1] },
  { id: 79, name: 'Phaser', basedOn: 'MXR Phase 90', family: 'mod', knobs: ['Level', 'Rate', 'Depth', 'Feedback', 'LFO Shape'], enums: { 4: ['Sine', 'Square'] }, unknown: [1, 1, 1] },
  { id: 31, name: 'Pitch Shifter', basedOn: 'Boss PS-6 Harmonist', family: 'mod', knobs: ['Level', 'Pitch', 'Detune', 'Feedback', 'Pre-delay'], unknown: [1, 8, 1] },
  { id: 244, name: 'Wah', basedOn: 'VOX V847A Wah-Wah', family: 'mod', knobs: ['Level', 'Freq Min', 'Freq Max', 'Q'], unknown: [1, 8, 1], v2Only: true },
  { id: 245, name: 'Touch Wah', basedOn: 'VOX V847A Wah-Wah (Envelope Controlled)', family: 'mod', knobs: ['Level', 'Sensitivity', 'Freq Min', 'Freq Max', 'Q'], unknown: [1, 8, 1], v2Only: true },
  { id: 4127, name: 'Diatonic Pitch Shifter', basedOn: 'Boss PS-6 Harmonist', family: 'mod', knobs: ['Level', 'Pitch', 'Key', 'Scale', 'Pre-delay'], unknown: [1, 8, 1], v2Only: true },
  { id: 0, name: 'Empty', family: 'delay', knobs: [], unknown: [2, 1, 1] },
  { id: 22, name: 'Mono Delay', basedOn: 'Boss DD-3 Digital Delay', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Brightness', 'Attenuation'], unknown: [2, 1, 1] },
  { id: 67, name: 'Mono Echo Filter', basedOn: 'Generic Delay with Filter', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Frequency', 'Resonance', 'Input Level'], unknown: [2, 1, 1] },
  { id: 72, name: 'Stereo Echo Filter', basedOn: 'Generic Stereo Delay with Filter', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Frequency', 'Resonance', 'Input Level'], unknown: [2, 1, 1] },
  { id: 68, name: 'Multitap Delay', basedOn: 'Korg SDD-3000 / Generic Multitap', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Brightness', 'Mode'], unknown: [2, 1, 1] },
  { id: 69, name: 'Ping-Pong Delay', basedOn: 'Generic Ping Pong', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Brightness', 'Attenuation'], unknown: [2, 1, 1] },
  { id: 21, name: 'Ducking Delay', basedOn: 'TC Electronic 2290 (Dynamic)', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Release', 'Threshold'], unknown: [2, 1, 1] },
  { id: 70, name: 'Reverse Delay', basedOn: 'Boss DD-7 Reverse Mode', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Brightness', 'Attenuation'], unknown: [2, 1, 1] },
  { id: 43, name: 'Tape Delay', basedOn: 'Maestro Echoplex / Roland Space Echo', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Flutter', 'Brightness', 'Stereo'], unknown: [2, 1, 1] },
  { id: 42, name: 'Stereo Tape Delay', basedOn: 'Maestro Echoplex / Roland Space Echo', family: 'delay', knobs: ['Level', 'Delay Time', 'Feedback', 'Flutter', 'Separation', 'Brightness'], unknown: [2, 1, 1] },
  { id: 0, name: 'Empty', family: 'reverb', knobs: [], unknown: [0, 8, 1] },
  { id: 36, name: 'Small Hall', basedOn: 'Standard Hall Algorithm', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 58, name: 'Large Hall', basedOn: 'Standard Hall Algorithm', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 38, name: 'Small Room', basedOn: 'Standard Room Algorithm', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 59, name: 'Large Room', basedOn: 'Standard Room Algorithm', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 78, name: 'Small Plate', basedOn: 'EMT 140 Plate (Short Decay)', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 75, name: 'Large Plate', basedOn: 'EMT 140 Plate (Long Decay)', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 76, name: 'Ambient', basedOn: 'Generic Ambient / Shimmer', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 77, name: 'Arena', basedOn: 'Generic Arena / Stadium', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 33, name: '\'63 Fender Spring', basedOn: '1963 Fender Spring Reverb Unit', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
  { id: 11, name: '\'65 Fender Spring', basedOn: '1965 Fender Spring Reverb (In-Amp)', family: 'reverb', knobs: ['Level', 'Decay', 'Dwell', 'Diffusion', 'Tone'], unknown: [0, 8, 1] },
]

export const FAMILY_LABELS: Record<EffectFamily, string> = {
  stomp: 'Stompbox', mod: 'Modulation', delay: 'Delay', reverb: 'Reverb',
}

/** Effects offered for a family. v1 firmware hides the models that only exist on v2. */
export const effectsFor = (family: EffectFamily, isV2: boolean) =>
  EFFECTS.filter((e) => e.family === family && (isV2 || !e.v2Only))

export const effectById = (family: EffectFamily, id: number) =>
  EFFECTS.find((e) => e.family === family && e.id === id)
