// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from './App'

// jsdom lacks a few browser APIs that Radix uses.
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('App layout', () => {
  it('toggles the right-side Library column with the header button', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Open Library'))
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeTruthy()
    await user.click(screen.getByTitle('Close'))
    expect(screen.queryByRole('heading', { name: 'Library' })).toBeNull()
  })

  it('has no Local Library section in the sidebar', () => {
    render(<App />)
    expect(screen.getByText('Active Preset')).toBeTruthy()
    expect(screen.getByText('Amp Slots')).toBeTruthy()
    expect(screen.queryByText('Local Library')).toBeNull()
  })
  it('collapses the sidebar to a rail with an Expand Sidebar button', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('Active Preset')).toBeTruthy()
    await user.click(screen.getByTitle('Collapse Sidebar'))
    expect(screen.queryByText('Active Preset')).toBeNull()
    expect(screen.getByTitle('Expand Sidebar')).toBeTruthy()
    await user.click(screen.getByTitle('Expand Sidebar'))
    expect(screen.getByText('Active Preset')).toBeTruthy()
  })
})
