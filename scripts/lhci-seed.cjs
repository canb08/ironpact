'use strict';

// Node host (URL, module) plus the page callbacks (localStorage, indexedDB).
// eslint.config.js only attaches Node globals to js/mjs, not cjs.
/* global URL, console, setTimeout, module, localStorage, location, indexedDB */

/**
 * LHCI puppeteerScript. Runs once per URL, before Lighthouse navigates.
 *
 * A non-standalone browser is sent to /install until `ironpact.install-dismissed`
 * is set (AuthGate). The mock backend signs in as the seeded crew owner in
 * memory — there is no localStorage session key — and the crew lands in
 * IndexedDB (`ironpact`) only after the first pull. Lighthouse 12's default
 * storage reset clears the HTTP cache and service worker, not localStorage or
 * IndexedDB, so this page's storage is what the audit navigation sees.
 *
 * No production switch skips the gate. This file is CI-only.
 *
 * @param {import('puppeteer-core').Browser} browser
 * @param {{url: string}} context
 */
async function seed(browser, context) {
  const target = new URL(context.url);
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  try {
    await page.evaluateOnNewDocument((key) => {
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* private mode: the gate stays up and the audit will fail closed */
      }
    }, 'ironpact.install-dismissed');

    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const primed = await waitForCrew(page);
    if (new URL(page.url()).pathname !== target.pathname) {
      await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await page.waitForFunction(
      (expected) => location.pathname === expected,
      { timeout: 20_000 },
      target.pathname,
    );
    const path = new URL(page.url()).pathname;
    console.log(`lhci seed ${target.pathname} -> ${path} crew=${primed}`);
    if (path !== target.pathname) {
      throw new Error(`lhci seed left ${target.pathname} on ${path}`);
    }
  } finally {
    await page.close();
  }
}

/**
 * Opens IndexedDB only after the app has created it. An early open() would
 * create an empty database and block Dexie's schema.
 * @param {import('puppeteer-core').Page} page
 * @return {Promise<number>}
 */
async function waitForCrew(page) {
  const deadline = Date.now() + 25_000;
  let last = 0;
  while (Date.now() < deadline) {
    last = await page.evaluate(async () => {
      if (typeof indexedDB.databases !== 'function') return 0;
      const known = await indexedDB.databases();
      if (!known.some((entry) => entry.name === 'ironpact')) return 0;
      const open = indexedDB.open('ironpact');
      /** @type {IDBDatabase} */
      const db = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error('indexedDB.open failed'));
      });
      try {
        if (!db.objectStoreNames.contains('crew_members') || !db.objectStoreNames.contains('profiles')) return 0;
        const count = (store) => new Promise((resolve, reject) => {
          const request = db.transaction(store, 'readonly').objectStore(store).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error(`count ${store} failed`));
        });
        const crew = await count('crew_members');
        const profiles = await count('profiles');
        return crew > 0 && profiles > 0 ? crew : 0;
      } finally {
        db.close();
      }
    });
    if (last > 0) return last;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`lhci seed: mock crew never landed in IndexedDB (last count ${last})`);
}

module.exports = seed;
