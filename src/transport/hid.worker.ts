// Owns the HID device so report I/O never blocks the UI thread.
// The main thread must call navigator.hid.requestDevice() first (a worker cannot show the chooser).
import { DEVICES, VENDOR_ID } from '../protocol/packets'

interface WorkerScope {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
}
const ctx = self as unknown as WorkerScope

const productIds = DEVICES.map((d) => d.productId)
let device: HIDDevice | null = null

const isMustang = (d: HIDDevice) => d.vendorId === VENDOR_ID && productIds.includes(d.productId)

async function open(): Promise<number> {
  const found = (await navigator.hid.getDevices()).find(isMustang)
  if (!found) throw new Error('No authorised WebHID device found. Authorise it on the main thread first.')
  if (!found.opened) await found.open()
  device = found
  found.addEventListener('inputreport', (e) => {
    ctx.postMessage({ type: 'packet', data: new Uint8Array(e.data.buffer.slice(0)) })
  })
  return found.productId
}

ctx.addEventListener('message', async (e) => {
  const { type, id, data } = e.data as { type: 'open' | 'close' | 'send'; id: number; data?: number[] }
  try {
    if (type === 'open') {
      const productId = await open()
      ctx.postMessage({ type: 'response', id, success: true, productId })
    } else if (type === 'close') {
      if (device) await device.close()
      device = null
      ctx.postMessage({ type: 'response', id, success: true })
    } else if (type === 'send') {
      if (!device) throw new Error('Not connected')
      await device.sendReport(0, new Uint8Array(data ?? []))
      ctx.postMessage({ type: 'response', id, success: true })
    }
  } catch (err) {
    ctx.postMessage({ type: 'response', id, success: false, error: (err as Error).message })
  }
})
