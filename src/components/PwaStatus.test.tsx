// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = { offlineReady: false, needRefresh: false }
const setOfflineReady = vi.fn()
const setNeedRefresh = vi.fn()
const updateServiceWorker = vi.fn()

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [state.offlineReady, setOfflineReady],
    needRefresh: [state.needRefresh, setNeedRefresh],
    updateServiceWorker,
  }),
}))

import { PwaStatus } from './PwaStatus'

beforeEach(() => {
  state.offlineReady = false
  state.needRefresh = false
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('PwaStatus', () => {
  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<PwaStatus />)
    expect(container.textContent).toBe('')
  })

  it('says when the app is ready to work offline', async () => {
    state.offlineReady = true
    render(<PwaStatus />)
    expect(screen.getByText('Ready to work offline.')).toBeTruthy()
    await userEvent.click(screen.getByText('OK'))
    expect(setOfflineReady).toHaveBeenCalledWith(false)
  })

  it('offers a new version, and reloads into it only when asked', async () => {
    state.needRefresh = true
    render(<PwaStatus />)
    expect(screen.getByText('A new version is available.')).toBeTruthy()
    expect(updateServiceWorker).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Reload'))
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('can be put off until later', async () => {
    state.needRefresh = true
    const { container } = render(<PwaStatus />)
    await userEvent.click(screen.getByText('Later'))
    expect(setNeedRefresh).toHaveBeenCalledWith(false)
    expect(container.textContent).toBe('')
  })
})
