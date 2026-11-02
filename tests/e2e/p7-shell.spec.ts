import { expect, test } from '@playwright/test';
import { shellCopy } from '../../src/app/shell/copy.ts';
import { copy } from '../../src/ui/copy.ts';
import { logBench, reachFloor, waitForBench } from './helpers.ts';

const BENCH = '00000000-0000-4000-8000-000000000010';
const tabs = (page: import('@playwright/test').Page) => page.locator('.app-shell__tabs');

test.use({ viewport: { width: 375, height: 812 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
});

test('tabs reach every main screen; Progress reaches an exercise and its day, with back headers', async ({ page }) => {
  await reachFloor(page);
  await waitForBench(page);
  await logBench(page, 1);
  await expect(page.getByTestId('session-live')).toBeVisible();
  await tabs(page).getByRole('link', { name: copy.progressTitle, exact: true }).click();
  await expect(tabs(page).getByRole('link', { name: copy.progressTitle, exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: /^Bench press/ }).click();
  await expect(page).toHaveURL(new RegExp(`/exercise/${BENCH}$`));
  await expect(page.getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
  await page.getByRole('link', { name: copy.editDay, exact: true }).click();
  await expect(page).toHaveURL(/\/day\/\d{4}-\d{2}-\d{2}$/);
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/exercise/${BENCH}$`));
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await tabs(page).getByRole('link', { name: copy.crewTitle, exact: true }).click();
  await page.locator('.app-shell__header').getByRole('link', { name: copy.settings, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.settingsTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await expect(page).toHaveURL(/\/crew$/);
  await tabs(page).getByRole('link', { name: shellCopy.today, exact: true }).click();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
  const bounds = await tabs(page).boundingBox();
  expect(bounds?.y).toBeGreaterThan(700);
  for (const link of await tabs(page).getByRole('link').all()) {
    const target = await link.boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

for (const [route, parent] of [[`/exercise/${BENCH}`, '/progress'], ['/day/2026-11-02', '/progress'], ['/settings', '/'], ['/settings/training', '/settings']]) {
  test(`a fresh PWA at ${route} goes back to ${parent}`, async ({ page, context }) => {
    await reachFloor(page);
    await waitForBench(page);
    const fresh = await context.newPage();
    await fresh.goto(route!);
    await fresh.getByRole('button', { name: copy.x1Back, exact: true }).click();
    await expect(fresh).toHaveURL(new RegExp(`${parent === '/' ? '/$' : `${parent}$`}`));
    await expect(tabs(fresh)).toBeVisible();
    await fresh.close();
  });
}

test('quick logs keep Today mounted behind the sheet and dismiss back to it', async ({ page }) => {
  await reachFloor(page);
  await page.getByTestId('shared-bar').evaluate((node) => node.setAttribute('data-shell-kept', 'true'));
  await page.getByRole('link', { name: copy.x3WeighIn, exact: true }).click();
  await expect(page.getByRole('dialog', { name: copy.x3WeighIn })).toBeVisible();
  await expect(page.locator('[data-shell-kept="true"]')).toBeAttached();
  await page.getByRole('button', { name: copy.close, exact: true }).click();
  await expect(page.locator('[data-shell-kept="true"]')).toBeVisible();
  await expect(tabs(page)).toBeVisible();
});

test('only set-input focus hides the tabs; they return after blur and workout completion', async ({ page }) => {
  await reachFloor(page);
  await waitForBench(page);
  await logBench(page, 1);
  const kg = page.getByRole('spinbutton', { name: copy.kg, exact: true });
  await kg.focus();
  await expect(tabs(page)).toBeHidden();
  await page.getByRole('button', { name: copy.logSet, exact: true }).focus();
  await expect(tabs(page)).toBeVisible();
  const rack = page.getByRole('button', { name: copy.finish });
  await rack.focus();
  await page.keyboard.down('Enter');
  try { await expect(page.getByRole('region', { name: copy.summaryTitle })).toBeVisible(); }
  finally { await page.keyboard.up('Enter'); }
  await expect(page.getByTestId('session-live')).toHaveCount(0);
  await tabs(page).getByRole('link', { name: shellCopy.today, exact: true }).click();
  await page.locator('.app-shell__header').getByRole('link', { name: copy.settings, exact: true }).click();
  await page.getByRole('textbox').first().focus();
  await expect(tabs(page)).toBeVisible();
});

test('install and join routes have no signed-in chrome', async ({ page }) => {
  await reachFloor(page);
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: copy.installTitle })).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);
  await page.goto('/join/AAAAAAAAAA');
  await expect(page.getByRole('button', { name: copy.copyCode, exact: true })).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);
});
