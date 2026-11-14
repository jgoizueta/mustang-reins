// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NOTE_NAMES, TunerOverlay } from './TunerOverlay'

afterEach(cleanup)

describe('TunerOverlay', () => {
  it('shows a dash until the amp reports a pitch', () => {
    render(<TunerOverlay tuner={{ note: 0, cents: 0, reading: false }} onClose={() => {}} />)
    expect(screen.getByTestId('tuner-note').textContent).toBe('-')
  })

  it('names the note counted from A and places the needle by cents', () => {
    render(<TunerOverlay tuner={{ note: 7, cents: -20, reading: true }} onClose={() => {}} />)
    expect(screen.getByTestId('tuner-note').textContent).toBe('E')
    expect(screen.getByTestId('tuner-needle').style.left).toBe('30%')
    expect(screen.getByTestId('tuner-needle').className).not.toContain('bg-green-500')
  })

  it('turns green within 5 cents and keeps the needle on the meter', () => {
    const { rerender } = render(<TunerOverlay tuner={{ note: 3, cents: 4, reading: true }} onClose={() => {}} />)
    expect(screen.getByTestId('tuner-needle').className).toContain('bg-green-500')
    rerender(<TunerOverlay tuner={{ note: 3, cents: 127, reading: true }} onClose={() => {}} />)
    expect(screen.getByTestId('tuner-needle').style.left).toBe('100%')
  })

  it('closes from the button', async () => {
    const onClose = vi.fn()
    render(<TunerOverlay tuner={{ note: 0, cents: 0, reading: true }} onClose={onClose} />)
    await userEvent.click(screen.getByTitle('Close tuner'))
    expect(onClose).toHaveBeenCalled()
  })

  it('has twelve note names starting at A', () => {
    expect(NOTE_NAMES).toHaveLength(12)
    expect(NOTE_NAMES[0]).toBe('A')
  })
})
