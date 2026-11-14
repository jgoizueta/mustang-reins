// Offline check of the built app (the PWA), in a real headless Chrome. Not part of `npm test`.
//
//   npm run build
//   npx vite preview --port 4173 --strictPort &
//   chrome --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/chrome-pwa about:blank &
//   node scripts/pwa-e2e.mjs http://localhost:4173 9333
//
// It installs the service worker, reloads, then STOPS the preview server (Chrome's own offline switch
// does not cover the service worker) and checks that the app still loads offline.
// Offline check of the built app: install the service worker, go offline, reload.
const [, , origin, debugPort] = process.argv
const base = `http://127.0.0.1:${debugPort}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const target = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const waiters = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  else waiters.slice().forEach((w) => w(m))
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const loaded = () => new Promise((res) => { const w = (m) => { if (m.method === 'Page.loadEventFired') { waiters.splice(waiters.indexOf(w), 1); res() } }; waiters.push(w) })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails))
  return r.result.result.value
}
const goto = async (url) => { const l = loaded(); await send('Page.navigate', { url }); await l; await sleep(1500) }
const reload = async () => { const l = loaded(); await send('Page.reload', { ignoreCache: false }); await l; await sleep(1500) }

const results = {}
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')

await goto(origin + '/')
results.titleOnline = await ev('document.title')
results.swState = await ev('navigator.serviceWorker.ready.then((r) => r.active && r.active.state)')
await sleep(1500)
await reload() // the first page is not controlled by the new service worker; the second is
results.controlled = await ev('!!navigator.serviceWorker.controller')
results.manifest = await ev("fetch('/manifest.webmanifest').then((r) => r.json()).then((m) => m.name + ' / ' + m.display)")
results.cachesAfterInstall = await ev('caches.keys()')

// Really offline: stop the web server too, because Chrome's offline switch does not cover the service worker's own requests.
import { execSync } from 'node:child_process'
execSync('pkill -f "vite preview --port 4173" || true')
await sleep(1000)
results.serverStopped = await fetch(origin + '/').then(() => false).catch(() => true)
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
await reload()
results.offlineTitle = await ev('document.title')
results.offlineHeading = await ev("document.querySelector('h1') && document.querySelector('h1').textContent")
results.offlineSlotRows = await ev("document.querySelectorAll('aside li, aside button').length > 5")
results.offlineHelpImage = await ev("fetch('/help/main.png').then((r) => r.status).catch((e) => 'FAIL')")
console.log(JSON.stringify(results, null, 2))
ws.close()
