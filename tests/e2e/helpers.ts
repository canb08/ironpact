import { expect, type Page } from '@playwright/test';
import { copy, fill } from '../../src/ui/copy.ts';

export interface MirrorCounts {
  sets: number;
  ackedSets: number;
  uniqueSets: number;
  pending: number;
  dead: number;
}

/** Rows the fresh page's mock accepted: it writes `updated_at` back onto the mirror. */
export async function mirrorCounts(page: Page): Promise<MirrorCounts> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open('ironpact');
      request.onerror = () => { reject(request.error ?? new Error('indexedDB')); };
      request.onsuccess = () => { resolve(request.result); };
    });
    const read = (store: string) => new Promise<unknown[]>((resolve, reject) => {
      if (!db.objectStoreNames.contains(store)) { resolve([]); return; }
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => { resolve(req.result as unknown[]); };
      req.onerror = () => { reject(req.error ?? new Error(store)); };
    });
    const sets = await read('sets') as Array<{ id?: string; updated_at?: string; deleted_at?: string | null }>;
    const outbox = await read('outbox') as Array<{ status?: string }>;
    db.close();
    const live = sets.filter((row) => row.deleted_at == null);
    const ids = new Set(live.map((row) => row.id).filter((id): id is string => typeof id === 'string'));
    return {
      sets: live.length,
      ackedSets: live.filter((row) => typeof row.updated_at === 'string').length,
      uniqueSets: ids.size,
      pending: outbox.filter((row) => row.status === 'pending').length,
      dead: outbox.filter((row) => row.status === 'dead').length,
    };
  });
}

export async function reachFloor(page: Page): Promise<void> {
  const today = page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Today, exact: true });
  if (await today.isVisible()) await today.click();
  else await page.goto('/');
  await expect.poll(async () => {
    const install = page.getByRole('link', { name: copy.installContinue });
    if (await install.isVisible()) await install.click();
    const path = new URL(page.url()).pathname;
    if (path === '/crew/new' || path === '/sign-in') await page.goto('/');
    return page.getByTestId('shared-bar').isVisible();
  }, { timeout: 20_000 }).toBe(true);
  await page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Today, exact: true }).click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
}

/** Pull finishes after the profile that paints the floor. Bench has to be local before airplane mode. */
export async function waitForBench(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open('ironpact');
      request.onerror = () => { reject(request.error ?? new Error('indexedDB')); };
      request.onsuccess = () => { resolve(request.result); };
    });
    if (!db.objectStoreNames.contains('exercises')) { db.close(); return false; }
    const names = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction('exercises', 'readonly');
      const req = tx.objectStore('exercises').getAll();
      req.onsuccess = () => { resolve((req.result as Array<{ name?: string }>).map((row) => row.name ?? '')); };
      req.onerror = () => { reject(req.error ?? new Error('exercises')); };
    });
    db.close();
    return names.includes('Bench press');
  }), { timeout: 20_000 }).toBe(true);
}

/** Lazy routes 404 while offline, so visit them once while the dev server is reachable. */
export async function warmLazyRoutes(page: Page): Promise<void> {
  await page.getByRole('link', { name: copy.x3WeighIn, exact: true }).click();
  await expect(page.getByRole('dialog', { name: copy.x3WeighIn })).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('shared-bar')).toBeVisible();

  await page.getByRole('link', { name: copy.x3Min, exact: true }).click();
  await expect(page.getByRole('dialog', { name: copy.x3Min })).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('shared-bar')).toBeVisible();

  await page.locator('.app-shell__header').getByRole('link', { name: copy.settings, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.settingsTitle })).toBeVisible();
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();

  await page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Train, exact: true }).click();
  await expect(page.getByRole('dialog', { name: copy.pickerTitle })).toBeVisible();
  await page.getByRole('dialog', { name: copy.pickerTitle }).getByRole('button', { name: copy.close, exact: true }).click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
}

/** Let the real resize observer and two-frame reveal finish before browsing history or capturing. */
export async function settleSessionDock(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 3; frame++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const row = document.querySelector('[data-current-exercise] .session-ghost');
    const dock = document.querySelector('[data-session-dock]');
    if (!row || !dock) return Infinity;
    const max = document.documentElement.scrollHeight - innerHeight;
    const target = Math.max(0, Math.min(max, scrollY + row.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 12));
    return Math.abs(scrollY - target);
  })).toBeLessThanOrEqual(1);
}

/** Zoom/focus can defer the dock's flow-layout switch beyond click's two stable frames. */
async function settleDockLayout(page: Page): Promise<void> {
  await expect.poll(() => page.locator('[data-session-dock]').evaluate(async (dock) => {
    const boxes = [dock.getBoundingClientRect()];
    for (let frame = 0; frame < 3; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      boxes.push(dock.getBoundingClientRect());
    }
    const first = boxes[0]!;
    return Math.max(...boxes.flatMap((box) => [Math.abs(box.x - first.x), Math.abs(box.y - first.y), Math.abs(box.width - first.width), Math.abs(box.height - first.height)]));
  })).toBe(0);
}

/** Set the load through plate chips and the dial; never open the number keyboard. */
export async function loadBar(page: Page, kg: number): Promise<void> {
  const dial = page.getByRole('slider', { name: copy.kg, exact: true });
  await expect(dial).toBeVisible();
  await dial.press('Home');
  await expect(dial).toHaveAttribute('aria-valuenow', '0');
  const barKg = Number.parseFloat(await page.locator('.session-bar-label').innerText());
  expect(Number.isFinite(barKg)).toBe(true);
  let perSide = (kg - barKg) / 2;
  let expectedKg = 0;
  for (const plate of [25, 20, 15, 10, 5, 2.5, 1.25]) {
    while (perSide >= plate) {
      const chip = page.getByRole('button', { name: fill(copy.y3AddPair, { kg: plate }), exact: true });
      await chip.scrollIntoViewIfNeeded();
      await settleDockLayout(page);
      await chip.click();
      expectedKg = Math.max(expectedKg, barKg) + plate * 2;
      await expect(dial).toHaveAttribute('aria-valuenow', String(expectedKg));
      perSide -= plate;
    }
  }
  expect(perSide, 'fixture load must be exactly representable by plate pairs').toBe(0);
  await expect(dial).toHaveAttribute('aria-valuenow', String(kg));
  await expect(page.locator('[data-session-dock] input[type="number"]')).toHaveCount(0);
}

export async function logBench(page: Page, sets: number): Promise<void> {
  // Choosing an exercise starts the workout directly.
  if (!page.url().includes('/session')) {
    await page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Train, exact: true }).click();
  }
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
  await expect(picker).toBeHidden();
  const weight = page.getByRole('slider', { name: copy.kg });
  await loadBar(page, 80);
  await expect(weight).toHaveAttribute('aria-valuenow', '80');
  await expect(page.getByRole('slider', { name: copy.reps })).toHaveAttribute('aria-valuenow', '5');
  for (let index = 1; index <= sets; index += 1) {
    await page.getByRole('button', { name: copy.x4Log }).click();
    await expect(page.getByText((index === 1 ? copy.x4SetOne : fill(copy.x4SetCount, { count: index })), { exact: true })).toBeVisible();
  }
}
