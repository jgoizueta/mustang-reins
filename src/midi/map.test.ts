import { describe, expect, it, vi } from 'vitest'
import { CC, handleMidi, scale127, type MidiActions } from './map'

function actions() {
  const a: { [K in keyof MidiActions]: ReturnType<typeof vi.fn> } = {
    loadSlot: vi.fn(), setTuner: vi.fn(), toggleEffect: vi.fn(), setEffectModel: vi.fn(),
    setEffectKnob: vi.fn(), updateAmp: vi.fn(), setUsbGain: vi.fn(), setBright: vi.fn(), note: vi.fn(),
  }
  return a
}
const cc = (n: number, v: number, a: ReturnType<typeof actions>, ch = 0) => handleMidi(0xb0 | ch, n, v, a as unknown as MidiActions)

describe('handleMidi', () => {
  it('loads a slot on program change, on any channel, within the amp slot count', () => {
    const a = actions()
    handleMidi(0xc0, 5, 0, a as unknown as MidiActions, 24)
    handleMidi(0xc9, 23, 0, a as unknown as MidiActions, 24)
    handleMidi(0xc0, 24, 0, a as unknown as MidiActions, 24)
    expect(a.loadSlot.mock.calls).toEqual([[5], [23]])
  })

  it('turns the tuner on from value 64 up', () => {
    const a = actions()
    cc(CC.TUNER, 127, a)
    cc(CC.TUNER, 63, a)
    expect(a.setTuner.mock.calls).toEqual([[true], [false]])
  })

  it('switches single effects and all effects together', () => {
    const a = actions()
    cc(CC.DELAY, 100, a)
    cc(CC.ALL_FX, 0, a)
    expect(a.toggleEffect.mock.calls).toEqual([
      ['delay', true], ['stomp', false], ['mod', false], ['delay', false], ['reverb', false],
    ])
  })

  it('picks models by value and ignores values that map to none', () => {
    const a = actions()
    cc(CC.STOMP_TYPE, 1, a)
    cc(CC.MOD_TYPE, 14, a)
    cc(CC.DELAY_TYPE, 0, a)
    cc(CC.REVERB_TYPE, 99, a)
    cc(CC.AMP_TYPE, 4, a)
    cc(CC.AMP_TYPE, 0, a)
    expect(a.setEffectModel.mock.calls).toEqual([['stomp', 60], ['mod', 4127], ['delay', 0]])
    expect(a.updateAmp.mock.calls).toEqual([[{ model: 83 }]])
  })

  it('scales effect knobs from 0-127 to 0-255', () => {
    const a = actions()
    cc(29, 127, a)
    cc(54, 64, a)
    cc(59, 0, a)
    expect(a.setEffectKnob.mock.calls).toEqual([['stomp', 0, 255], ['delay', 5, 129], ['reverb', 0, 0]])
    expect(scale127(127)).toBe(255)
  })

  it('maps amp parameters: scaled, raw choices, and the brightness switch', () => {
    const a = actions()
    cc(70, 127, a)
    cc(77, 3, a)
    cc(74, 2, a)
    cc(92, 70, a)
    cc(92, 10, a)
    cc(CC.AMP_NOISE_GATE, 100, a)
    expect(a.updateAmp.mock.calls).toEqual([
      [{ volume: 255 }], [{ cabinet: 3 }], [{ sag: 2 }], [{ brightness: 1 }], [{ brightness: 0 }], [{ noiseGate: 1 }],
    ])
  })

  it('ignores other messages and unknown controllers, and logs the ones it reads', () => {
    const a = actions()
    handleMidi(0x90, 60, 100, a as unknown as MidiActions)
    cc(5, 5, a)
    expect(a.note).toHaveBeenCalledTimes(1)
    expect(a.note).toHaveBeenCalledWith('MIDI [Ch 1] CC #5 value=5')
    for (const fn of [a.loadSlot, a.setTuner, a.toggleEffect, a.setEffectModel, a.setEffectKnob, a.updateAmp]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
})
