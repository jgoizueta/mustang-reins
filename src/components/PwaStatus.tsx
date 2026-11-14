import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './ui'

/** Small notices about the installed app: ready to work offline, or a new version to load. */
export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (e) => console.warn('Service worker could not start', e),
  })
  const [hidden, setHidden] = useState(false)

  // "Ready offline" is good news and needs no reply: it goes away by itself.
  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 10000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  if (hidden || (!offlineReady && !needRefresh)) return null
  return (
    <div role="status" className="panel-surface fixed bottom-4 right-4 z-[60] flex max-w-sm items-center gap-3 p-3 text-sm shadow-2xl">
      {needRefresh ? (
        <>
          <span>A new version is available.</span>
          <Button variant="primary" className="h-8 rounded-md px-3 text-xs" onClick={() => void updateServiceWorker(true)}>Reload</Button>
          <Button variant="ghost" className="h-8 rounded-md px-3 text-xs" onClick={() => { setNeedRefresh(false); setHidden(true) }}>Later</Button>
        </>
      ) : (
        <>
          <span>Ready to work offline.</span>
          <Button variant="ghost" className="h-8 rounded-md px-3 text-xs" onClick={() => setOfflineReady(false)}>OK</Button>
        </>
      )}
    </div>
  )
}
