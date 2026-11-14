// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AmpSelect } from './AmpSelect'

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

const V2_ONLY = ['Studio Preamp', "Fender '57 Twin", "Fender '60s Thrift", 'British Colour', 'British Watts']

describe('AmpSelect', () => {
  it('hides the v2-only amp models on a v1 amp', async () => {
    const user = userEvent.setup()
    render(<AmpSelect model={117} isV2={false} onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    for (const name of V2_ONLY) expect(screen.queryByText(name)).toBeNull()
    expect(screen.getByText("Fender '65 Deluxe Reverb")).toBeTruthy()
    expect(screen.queryByText(/needs a Mustang v2/)).toBeNull()
  })

  it('shows all models on a v2 amp', async () => {
    const user = userEvent.setup()
    render(<AmpSelect model={117} isV2 onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    for (const name of V2_ONLY) expect(screen.getByText(name)).toBeTruthy()
  })

  it('keeps a v2-only current model visible with "Not on this amp" and a warning', () => {
    render(<AmpSelect model={246} isV2={false} onChange={() => {}} />)
    expect(screen.getByText("Fender '57 Twin")).toBeTruthy()
    expect(screen.getByText('(Not on this amp)')).toBeTruthy()
    expect(screen.getByText('This amp model needs a Mustang v2. Your amp plays it as Off.')).toBeTruthy()
  })

  it('calls onChange with the chosen model', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AmpSelect model={117} isV2={false} onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Off'))
    expect(onChange).toHaveBeenCalledWith('0')
  })
})
