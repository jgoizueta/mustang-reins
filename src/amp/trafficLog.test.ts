import { describe, expect, it } from 'vitest'
import { TrafficLog } from './trafficLog'

describe('TrafficLog', () => {
  it('assigns increasing ids and keeps packets', () => {
    const log = new TrafficLog()
    log.push('tx', '', new Uint8Array(64))
    log.push('info', 'Opened')
    const [a, b] = log.getSnapshot()
    expect(b.id).toBe(a.id + 1)
    expect(a.packet).toHaveLength(64)
    expect(b.text).toBe('Opened')
  })

  it('caps at 500 entries, keeping the newest', () => {
    const log = new TrafficLog()
    for (let i = 0; i < 600; i++) log.push('info', `line ${i}`)
    const entries = log.getSnapshot()
    expect(entries).toHaveLength(500)
    expect(entries[0].text).toBe('line 100')
    expect(entries[499].text).toBe('line 599')
  })

  it('clears and notifies listeners', () => {
    const log = new TrafficLog()
    let calls = 0
    log.subscribe(() => calls++)
    log.push('info', 'x')
    log.clear()
    expect(log.getSnapshot()).toHaveLength(0)
    expect(calls).toBe(2)
  })
})
