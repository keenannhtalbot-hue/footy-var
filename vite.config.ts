import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'FootyVAR — Sideline Referee',
        short_name: 'FootyVAR',
        description: 'VAR + speed tracking for sideline soccer. Goal-line camera, body-camera kick speed, penalty shootout.',
        theme_color: '#0a4d2a',
        background_color: '#0a1f12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Cache images and MediaPipe models aggressively
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: ({ url }) => url.hostname.includes('googleapis.com') || url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('storage.googleapis.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-models',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  // MediaPipe needs cross-origin isolation for SharedArrayBuffer (faster WASM)
  // We DON'T enable this in dev to keep things simple, but prod gets it via COOP/COEP headers
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision']
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'mediapipe': ['@mediapipe/tasks-vision']
        }
      }
    }
  }
});
