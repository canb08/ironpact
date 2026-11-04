import { expect, test, type Page } from '@playwright/test';
import { copy } from '../../src/ui/copy';
import { BENCH } from './x11-seed';

test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });

async function seed(page: Page, complete = false) {
  await page.route('**/tests/e2e/fixtures/x11.tsx*', async (route) => {
    const response = await route.fetch();
    let body = (await response.text()).replace('reduce_motion: true', 'reduce_motion: false').replace('haptics_on: false', 'haptics_on: true');
    if (complete) body = body.replace('weekly_target: 5', 'weekly_target: 1').replace('await repo.sync.pullNow();', `const partner = (await repo.q.profiles([MOCK_USER_IDS.bob]))[0];
      remote.seed('profiles', [{ ...partner, weekly_target: 1 }]);
      await repo.sync.pullNow();`);
    await route.fulfill({ response, body });
  });
  await page.addInitScript(() => {
    const pulses: number[][] = [];
    Object.assign(window, { __y5Pulses: pulses });
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (pattern: number | number[]) => { pulses.push(Array.isArray(pattern) ? pattern : [pattern]); return true; } });
  });
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00.000Z'));
  await page.goto('/tests/e2e/fixtures/x11.html?theme=dark');
  await expect(page.locator('.progress-lift-link').first()).toBeVisible();
}

async function settleMotion(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)));
  });
}

async function pulses(page: Page) {
  return page.evaluate(() => (window as unknown as { __y5Pulses: number[][] }).__y5Pulses);
}

test('tabs slide in both directions; the exercise name and chart share the transition', async ({ page }) => {
  await seed(page);
  await page.locator('.app-shell__tabs a[href="/"]').click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
  await page.locator('.app-shell__tabs a[href="/progress"]').click();
  await expect(page.locator('.progress-lifts')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tab-direction', 'left');
  await settleMotion(page);
  await page.locator('.app-shell__tabs a[href="/"]').click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tab-direction', 'right');
  await settleMotion(page);
  await page.locator('.app-shell__tabs a[href="/progress"]').click();
  await settleMotion(page);
  await page.locator(`a[href="/exercise/${BENCH}"]`).first().click();
  await expect(page.locator('.exercise-detail')).toBeVisible();
  await expect(page.locator('.app-shell__header h1')).toHaveCSS('view-transition-name', 'exercise-name');
  await expect(page.locator('.exercise-detail .progress-svg')).toHaveCSS('view-transition-name', 'exercise-chart');
  await settleMotion(page);
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await expect(page.locator('.progress-lifts')).toBeVisible();
  await settleMotion(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test('sheet follows the finger, cancels a short drag and dismisses a downward flick', async ({ page }) => {
  await seed(page);
  await page.locator('.app-shell__tabs a[href="/"]').click();
  await page.getByRole('link', { name: copy.x3Min, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await settleMotion(page);
  const title = dialog.locator('h2');
  const rect = await title.boundingBox();
  if (!rect) throw new Error('Missing drag header');
  await page.mouse.move(rect.x + 20, rect.y + 10);
  await page.mouse.down();
  await page.mouse.move(rect.x + 20, rect.y + 50);
  await expect(dialog).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 40)');
  await title.dispatchEvent('pointercancel', { pointerId: 1, clientY: rect.y + 50 });
  await page.mouse.up();
  await settleMotion(page);
  await expect(dialog).toBeVisible();
  await page.mouse.move(rect.x + 20, rect.y + 10);
  await page.mouse.down();
  await page.mouse.move(rect.x + 20, rect.y + 210, { steps: 4 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
});

test('complete week locks once, past weeks restack quietly and next week is bounded', async ({ page }) => {
  await seed(page, true);
  await page.locator('.app-shell__tabs a[href="/"]').click();
  await expect(page.locator('[data-complete="true"]')).toBeVisible();
  await expect.poll(async () => (await pulses(page)).filter((p) => p.length === 1 && p[0] === 120).length).toBe(1);
  await settleMotion(page);
  await page.getByRole('button', { name: copy.x6PreviousWeek }).click();
  await expect(page.locator('[data-week="2026-10-26"]')).toBeVisible();
  await page.getByRole('button', { name: copy.x6NextWeek }).click();
  await expect(page.locator('[data-week="2026-11-02"]')).toBeVisible();
  await expect(page.getByRole('button', { name: copy.x6NextWeek })).toBeDisabled();
  await settleMotion(page);
  expect((await pulses(page)).filter((p) => p[0] === 120)).toHaveLength(1);
});

test('reduced motion is instant with lockout feedback and no sheet animation or canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, true);
  await page.locator('.app-shell__tabs a[href="/"]').click();
  await expect(page.locator('[data-complete="true"]')).toBeVisible();
  await expect.poll(async () => (await pulses(page)).filter((p) => p[0] === 120).length).toBe(1);
  await page.locator('.app-shell__tabs a[href="/"]').click();
  await page.getByRole('link', { name: copy.x3Min, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((node) => node.getAnimations().length)).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
});
