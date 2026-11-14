import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const THEME = '#111316'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Ask before swapping in a new version: the user may be in the middle of editing a preset.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mustang Reins',
        short_name: 'Mustang',
        description: 'Editor for Fender Mustang amplifiers over USB, in the browser.',
        theme_color: THEME,
        background_color: THEME,
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app itself, its fonts and help pictures are stored on install, so it starts offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: 'node' },
})
