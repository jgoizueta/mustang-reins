// Update check of the built app, in a real headless Chrome. Not part of `npm test`.
// Run it twice around a rebuild:
//   node scripts/pwa-update-e2e.mjs install http://localhost:4173 9333   (with the first build served)
//   ...change the app, `npm run build`...
//   node scripts/pwa-update-e2e.mjs update  http://localhost:4173 9333   (same Chrome and profile)
// "install" installs the service worker. "update" reloads, waits for the "new version" notice, clicks Reload,
// and checks that the page then runs the new build.
const [, , phase, origin, debugPort] = process.argv
const base = `http://127.0.0.1:${debugPort}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch(`${base}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && t.url.startsWith(origin)) ?? (await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json())
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const waiters = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } else waiters.slice().forEach((w) => w(m))
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const loaded = () => new Promise((res) => { const w = (m) => { if (m.method === 'Page.loadEventFired') { waiters.splice(waiters.indexOf(w), 1); res() } }; waiters.push(w) })
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value
const goto = async (url) => { const l = loaded(); await send('Page.navigate', { url }); await l }
const reload = async () => { const l = loaded(); await send('Page.reload'); await l }
const script = () => ev("document.querySelector('script[type=module]').getAttribute('src')")
await send('Page.enable'); await send('Runtime.enable')
const results = { phase }

if (phase === 'install') {
  await goto(origin + '/')
  await ev('navigator.serviceWorker.ready.then(() => true)')
  await sleep(1500)
  await reload()
  await sleep(1500)
  results.bundle = await script()
  results.controlled = await ev('!!navigator.serviceWorker.controller')
} else {
  results.bundleBefore = await script()
  const t0 = Date.now()
  await reload()
  let banner = null
  while (Date.now() - t0 < 20000 && !banner) {
    banner = await ev(`(() => { const n = document.querySelector('[role=status]'); if (!n) return null; const r = n.getBoundingClientRect(); return { text: n.textContent, right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) } })()`)
    if (!banner) await sleep(300)
  }
  results.bannerAfterMs = banner ? Date.now() - t0 : null
  results.banner = banner
  if (banner) {
    await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reload').click()`)
    await sleep(4000)
    results.bundleAfter = await script()
    results.updated = results.bundleAfter !== results.bundleBefore
  }
}
console.log(JSON.stringify(results, null, 2))
ws.close()
