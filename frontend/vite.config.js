import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'notification-icon.png', 'og-default.png'],
      manifest: {
        name: 'Saúde Pet',
        short_name: 'Saúde Pet',
        description: 'Cuidado veterinário mais próximo, humano e conectado.',
        lang: 'pt-BR',
        theme_color: '#159fa3',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // As artes do blog ficam fora do precache: cada visitante baixaria a
        // pasta inteira ao instalar o SW, e os PNGs editoriais passam dos 2 MiB
        // do workbox — o que derruba o `vite build`, e com ele o deploy.
        globIgnores: ['**/blog-media/**'],
        // Web Push: o SW gerado importa o handler de push/notificationclick.
        importScripts: ['push-sw.js'],
        // O service worker respondia `index.html` para QUALQUER navegação — e uma
        // ida ao `/api/v1/auth/google`, que é navegação de verdade (um `<a href>`
        // que sai do app), caía nessa regra. Resultado: a página ficava em branco
        // e o navegador oferecia baixar `google.txt`, que é o corpo em texto do
        // 302 do Express, em vez de seguir o redirecionamento até o Google.
        //
        // Tudo sob `/api/` sai da regra e vai direto para a rede, que é onde o
        // navegador sabe seguir redirecionamento sozinho.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300 // 5 minutos
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
