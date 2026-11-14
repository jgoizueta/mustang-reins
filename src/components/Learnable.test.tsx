// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MidiMapping, MidiTarget } from '../midi/learn'
import { Learnable } from './Learnable'

afterEach(cleanup)

const target: MidiTarget = { kind: 'amp', key: 'gain' }
const mapping: MidiMapping = { channel: 1, cc: 16, target }

describe('Learnable', () => {
  it('learn off: the child gets the click', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Learnable target={target} learn={{ active: false, armed: null }}>
      <button onClick={onClick}>knob</button>
    </Learnable>)
    await user.click(screen.getByText('knob'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('learn on: the overlay arms the target and the child is not clicked', async () => {
    const onClick = vi.fn()
    const onArm = vi.fn()
    const user = userEvent.setup()
    render(<Learnable target={target} learn={{ active: true, armed: null }} onArm={onArm}>
      <button onClick={onClick}>knob</button>
    </Learnable>)
    await user.click(screen.getByTitle('Amp Gain'))
    expect(onArm).toHaveBeenCalledWith(target)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows the CC badge when mapped', () => {
    render(<Learnable target={target} learn={{ active: true, armed: null }} mapping={mapping}>
      <button>knob</button>
    </Learnable>)
    expect(screen.getByText('CC 16')).toBeTruthy()
  })
})
