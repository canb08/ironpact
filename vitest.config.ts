import { mergeConfig, defineConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ['./vitest.setup.ts'],
      coverage: {
        enabled: true,
        provider: 'v8',
        include: ['src/core/**', 'supabase/functions/_shared/**'],
        reporter: ['text', 'json-summary', 'html'],
        thresholds: {
          'src/core/**': { lines: 95 },
          'supabase/functions/_shared/**': { lines: 95 },
        },
      },
    },
  }),
);
