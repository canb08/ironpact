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
  await page.getByRole('link', { name: copy.x3StartWorkout, exact: true }).click(); taps++;
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
  await expect(page.getByTestId('shared-bar')).toBeVisible();
});

test('current lift stays above the dock, earlier lifts collapse, and summary has one title', async ({ page }) => {
  const started = Date.parse('2026-11-02T10:00:00Z');
  await page.clock.setFixedTime(started);
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
  await reachFloor(page);
  await waitForBench(page);
  await page.goto('/session');
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
  await page.getByRole('spinbutton', { name: copy.kg, exact: true }).fill('80');
  for (let count = 1; count <= 3; count++) {
    await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
    await expect(page.locator('[data-current-exercise] .session-set-row')).toHaveCount(count);
  }
  await page.clock.setFixedTime(started + 21 * 60_000);
  await page.getByRole('button', { name: copy.x4Change, exact: true }).click();
  await picker.getByRole('button', { name: copy.pickerCreate, exact: true }).click();
  await picker.getByRole('textbox', { name: copy.pickerName, exact: true }).fill('Back squat');
  await picker.getByRole('textbox', { name: copy.pickerExportLabel, exact: true }).fill('Squat');
  await picker.getByRole('button', { name: copy.pickerCreate, exact: true }).click();
  await expect(page.getByRole('form', { name: 'Back squat', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: copy.kg, exact: true }).fill('100');
  for (let count = 1; count <= 3; count++) {
    await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
    const rows = page.locator('[data-current-exercise] .session-set-row');
    await expect(rows).toHaveCount(count);
    // This checks the scroll effect, without manually scrolling the set into view.
    await expect.poll(() => rows.last().evaluate((node) => {
      const dock = document.querySelector('[data-session-dock]')!.getBoundingClientRect();
      const row = node.getBoundingClientRect();
      const header = document.querySelector('.session-header')!.getBoundingClientRect();
      return row.bottom <= Math.min(dock.top, window.innerHeight) && row.top >= header.bottom;
    })).toBe(true);
  }
  const earlier = page.locator('.session-earlier');
  await expect(earlier).not.toHaveAttribute('open');
  await expect(earlier.locator('summary')).toHaveText('Bench press · 3 sets · best 80 kg × 5');
  await expect(page.locator('[data-current-exercise]')).toContainText('Back squat');
  await expect(page.locator('[data-current-exercise] .session-set-row button')).toHaveCount(3);
  await expect(page.locator('.session-exercise h2')).toHaveText('Back squat');
  await expect(page.locator('.session-sets > :last-child')).toHaveAttribute('data-current-exercise');
  await earlier.locator('summary').click();
  await expect(earlier.getByRole('listitem')).toHaveCount(3);
  await earlier.locator('summary').click();
  // Switching back must also put the selected exercise last and retain all six sets.
  await page.getByRole('button', { name: copy.x4Change, exact: true }).click();
  await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
  await expect(page.locator('[data-current-exercise]')).toContainText('Bench press');
  await expect(page.locator('.session-earlier')).toContainText('Back squat');
  await expect(page.getByText('6 sets', { exact: true })).toBeVisible();
  const finish = page.getByRole('button', { name: copy.x4FinishHold });
  await finish.focus(); await page.keyboard.down('Enter');
  await page.clock.setFixedTime(started + 21 * 60_000 + 700);
  const summary = page.getByRole('region', { name: copy.summaryTitle });
  await expect(summary.getByRole('heading', { name: copy.x4Summary })).toBeVisible();
  await page.keyboard.up('Enter');
  await expect(page.getByRole('heading', { name: copy.sessionTitle })).toHaveCount(0);
  await expect(summary.getByText('21 min', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
