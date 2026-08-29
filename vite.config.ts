import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // Se actualiza sola cuando haces cambios
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Vía Live Jujuy',
        short_name: 'VíaLive',
        description: 'Monitor Industrial de Tráfico',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone', // Obliga al celular a abrirla como App (sin barra superior)
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
