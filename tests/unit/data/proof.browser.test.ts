import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';

// Explicit opt-in keeps npm test independent of browser downloads. CI's existing
// e2e lane owns browser installation; this probe is runnable against local Chromium.
describe.runIf(process.env.PROOF_BROWSER_TEST === '1')('Y8 browser offline flight', () => {
  let browser: Browser;
  let server: ChildProcess;
  beforeAll(async () => {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5184', '--strictPort'], { stdio: 'ignore', env: { ...process.env, VITE_BACKEND: 'mock' } });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await fetch('http://127.0.0.1:5184').then((r) => r.ok).catch(() => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ executablePath: process.env.PROOF_CHROMIUM_PATH, args: ['--no-sandbox'] });
  }, 30_000);
  afterAll(async () => { await browser?.close(); server?.kill(); });
  it('re-encodes a real image, persists offline, reconnects once, and deletes the file', async () => {
    const context = await browser.newContext();
    const page = await context.newPage(); await page.goto('http://127.0.0.1:5184');
    await page.evaluate("import('/src/data/proof.harness.ts').then(m => m.setup())");
    await context.setOffline(true);
    const offline = await page.evaluate<{ uploads: number; type: string; width: number; height: number; bytes: number }>("import('/src/data/proof.harness.ts').then(m => m.queueOffline())");
    expect(offline).toMatchObject({ uploads: 0, type: 'image/jpeg', width: 1600, height: 1200 });
    expect(offline.bytes).toBeLessThanOrEqual(400_000);
    await context.setOffline(false);
    const result = await page.evaluate("import('/src/data/proof.harness.ts').then(m => m.reconnect())");
    expect(result).toEqual({ uploads: 1, serverPhotos: 1, pending: 0, removedFromStorage: true });
    await context.close();
  }, 30_000);
});
