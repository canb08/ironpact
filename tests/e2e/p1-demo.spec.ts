import { expect, test } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';
import { logBench, mirrorCounts, reachFloor, waitForBench, warmLazyRoutes } from './helpers.ts';

const BENCH = 'Bench \u00b7 3\u00d75\u00d780kg';
const WEIGHT = 'Weight \u00b7 78.4kg';
const MIN = 'MIN \u00b7 20m walk';

test('offline bench, MIN and weight sync, and the vault preview shows the three lines', async ({ page, context }) => {
  await reachFloor(page);
  await waitForBench(page);
  await warmLazyRoutes(page);

  await context.setOffline(true);
  await logBench(page, 3);
  await expect(page.locator(`[aria-label="${copy.sessionSaved}"]`)).toHaveCount(3);

  // The session screen has no Floor control. History returns to S4 without a reload (offline-safe).
  await page.goBack();
  await expect(page.getByTestId('my-week')).toBeVisible();
  await page.getByRole('button', { name: copy.min, exact: true }).click();
  await expect(page.getByText(copy.minLogged)).toBeVisible();
  await expect(page.getByText(copy.minLogged, { exact: true })).toHaveCount(1);

  await page.getByRole('link', { name: copy.weight, exact: true }).click();
  const weight = page.getByRole('dialog', { name: copy.weight });
  await weight.getByLabel(copy.weight).fill('78.4');
  await weight.getByRole('button', { name: copy.save }).click();
  await expect(weight.getByText('78.4')).toBeVisible();
  await weight.getByRole('button', { name: copy.close }).click();
  await expect(page.getByTestId('my-week')).toBeVisible();

  await page.getByRole('button', { name: copy.start, exact: true }).click();
  await page.getByRole('button', { name: copy.sessionResumeAction }).click();
  await expect(page.locator(`[aria-label="${copy.sessionSaved}"]`)).toHaveCount(3);

  await context.setOffline(false);
  await expect(page.locator(`[aria-label="${copy.sessionSynced}"]`)).toHaveCount(3);

  // A pointer hold is cancelled by pointerleave/capture on mobile. Keyboard hold matches the button.
  const rack = page.getByRole('button', { name: copy.finish });
  await rack.focus();
  await page.keyboard.down('Enter');
  await expect(page.getByText(copy.sessionFinished)).toBeVisible();
  await page.keyboard.up('Enter');

  await page.goBack();
  await page.getByRole('link', { name: copy.settings, exact: true }).click();
  const preview = page.getByRole('region', { name: copy.exportPreview }).locator('pre');
  await expect(preview).toContainText(BENCH);
  await expect(preview).toContainText(WEIGHT);
  await expect(preview).toContainText(MIN);

  await expect.poll(async () => (await mirrorCounts(page)).pending).toBe(0);
  const counts = await mirrorCounts(page);
  expect(counts.dead).toBe(0);
  expect(counts.ackedSets).toBe(3);
  expect(counts.uniqueSets).toBe(3);
});
