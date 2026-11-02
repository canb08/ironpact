import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';
import { reachFloor } from './helpers.ts';

test.use({ viewport: { width: 375, height: 812 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
});

test('Today fits the shared bar, workout action and all four quick logs in the first viewport', async ({ page }) => {
  await reachFloor(page);
  const bar = page.getByTestId('shared-bar').getByRole('img');
  await expect(bar).toHaveAccessibleName('You 0 of 3, Partner 0 of 3');
  const tabs = await page.locator('.app-shell__tabs').boundingBox();
  for (const target of [bar, page.getByRole('link', { name: copy.x3StartWorkout }),
    ...await page.getByRole('navigation', { name: copy.x3QuickLogs }).getByRole('link').all()]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(tabs!.y);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await expect(page.getByRole('link', { name: copy.x3Min, exact: true })).toHaveCount(1);
  await expect(page.getByTestId('week-streak')).toHaveCount(0);
  await page.getByRole('link', { name: copy.x3StartWorkout }).click();
  await expect(page).toHaveURL(/\/session$/);
});

test('each quick log opens its named sheet over Today', async ({ page }) => {
  await reachFloor(page);
  for (const name of [copy.x3Run, copy.x3Fight, copy.x3WeighIn, copy.x3Min]) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    await expect(page.getByTestId('shared-bar')).toBeAttached();
    await page.getByRole('button', { name: copy.close, exact: true }).click();
    await expect(page.getByTestId('shared-bar')).toBeVisible();
  }
});

test('Today has no axe violations or sideways scrolling in either theme at normal and 200% text', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachFloor(page);
  for (const theme of ['dark', 'light']) {
    for (const scale of ['100%', '200%']) {
      await page.evaluate(({ theme, scale }) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.fontSize = scale;
      }, { theme, scale });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      const report = await new AxeBuilder({ page }).include('main').analyze();
      expect(report.violations).toEqual([]);
    }
  }
});
