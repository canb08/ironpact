import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

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
      injectRegister: 'script',
      injectManifest: { globPatterns: ['**/*.{js,css,html,webmanifest}'] },
      manifest: {
        name: 'SPOTTER',
        short_name: 'SPOTTER',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0A0A0B',
        theme_color: '#0A0A0B',
      },
    }),
  ],
  test: { includeSource: ['scripts/secret-scan.mjs'] },
});
