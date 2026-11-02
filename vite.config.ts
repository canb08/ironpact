import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { copy } from './src/ui/copy.ts';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: 'script',
      injectManifest: { globPatterns: ['**/*.{js,css,html,webmanifest,png,woff2}'] },
      manifest: {
        id: '/',
        name: copy.appName,
        short_name: copy.appName,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0A0A0B',
        theme_color: '#0A0A0B',
        orientation: 'portrait',
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android enhancements only; the app never relies on shortcut support.
        shortcuts: [
          { name: copy.shortcutStartSession, url: '/session?start=1' },
          { name: copy.shortcutLogMin, url: '/?min=1' },
        ],
      },
    }),
  ],
  test: { includeSource: ['scripts/secret-scan.mjs'] },
});
