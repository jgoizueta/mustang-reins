// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { newPreset, type Preset } from '../protocol/preset'
import { EffectPanel } from './EffectPanel'

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

const fxOf = (model: number) => ({ ...newPreset('x').effects.stomp, model })

const renderPanel = (fx: Preset['effects']['stomp'], isV2: boolean) =>
  render(<EffectPanel family="stomp" fx={fx} isV2={isV2}
    onModel={() => {}} onKnob={() => {}} onToggle={() => {}} onMove={() => {}} />)

describe('EffectPanel v2-only models', () => {
  it('shows a warning and "Not on this amp" hint for a v2-only current model on v1', () => {
    renderPanel(fxOf(259), false) // Ranger Boost is v2-only
    expect(screen.getByText('This effect needs a Mustang v2.')).toBeTruthy()
    expect(screen.getByText('(Not on this amp)')).toBeTruthy()
  })

  it('does not warn for a normal model or on a v2 amp', () => {
    renderPanel(fxOf(259), true)
    expect(screen.queryByText('This effect needs a Mustang v2.')).toBeNull()
    cleanup()
    renderPanel(fxOf(136), false) // Simple Comp exists on v1
    expect(screen.queryByText('This effect needs a Mustang v2.')).toBeNull()
    expect(screen.queryByText('(Not on this amp)')).toBeNull()
  })
})
