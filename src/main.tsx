import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The cloud preset archive is gone: drop its caches from installed PWAs (up to ~42 MB after "Save all").
if (typeof caches !== 'undefined') {
  try {
    void caches.delete('library-index')
    void caches.delete('library-presets')
  } catch { /* ignore */ }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
