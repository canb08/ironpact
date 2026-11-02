import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Repo } from '../../src/data/adapter.ts';
import { copy } from '../../src/ui/copy.ts';
import { reachFloor, waitForBench } from './helpers.ts';

const BENCH = '00000000-0000-4000-8000-000000000010';
test.use({ viewport: { width: 375, height: 812 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
  await reachFloor(page);
  await waitForBench(page);
});

async function seedProgress(page: Page) {
  await page.evaluate(async () => {
    const modulePath = '/src/data/index.ts';
    const { createRepo } = await import(/* @vite-ignore */ modulePath) as { createRepo: () => Repo };
    const repo = createRepo();
    function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
      if (!result.ok) throw new Error(result.error);
      return result.value;
    }
    for (let index = 0; index < 3; index++) {
      const instant = new Date();
      instant.setUTCDate(instant.getUTCDate() - (2 - index) * 7);
      const date = instant.toISOString().slice(0, 10);
      const gym = value(await repo.w.startSession({ kind: 'gym' }));
      value(await repo.w.logSet({ session_id: gym.id, exercise_id: '00000000-0000-4000-8000-000000000010', reps: 5, weight_kg: 70 + index * 5 }));
      value(await repo.w.finishSession(gym.id));
      value(await repo.w.updateSession(gym.id, { local_date: date, started_at: `${date}T08:00:00.000Z` }));
      const run = value(await repo.w.logRun({ distance_m: 4000 + index * 500, duration_s: 1500 + index * 60 }));
      value(await repo.w.updateSession(run.session_id, { local_date: date, started_at: `${date}T09:00:00.000Z` }));
      const fight = value(await repo.w.logMartial({ discipline: 'Boxing', duration_min: 30 + index * 5, rounds: 6 + index }));
      value(await repo.w.updateSession(fight.session_id, { local_date: date, started_at: `${date}T10:00:00.000Z` }));
      const weight = value(await repo.w.logBodyweight(80 - index * 0.5));
      value(await repo.w.updateEntry('bodyweight_entries', weight.id, { local_date: date }));
    }
    value(await repo.w.recomputePrs('00000000-0000-4000-8000-000000000010'));
  });
}

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
  expect(violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) }))).toEqual([]);
}

test('empty segments teach what to log and support arrow-key navigation', async ({ page }) => {
  await page.goto('/progress');
  for (const [name, sentence] of [
    [copy.progressLifts, copy.x5LiftsEmpty], [copy.x5Cardio, copy.x5CardioEmpty],
    [copy.x5Fight, copy.x5FightEmpty], [copy.progressBody, copy.x5BodyEmpty],
  ]) {
    const segment = page.getByRole('radio', { name: name!, exact: true });
    await segment.click();
    await expect(segment).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(sentence!, { exact: true })).toBeVisible();
    const bounds = await segment.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('radio', { name: copy.progressBody }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: copy.progressLifts })).toBeFocused();
  await checkLayout(page);
});

test('all populated segments fit 375 px in both themes and at 200% text', async ({ page }) => {
  await seedProgress(page);
  await page.goto('/progress');
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const name of [copy.progressLifts, copy.x5Cardio, copy.x5Fight, copy.progressBody]) {
      await page.getByRole('radio', { name, exact: true }).click();
      await expect(page.locator('.progress-panel .progress-line--you').first()).toBeVisible();
      await checkLayout(page);
      await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      await page.evaluate(() => document.documentElement.style.fontSize = '');
    }
  }
});

test('exercise chart precedes PRs and history, with preferences in a keyboard-safe sheet', async ({ page }) => {
  await seedProgress(page);
  await page.goto(`/exercise/${BENCH}`);
  await expect(page.getByTestId('best-e1rm')).toContainText('93.3');
  const sections = page.locator('.exercise-detail > section');
  await expect(sections.nth(0)).toHaveAttribute('aria-label', copy.x5Estimate);
  await expect(sections.nth(1)).toHaveAttribute('aria-label', copy.prListHeading);
  await expect(sections.nth(2)).toHaveAttribute('aria-label', copy.historyHeading);
  const repMax = page.locator('.exercise-rep-max');
  await expect(repMax).not.toHaveAttribute('open');
  await repMax.locator('summary').click();
  await expect(repMax.getByRole('table')).toBeVisible();
  await repMax.locator('summary').click();
  await expect(page.getByRole('textbox', { name: copy.restSeconds })).toHaveCount(0);
  const settings = page.getByRole('button', { name: copy.x5Settings });
  await settings.click();
  const sheet = page.getByRole('dialog', { name: copy.x5Settings });
  await expect(sheet.getByRole('textbox', { name: copy.restSeconds })).toBeFocused();
  await sheet.getByRole('textbox', { name: copy.restSeconds }).fill('45');
  await sheet.getByRole('button', { name: copy.saveRest }).click();
  await expect(sheet.getByRole('button', { name: copy.saveRest })).toBeEnabled();
  await checkLayout(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(settings).toBeFocused();
  await settings.click();
  await expect(sheet.getByRole('textbox', { name: copy.restSeconds })).toHaveValue('45');
  await page.keyboard.press('Escape');
  await checkLayout(page);
  await page.getByRole('link', { name: copy.editDay }).first().click();
  await expect(page).toHaveURL(/\/day\/\d{4}-\d{2}-\d{2}$/);
});
