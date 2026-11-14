// Rebuilds the app icons in public/ from the artwork design/mustang-reins.png.
// Uses headless Chrome + canvas (no image dependencies). Usage:
//
//   node scripts/make-icons.mjs
//
// Set CHROME to a different browser binary if needed. Writes:
//   public/icon-192.png, public/icon-512.png       rounded square (rx = 21.875%), transparent corners
//   public/apple-touch-icon.png                    180x180, full bleed, no rounding
//   public/icon-maskable-512.png                   full bleed, artwork centred at MASKABLE_SCALE,
//                                                  margins filled (red top/bottom, edge columns stretched)
//   public/icon.svg                                favicon: rounded-rect clipPath + embedded 256px PNG
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const ART = join(ROOT, 'design', 'mustang-reins.png')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MASKABLE_SCALE = 0.76 // share of the canvas the artwork covers; keep "M".."G" inside the safe circle

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'chrome-icons-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'])
let wsUrl = ''
chrome.stderr.on('data', (d) => {
  const m = /DevTools listening on (ws:\/\/\S+)/.exec(d.toString())
  if (m) wsUrl = m[1]
})
for (let i = 0; i < 100 && !wsUrl; i++) await sleep(100)
if (!wsUrl) throw new Error('Chrome did not start')
const debugPort = new URL(wsUrl).port

const art64 = readFileSync(ART).toString('base64')
const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails))
  return r.result.result.value
}

const out = await ev(`(async () => {
  const SCALE = ${MASKABLE_SCALE}
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,${art64}' })
  const mk = (s) => { const c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; return [c, x] }
  const b64 = (c) => c.toDataURL('image/png').split(',')[1]

  // Sample the background red near the top-left corner (a few px in, off the edge).
  {
    const [c, x] = mk(img.width)
    x.drawImage(img, 0, 0)
    var bg = Array.from(x.getImageData(3, 3, 1, 1).data.slice(0, 3))
  }
  const bgCss = 'rgb(' + bg.join(',') + ')'
  const roundRect = (x, s, r) => {
    x.beginPath()
    if (x.roundRect) x.roundRect(0, 0, s, s, r)
    else x.rect(0, 0, s, s)
  }
  const rounded = (s) => {
    const [c, x] = mk(s)
    roundRect(x, s, s * 0.21875)
    x.clip()
    x.drawImage(img, 0, 0, s, s)
    return c
  }
  const flat = (s) => {
    const [c, x] = mk(s)
    x.drawImage(img, 0, 0, s, s)
    return c
  }

  // Maskable: red fill, artwork centred at SCALE, side margins = stretched outermost pixel columns.
  const maskable = (() => {
    const s = 512, w = Math.round(s * SCALE), m = Math.round((s - w) / 2)
    const [c, x] = mk(s)
    x.fillStyle = bgCss
    x.fillRect(0, 0, s, s)
    x.drawImage(img, 0, 0, 1, img.height, 0, m, m, w)                                   // left edge column
    x.drawImage(img, img.width - 1, 0, 1, img.height, m + w, m, s - m - w, w)           // right edge column
    x.drawImage(img, m, m, w, w)
    return c
  })()

  return {
    bg: bgCss,
    scale: SCALE,
    icon192: b64(rounded(192)),
    icon512: b64(rounded(512)),
    apple180: b64(flat(180)),
    maskable512: b64(maskable),
    svg256: b64(flat(256)),
  }
})()`)

const write = (name, b64) => {
  const p = join(ROOT, 'public', name)
  const buf = Buffer.from(b64, 'base64')
  writeFileSync(p, buf)
  console.log(name, buf.length, 'bytes')
}
write('icon-192.png', out.icon192)
write('icon-512.png', out.icon512)
write('apple-touch-icon.png', out.apple180)
write('icon-maskable-512.png', out.maskable512)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath>
  <image width="512" height="512" clip-path="url(#r)" href="data:image/png;base64,${out.svg256}"/>
</svg>
`
writeFileSync(join(ROOT, 'public', 'icon.svg'), svg)
console.log('icon.svg', Buffer.byteLength(svg), 'bytes')
console.log('background:', out.bg, '| maskable scale:', out.scale)

ws.close()
chrome.kill()
await new Promise((r) => chrome.on('exit', r))
rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
