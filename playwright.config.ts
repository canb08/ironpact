import { defineConfig, devices } from '@playwright/test';

const port = 5173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'p[0-9]-*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['./tests/e2e/flight-reporter.ts']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, VITE_BACKEND: 'mock' },
  },
  projects: [
    { name: 'iPhone 15', use: { ...devices['iPhone 15'] } },
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
  ],
});
