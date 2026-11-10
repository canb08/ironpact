import { expect, test } from '@playwright/test';
import { copy, fill } from '../../src/ui/copy.ts';
import { reachFloor } from './helpers.ts';

test.use({ viewport: { width: 375, height: 812 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ironpact.install-dismissed', '1');
    let opens = 0;
    document.addEventListener('focusin', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) opens += 1;
    }, true);
    Object.defineProperty(window, '__keyboardOpens', { configurable: true, get: () => opens });
    Object.defineProperty(window, '__resetKeyboard', { configurable: true, value: () => { opens = 0; } });
  });
});

test('Today to Muay Thai to Log class saves 6 rounds in two taps', async ({ page }) => {
  await reachFloor(page);
  await page.evaluate(() => {
    (window as unknown as { __resetKeyboard: () => void }).__resetKeyboard();
  });
  await page.getByRole('link', { name: copy.x3Fight, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: copy.x3Fight });
  await expect(dialog.getByTestId('class-rounds')).toHaveText('6 struck · 6 held');
  await expect(dialog.getByTestId('class-minutes')).toHaveText('~60 min');
  await expect(dialog.getByTestId('class-note')).toHaveText('Pads');
  await dialog.getByRole('button', { name: copy.y2LogClass, exact: true }).click();
  const prompt = page.getByRole('dialog', { name: copy.y9Together });
  await expect(prompt.getByText(copy.summarySaved)).toBeVisible();
  await expect(prompt.locator('input, textarea')).toHaveCount(0);
  await expect(prompt.getByRole('button', { name: /^With / })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as unknown as { __keyboardOpens: number }).__keyboardOpens)).toBe(0);
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ironpact');
      request.onerror = () => { reject(request.error ?? new Error('indexedDB')); };
      request.onsuccess = () => { resolve(request.result); };
    });
    const rows = await new Promise<Array<{ discipline?: string; duration_min?: number; rounds?: number | null; note?: string | null; deleted_at?: string | null }>>((resolve, reject) => {
      const tx = db.transaction('martial_entries', 'readonly');
      const req = tx.objectStore('martial_entries').getAll();
      req.onsuccess = () => { resolve(req.result as Array<{ discipline?: string; duration_min?: number; rounds?: number | null; note?: string | null; deleted_at?: string | null }>); };
      req.onerror = () => { reject(req.error ?? new Error('martial_entries')); };
    });
    db.close();
    return rows.filter((row) => row.deleted_at == null);
  });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    discipline: 'Muay Thai',
    duration_min: 60,
    rounds: 6,
    note: 'Pads',
  });
});

test('adjusting to 2 combos records the note and the combo book', async ({ page }) => {
  await reachFloor(page);
  await page.getByRole('link', { name: copy.x3Fight, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: copy.x3Fight });
  await dialog.getByRole('button', { name: copy.y2Adjust, exact: true }).click();
  await dialog.getByRole('slider', { name: copy.y2CombosHalf }).press('ArrowDown');
  await expect(dialog.getByTestId('class-rounds')).toHaveText('4 struck · 4 held');
  await dialog.getByRole('button', { name: '1', exact: true }).click();
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: 'R kick', exact: true }).click();
  await dialog.getByRole('button', { name: copy.y2LogClass, exact: true }).click();
  const prompt = page.getByRole('dialog', { name: copy.y9Together });
  await expect(prompt.getByText(copy.summarySaved)).toBeVisible();
  await prompt.getByRole('button', { name: copy.close, exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.locator('.app-shell__tabs').getByRole('link', { name: copy.progressTitle, exact: true }).click();
  await page.getByRole('radio', { name: copy.x5Fight, exact: true }).click();
  await expect(page.getByRole('region', { name: copy.y2ComboBook })).toBeVisible();
  await expect(page.getByText(fill(copy.y2Drilled, { combo: '1-2-R kick', count: 1 }))).toBeVisible();
});
