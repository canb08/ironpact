import { expect, test } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';
import { logBench, mirrorCounts, reachFloor, waitForBench, warmLazyRoutes } from './helpers.ts';

test('flight test: 20 offline sets replay to 20 mock rows after a cold open', async ({ page, context }) => {
  await reachFloor(page);
  await waitForBench(page);
  await warmLazyRoutes(page);

  await context.setOffline(true);
  await logBench(page, 20);
  await expect(page.locator(`[aria-label="${copy.sessionSaved}"]`)).toHaveCount(20);

  // Kill the page while the outbox still holds the session and the 20 sets.
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto('/');

  await expect.poll(async () => (await mirrorCounts(reopened)).ackedSets, { timeout: 30_000 }).toBe(20);
  const counts = await mirrorCounts(reopened);
  console.log(counts.ackedSets);
  test.info().annotations.push({ type: 'flight-rows', description: String(counts.ackedSets) });
  expect(counts.sets).toBe(20);
  expect(counts.uniqueSets).toBe(20);
  expect(counts.pending).toBe(0);
  expect(counts.dead).toBe(0);
});
