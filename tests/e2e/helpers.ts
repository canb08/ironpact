import { expect, type Page } from '@playwright/test';
import { shellCopy } from '../../src/app/shell/copy.ts';
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
  const today = page.locator('.app-shell__tabs').getByRole('link', { name: shellCopy.today, exact: true });
  if (await today.isVisible()) await today.click();
  else await page.goto('/');
  await expect.poll(async () => {
    const install = page.getByRole('link', { name: copy.installContinue });
    if (await install.isVisible()) await install.click();
    const path = new URL(page.url()).pathname;
    if (path === '/crew/new' || path === '/sign-in') await page.goto('/');
    return page.getByTestId('shared-bar').isVisible();
  }, { timeout: 20_000 }).toBe(true);
  await page.locator('.app-shell__tabs').getByRole('link', { name: shellCopy.today, exact: true }).click();
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

  await page.locator('.app-shell__tabs').getByRole('link', { name: shellCopy.train, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.sessionTitle })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.start, exact: true })).toBeVisible();
  await page.locator('.app-shell__tabs').getByRole('link', { name: shellCopy.today, exact: true }).click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
}

export async function logBench(page: Page, sets: number): Promise<void> {
  // Enter through the tab bar; the session screen starts the workout.
  if (!page.url().includes('/session')) {
    await page.locator('.app-shell__tabs').getByRole('link', { name: shellCopy.train, exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: copy.sessionTitle })).toBeVisible();
  const begin = page.getByRole('button', { name: copy.start, exact: true });
  await expect(begin).toBeVisible();
  await begin.click();
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
  await expect(picker).toBeHidden();
  const weight = page.getByRole('spinbutton', { name: copy.kg });
  await weight.fill('80');
  await expect(weight).toHaveValue('80');
  await expect(page.getByRole('spinbutton', { name: copy.reps })).toHaveValue('5');
  for (let index = 1; index <= sets; index += 1) {
    await page.getByRole('button', { name: copy.logSet }).click();
    await expect(page.getByText(fill(copy.sessionSetCount, { count: index }), { exact: true })).toBeVisible();
  }
}
