import { expect, test, type Page } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';
import { reachFloor, waitForBench } from './helpers.ts';

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowing: [...document.querySelectorAll<HTMLElement>('.session-active *')]
        .filter((element) => element.getBoundingClientRect().right > root.clientWidth + 1)
        .map((element) => `${element.tagName}.${element.className}`),
    };
  });
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
}

test.use({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });

for (const zoom of [1, 2]) {
  test(`Bench set fits 375px at ${zoom * 100}% zoom`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ironpact.install-dismissed', '1');
    });
    await reachFloor(page);
    await waitForBench(page);
    await page.goto('/session');
    const picker = page.getByRole('dialog', { name: copy.pickerTitle });
    await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
    await expect(picker).toBeHidden();
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);

    await expectNoHorizontalScroll(page);
    const kg = page.getByRole('spinbutton', { name: copy.kg, exact: true });
    const reps = page.getByRole('spinbutton', { name: copy.reps, exact: true });
    await kg.fill('80');
    await reps.fill('5');
    const log = page.getByRole('button', { name: copy.x4Log, exact: true });
    const rack = page.getByRole('button', { name: copy.x4FinishHold, exact: true });
    await expect(log).toBeVisible();
    await expect(rack).toBeVisible();
    await rack.scrollIntoViewIfNeeded();
    await expect(rack).toBeInViewport();
    await log.click();
    await expect(page.getByText(copy.x4SetOne, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: copy.restTimerLabel }).first()).toBeVisible();
    await expect(log).toBeVisible();
    await expect(rack).toBeVisible();
    await log.scrollIntoViewIfNeeded();
    await expect(log).toBeInViewport();
    await rack.scrollIntoViewIfNeeded();
    await expect(rack).toBeInViewport();
    await expectNoHorizontalScroll(page);

    for (const target of [kg, reps, log, rack, ...await page.locator('.session-steppers button, .rest-timer__controls button').all()]) {
      const box = await target.boundingBox();
      if (!box) throw new Error('Workout target has no bounding box');
      expect(box.width / zoom).toBeGreaterThanOrEqual(44);
      expect(box.height / zoom).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(376);
    }
  });
}

test('three taps to a set, ten sets scroll in the page, and Done returns to Today', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
  await reachFloor(page);
  await waitForBench(page);
  let taps = 0;
  await page.getByRole('button', { name: copy.start, exact: true }).click(); taps++;
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Bench press', exact: true }).click(); taps++;
  await page.getByRole('button', { name: copy.x4Log, exact: true }).click(); taps++;
  await expect(page.getByText(copy.x4SetOne, { exact: true })).toBeVisible();
  expect(taps).toBeLessThanOrEqual(3);
  await expect(page.getByRole('region', { name: copy.readinessTitle })).toHaveCount(0);
  for (let index = 2; index <= 10; index++) {
    await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
    await expect(page.getByRole('region', { name: copy.sessionSets }).getByRole('listitem')).toHaveCount(index);
  }
  const rows = page.locator('.session-set-row');
  for (const row of await rows.all()) {
    await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(row).toBeInViewport();
  }
  expect(await page.locator('.session-sets').evaluate((node) => getComputedStyle(node).overflowY)).toBe('visible');
  expect(await page.locator('.session-active').evaluate((node) => getComputedStyle(node).overflowY)).toBe('visible');
  await page.getByRole('button', { name: copy.x4AddRpe, exact: true }).click();
  await expect(page.getByRole('group', { name: copy.sessionRpe }).getByRole('button')).toHaveCount(10);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'RPE 8', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(copy.x4TimerExpand) }).click();
  await expect(page.locator('.rest-timer__chip')).toHaveCount(1);
  await page.getByRole('button', { name: new RegExp(copy.x4TimerCollapse) }).click();
  const finish = page.getByRole('button', { name: copy.x4FinishHold });
  await finish.focus(); await page.keyboard.down('Enter');
  await expect(page.getByRole('region', { name: copy.summaryTitle })).toBeVisible();
  await page.keyboard.up('Enter');
  await expect(page.getByRole('region', { name: copy.summaryTitle })).toContainText('Bench press');
  await page.getByRole('button', { name: copy.summaryDone, exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('my-week')).toBeVisible();
});
