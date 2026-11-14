// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { newPreset, samePreset } from '../protocol/preset'
import { LibraryStore, memoryBackend, DEFAULT_COLLECTION_NAME } from '../library/store'
import { LibraryPanel } from './LibraryPanel'

// jsdom lacks a few browser APIs that Radix uses.
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

const makeStore = async () => {
  const store = new LibraryStore(memoryBackend())
  await store.ready
  return store
}

const renderPanel = async (props: Partial<Parameters<typeof LibraryPanel>[0]> = {}, store?: LibraryStore) => {
  const s = store ?? await makeStore()
  render(<LibraryPanel current={newPreset('Now')} onLoad={() => {}} activeId={null} onMark={() => {}} onClose={() => {}} store={s} {...props} />)
  return s
}

describe('LibraryPanel', () => {
  it('shows ALL plus a chip per collection with counts', async () => {
    const store = await makeStore()
    const c = store.addCollection('Gigs')!
    store.add(c.id, [newPreset('a'), newPreset('b')])
    store.add(store.defaultCollectionId()!, [newPreset('c')])
    await renderPanel({}, store)
    expect(await screen.findByText(`ALL · 3`)).toBeTruthy()
    expect(screen.getByText(`GIGS · 2`)).toBeTruthy()
    expect(screen.getByText(`${DEFAULT_COLLECTION_NAME.toUpperCase()} · 1`)).toBeTruthy()
  })

  it('creates a collection via the + chip', async () => {
    const user = userEvent.setup()
    const store = await renderPanel()
    await user.click(screen.getByTitle('New collection'))
    await user.type(screen.getByPlaceholderText('Collection name'), 'Stage{Enter}')
    await waitFor(() => expect(store.getSnapshot().collections.some((c) => c.name === 'Stage')).toBe(true))
  })

  it('filters entries by the search box (name, author)', async () => {
    const store = await makeStore()
    const p = newPreset('Blues Rider')
    p.fuseInfo = { author: 'Stevie' }
    store.add(store.defaultCollectionId()!, [p, newPreset('Metal Zone')])
    await renderPanel({}, store)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Search presets...'), 'stevie')
    expect(await screen.findByText('Blues Rider')).toBeTruthy()
    expect(screen.queryByText('Metal Zone')).toBeNull()
  })

  it('loads a preset on click and highlights the active row', async () => {
    const store = await makeStore()
    const [e] = store.add(store.defaultCollectionId()!, [newPreset('Click me')])
    const onLoad = vi.fn()
    const user = userEvent.setup()
    await renderPanel({ onLoad, activeId: e.id }, store)
    await user.click(await screen.findByText('Click me'))
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ name: 'Click me' }), e.id)
  })

  it('shows the collection name on rows in the ALL view', async () => {
    const store = await makeStore()
    const c = store.addCollection('Gigs')!
    store.add(c.id, [newPreset('a')])
    await renderPanel({}, store)
    await screen.findByText('a')
    expect(screen.getByText('Gigs')).toBeTruthy()
  })

  it('highlights the overwrite icon when the editor differs from the active entry', async () => {
    const store = await makeStore()
    const p = newPreset('Same')
    const [e] = store.add(store.defaultCollectionId()!, [p])
    const changed = newPreset('Same')
    changed.amp.gain = (changed.amp.gain + 1) % 256
    await renderPanel({ activeId: e.id, current: changed }, store)
    const btn = await screen.findByTitle('Overwrite with current settings')
    expect(btn.className).toContain('text-primary')
    expect(samePreset(changed, e.preset)).toBe(false)
  })

  it('deletes a collection after confirm but never My Presets', async () => {
    const store = await makeStore()
    const c = store.addCollection('Temp')!
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    // Select the collection chip, open its menu, delete.
    render(<LibraryPanel current={newPreset('x')} onLoad={() => {}} activeId={null} onMark={() => {}} onClose={() => {}} store={store} />)
    await user.click(await screen.findByText('TEMP · 0'))
    await user.click(screen.getByTitle('Collection actions'))
    await user.click(await screen.findByText('Delete'))
    await waitFor(() => expect(store.getSnapshot().collections.some((x) => x.id === c.id)).toBe(false))

    // My Presets has no Delete menu item.
    await user.click(await screen.findByText(`${DEFAULT_COLLECTION_NAME.toUpperCase()} · 0`))
    await user.click(screen.getByTitle('Collection actions'))
    expect(screen.queryByText('Delete')).toBeNull()
    expect(screen.getByText('Rename')).toBeTruthy()
  })

  it('adds the current preset from the empty state', async () => {
    const store = await makeStore()
    const onMark = vi.fn()
    const user = userEvent.setup()
    render(<LibraryPanel current={newPreset('Now')} onLoad={() => {}} activeId={null} onMark={onMark} onClose={() => {}} store={store} />)
    expect(await screen.findByText(/No presets yet/)).toBeTruthy()
    await user.click(screen.getByText('Add the current preset'))
    expect(store.getSnapshot().entries[0].preset.name).toBe('Now')
    expect(onMark).toHaveBeenCalled()
  })

  it('offers the four add actions in the + menu', async () => {
    const user = userEvent.setup()
    await renderPanel()
    await user.click(screen.getByTitle('Add to library'))
    expect(await screen.findByText('New Preset')).toBeTruthy()
    expect(screen.getByText('Current Preset')).toBeTruthy()
    expect(screen.getByText('Import Files…')).toBeTruthy()
    expect(screen.getByText('Import Folder…')).toBeTruthy()
  })
})

describe('banks', () => {
  const bankStore = async () => {
    const store = await makeStore()
    const bank = store.addBank('Gig', 24)
    store.putAt(bank.id, 0, newPreset('Opener'))
    store.putAt(bank.id, 5, newPreset('Fill'))
    return { store, bank }
  }

  it('shows a bank chip with filled/size and a grid icon', async () => {
    const { store, bank } = await bankStore()
    await renderPanel({}, store)
    expect(screen.getByText('GIG · 2/24')).toBeTruthy()
    expect(bank.bank!.size).toBe(24)
  })

  it('bank view shows every position, empty ones marked, and puts the current preset in an empty slot', async () => {
    const user = userEvent.setup()
    const { store, bank } = await bankStore()
    const onMark = vi.fn()
    await renderPanel({ onMark }, store)
    await user.click(screen.getByText('GIG · 2/24'))
    expect(screen.getByText('Opener')).toBeTruthy()
    expect(screen.getByText('Fill')).toBeTruthy()
    expect(screen.getAllByText('Empty')).toHaveLength(22)
    const putButtons = screen.getAllByTitle('Put the current preset here')
    await user.click(putButtons[0]) // first empty position: 1
    expect(store.entryAt(bank.id, 1)!.preset.name).toBe('Now')
    expect(onMark).toHaveBeenCalledWith(store.entryAt(bank.id, 1)!.id)
  })

  it('swap handler moves an entry to another position', async () => {
    const { store, bank } = await bankStore()
    await renderPanel({}, store)
    store.swap(bank.id, 0, 10)
    expect(store.entryAt(bank.id, 10)!.preset.name).toBe('Opener')
    expect(store.entryAt(bank.id, 0)).toBeUndefined()
  })

  it('bank chip menu offers export and write items only for banks', async () => {
    const user = userEvent.setup()
    const { store, bank } = await bankStore()
    const restore = vi.fn().mockResolvedValue(undefined)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await renderPanel({
      amp: { connected: true, slotCount: 24, isV2: true, backupSlots: vi.fn(), restoreSlots: restore },
    }, store)
    await user.click(screen.getByText('GIG · 2/24'))
    await user.click(screen.getByTitle('Collection actions'))
    expect(screen.getByText('Export .zip')).toBeTruthy()
    expect(screen.getByText('Export ORG as 8-bank')).toBeTruthy()
    await user.click(screen.getByText('Write to amp: all 24 slots'))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Overwrite 2 amp slots'))
    expect(restore).not.toHaveBeenCalled() // declined
    confirmSpy.mockRestore()
    // A normal collection chip has no bank items
    const plain = store.addCollection('Plain')!
    store.add(plain.id, [newPreset('x')])
    cleanup()
    await renderPanel({}, store)
    await user.click(screen.getByText('PLAIN · 1'))
    await user.click(screen.getByTitle('Collection actions'))
    expect(screen.queryByText('Export .zip')).toBeNull()
    expect(screen.queryByText(/Write to amp/)).toBeNull()
    expect(bank.bank).toBeTruthy()
  })

  it('Back up amp reads slots into a new bank with progress', async () => {
    const user = userEvent.setup()
    const store = await renderPanel({
      amp: {
        connected: true, slotCount: 24, isV2: true,
        backupSlots: vi.fn(async (slots: number[], progress?: (d: number, t: number) => void) => {
          progress?.(slots.length, slots.length)
          return slots.map((slot) => ({ slot, preset: newPreset(`Amp ${slot}`) }))
        }),
        restoreSlots: vi.fn(),
      },
    }, await makeStore())
    await user.click(screen.getByTitle('Add to library'))
    await user.click(screen.getByText('Back up amp'))
    await waitFor(() => expect(store.getSnapshot().collections.some((c) => c.bank && c.name.startsWith('Backup '))).toBe(true))
    const bank = store.getSnapshot().collections.find((c) => c.bank && c.name.startsWith('Backup '))!
    expect(store.entryAt(bank.id, 23)!.preset.name).toBe('Amp 23')
  })
})
