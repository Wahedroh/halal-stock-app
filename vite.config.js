import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { navigateFallbackDenylist: [/^\/__\//] },
      manifest: {
        name: 'พอร์ตหุ้นฮาลาล',
        short_name: 'พอร์ตหุ้น',
        lang: 'th',
        display: 'standalone',
        start_url: '/',
        theme_color: '#1e3a5f',
        background_color: '#fbf6ea',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
