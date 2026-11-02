import { expect, test, type Page } from '@playwright/test';
import { copy, fill } from '../../src/ui/copy.ts';
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
    await page.getByRole('button', { name: copy.start, exact: true }).click();
    const picker = page.getByRole('dialog', { name: copy.pickerTitle });
    await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
    await expect(picker).toBeHidden();
    const readiness = page.getByRole('region', { name: copy.readinessTitle });
    await readiness.getByRole('button', { name: copy.skip, exact: true }).click();
    await expect(readiness).toBeHidden();
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);

    await expectNoHorizontalScroll(page);
    const kg = page.getByRole('spinbutton', { name: copy.kg, exact: true });
    const reps = page.getByRole('spinbutton', { name: copy.reps, exact: true });
    await kg.fill('80');
    await reps.fill('5');
    const log = page.getByRole('button', { name: copy.logSet, exact: true });
    const rack = page.getByRole('button', { name: copy.rackItName, exact: true });
    await expect(log).toBeVisible();
    await expect(rack).toBeVisible();
    await rack.scrollIntoViewIfNeeded();
    await expect(rack).toBeInViewport();
    await log.click();
    await expect(page.getByText(fill(copy.sessionSetCount, { count: 1 }), { exact: true })).toBeVisible();
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
      expect(box.width / zoom).toBeGreaterThanOrEqual(64);
      expect(box.height / zoom).toBeGreaterThanOrEqual(64);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(376);
    }
  });
}
