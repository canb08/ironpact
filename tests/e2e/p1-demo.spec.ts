import { expect, test } from '@playwright/test';
import { shellCopy } from '../../src/app/shell/copy.ts';
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

  // The Today tab works without a reload in airplane mode.
  await page.locator('.app-shell__tabs').getByRole('link', { name: shellCopy.today, exact: true }).click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
  await page.getByRole('link', { name: copy.x3Min, exact: true }).click();
  const min = page.getByRole('dialog', { name: copy.x3Min });
  await min.getByRole('button', { name: copy.save, exact: true }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const path = '/src/data/index.ts';
    const { createRepo } = await import(path) as typeof import('../../src/data/index.ts');
    const me = await createRepo().q.me();
    return (await createRepo().q.entriesBetween(me!.id, '0000-01-01', '9999-12-31')).min.length;
  })).toBe(1);
  await min.getByRole('button', { name: copy.close, exact: true }).click();

  await page.getByRole('link', { name: copy.x3WeighIn, exact: true }).click();
  const weight = page.getByRole('dialog', { name: copy.x3WeighIn });
  await weight.getByLabel(copy.weight).fill('78.4');
  await weight.getByRole('button', { name: copy.save }).click();
  await expect(weight.getByText('78.4')).toBeVisible();
  await weight.getByRole('button', { name: copy.close }).click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();

  await page.getByRole('link', { name: copy.x3StartWorkout, exact: true }).click();
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

  await page.locator('.app-shell__tabs').getByRole('link', { name: shellCopy.today, exact: true }).click();
  await page.locator('.app-shell__header').getByRole('link', { name: copy.settings, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${copy.x8Privacy}`) }).click();
  await page.locator('summary').filter({ hasText: copy.exportPreview }).click();
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
