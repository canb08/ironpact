import { expect, test, type Locator, type Page } from '@playwright/test';
import { copy, fill } from '../../src/ui/copy.ts';
import { reachFloor, waitForBench } from './helpers.ts';

/** Frozen so remaining time is `endsAt − now`, not a tick count. */
const CLOCK = new Date('2026-06-01T08:00:00.000Z');

function restChip(page: Page): Locator {
  return page.locator('.rest-timer__chip');
}

async function tapInThumbZone(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  if (!viewport || !box) throw new Error('Tap target has no viewport box');
  expect(box.y, `tap top ${box.y}px in a ${viewport.height}px viewport`).toBeGreaterThanOrEqual(viewport.height * 0.6);
  await locator.click();
}

async function skipReadiness(page: Page): Promise<void> {
  const readiness = page.getByRole('region', { name: copy.readinessTitle });
  if (await readiness.isVisible()) {
    await readiness.getByRole('button', { name: copy.skip, exact: true }).click();
    await expect(readiness).toBeHidden();
  }
}

async function ensureBench(page: Page): Promise<void> {
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  await expect.poll(async () => {
    if (await picker.isVisible()) return 'picker';
    if (await page.locator('.session-exercise').getByRole('heading', { name: 'Bench press', exact: true }).isVisible()) return 'ready';
    return '';
  }).not.toBe('');
  if (await picker.isVisible()) {
    await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
    await expect(picker).toBeHidden();
  }
  await expect(page.locator('.session-exercise').getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
  await skipReadiness(page);
}

async function pressStartUntilOpen(page: Page): Promise<void> {
  const todayStart = page.getByRole('link', { name: copy.x3StartWorkout, exact: true });
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  const bench = page.locator('.session-exercise').getByRole('heading', { name: 'Bench press', exact: true });
  const install = page.getByRole('link', { name: copy.installContinue });
  // Today opens the exercise picker directly.
  // Keep handling the install gate if it covers Today after its first paint.
  await expect(async () => {
    if (await install.isVisible()) await install.click();
    if (await todayStart.isVisible()) {
      await todayStart.click();
      await expect(page).toHaveURL(/\/session$/);
    }
    if (!(await picker.isVisible())) await expect(bench).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Today → Start workout → picker → bench. */
async function openBench(page: Page): Promise<void> {
  await reachFloor(page);
  await waitForBench(page);
  await pressStartUntilOpen(page);
  await ensureBench(page);
  await expect(page.getByRole('button', { name: copy.x4Log, exact: true })).toBeVisible();
}

async function rackIt(page: Page): Promise<void> {
  const rack = page.getByRole('button', { name: copy.x4FinishHold });
  await rack.focus();
  await page.keyboard.down('Enter');
  await page.clock.setFixedTime(CLOCK.getTime() + 700);
  await expect(page.getByRole('region', { name: copy.summaryTitle })).toBeVisible();
  await page.keyboard.up('Enter');
  await page.getByRole('button', { name: copy.summaryDone, exact: true }).click();
  await page.getByRole('dialog', { name: copy.y9Together }).getByRole('button', { name: copy.close, exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('shared-bar')).toBeVisible();
}

async function bumpKg(page: Page, from: string, to: string): Promise<void> {
  // The + control sits under the set list on a short phone. ArrowUp is the stepper's own key.
  const kg = page.getByRole('slider', { name: copy.kg, exact: true });
  await expect(kg).toHaveAttribute('aria-valuenow', from);
  await kg.press('ArrowUp');
  await expect(kg).toHaveAttribute('aria-valuenow', to);
}

async function livePrCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ironpact');
      request.onerror = () => { reject(request.error ?? new Error('indexedDB')); };
      request.onsuccess = () => { resolve(request.result); };
    });
    if (!db.objectStoreNames.contains('pr_events')) {
      db.close();
      return 0;
    }
    const rows = await new Promise<Array<{ deleted_at?: string | null }>>((resolve, reject) => {
      const tx = db.transaction('pr_events', 'readonly');
      const req = tx.objectStore('pr_events').getAll();
      req.onsuccess = () => { resolve(req.result as Array<{ deleted_at?: string | null }>); };
      req.onerror = () => { reject(req.error ?? new Error('pr_events')); };
    });
    db.close();
    return rows.filter((row) => row.deleted_at == null).length;
  });
}

async function setVisibility(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (isHidden ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.beforeEach(async ({ page }) => {
  // Same flag "Continue in browser" writes. Set it before boot so AuthGate cannot
  // send a painted floor back to /install while the clock is frozen.
  await page.addInitScript(() => {
    localStorage.setItem('ironpact.install-dismissed', '1');
  });
  await page.clock.setFixedTime(CLOCK);
});

test('thumb zone: three taps log sets, the zero flash shows, then +0:05 over', async ({ page }) => {
  await openBench(page);
  const log = page.getByRole('button', { name: copy.x4Log, exact: true });
  for (let count = 1; count <= 3; count += 1) {
    await tapInThumbZone(page, log);
    await expect(page.getByText((count === 1 ? copy.x4SetOne : fill(copy.x4SetCount, { count })), { exact: true })).toBeVisible();
  }

  // Compound rest is 120s. The clock is still at the start, so the chip reads 2:00.
  await expect(page.getByRole('region', { name: copy.restTimerLabel }).first()).toBeVisible();
  await expect(restChip(page)).toHaveText('2:00');

  await page.clock.setFixedTime(CLOCK.getTime() + 120_000);
  await expect(page.getByTestId('rest-pulse')).toBeVisible();
  await expect(page.getByText(copy.restComplete, { exact: true })).toBeVisible();
  await expect(page.locator('.rest-timer__live')).toHaveText(copy.restOverAnnounce);

  await page.clock.setFixedTime(CLOCK.getTime() + 125_000);
  await expect(restChip(page)).toHaveText(fill(copy.restOverChip, { time: '0:05' }));
  await expect(page.getByTestId('rest-pulse')).toBeHidden();
});

test('backgrounding 60s mid-rest returns the remaining time from ends_at', async ({ page }) => {
  await openBench(page);
  await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
  await expect(restChip(page)).toHaveText('2:00');

  await setVisibility(page, true);
  await page.clock.setFixedTime(CLOCK.getTime() + 60_000);
  await setVisibility(page, false);

  await expect(restChip(page)).toHaveText('1:00');
});

test('a heavier set shows a PR card and deleting that set removes the PR', async ({ page }) => {
  await openBench(page);
  await bumpKg(page, '0', '2.5');
  await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
  await expect(page.getByText(copy.x4Baseline, { exact: true })).toBeVisible();
  await rackIt(page);

  // Later started_at so this session is not the baseline (UUIDs must not decide).
  await page.clock.setFixedTime(CLOCK.getTime() + 120_000);
  await pressStartUntilOpen(page);
  await ensureBench(page);

  await bumpKg(page, '2.5', '5');
  await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
  const card = page.getByRole('region', { name: copy.prCardLabel });
  await expect(card).toBeVisible();
  await expect.poll(() => livePrCount(page)).toBeGreaterThan(0);

  // Keep the PR visible while operating its set's menu, proving deletion removes the card.
  await page.getByRole('button', { name: fill(copy.x4SetOptions, { index: 1 }), exact: true }).evaluate((element) => { (element as HTMLButtonElement).click(); });
  const remove = page.getByRole('button', { name: fill(copy.sessionDelete, { index: 1 }), exact: true });
  await remove.evaluate((element) => { (element as HTMLButtonElement).click(); });
  await expect(card).toBeHidden();
  await expect.poll(() => livePrCount(page)).toBe(0);
});


test('Y3: last session’s 3×5 is three taps with no number input or keyboard focus', async ({ page }) => {
  await openBench(page);
  const kg = page.getByRole('slider', { name: copy.kg, exact: true });
  await kg.click();
  const typing = page.getByRole('dialog', { name: `${copy.y3TypeValue}: ${copy.kg}` });
  await typing.getByRole('spinbutton').fill('80');
  await typing.getByRole('button', { name: copy.y3UseValue }).click();
  for (let count = 1; count <= 3; count++) {
    await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
    await expect(page.locator('.session-set-row')).toHaveCount(count);
  }
  await rackIt(page);
  await page.clock.setFixedTime(CLOCK.getTime() + 120_000);
  await pressStartUntilOpen(page);
  await ensureBench(page);
  await expect(kg).toHaveAttribute('aria-valuenow', '80');
  await expect(page.getByRole('slider', { name: copy.reps, exact: true })).toHaveAttribute('aria-valuenow', '5');
  await expect(page.getByLabel(copy.y3Ghost, { exact: true })).toContainText('80 kg × 5');
  await page.evaluate(() => {
    document.body.dataset.numberFocus = '0';
    document.addEventListener('focusin', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'number') document.body.dataset.numberFocus = '1';
    });
  });
  let taps = 0;
  for (let count = 1; count <= 3; count++) {
    await tapInThumbZone(page, page.getByRole('button', { name: copy.x4Log, exact: true })); taps++;
    await expect(page.locator('.session-set-row')).toHaveCount(count);
    await expect(page.locator('.session-set-row').last()).toContainText('80 kg × 5');
    await expect(page.getByLabel(copy.y3Ghost, { exact: true })).toContainText('80 kg × 5');
    await expect(page.locator('input[type="number"]')).toHaveCount(0);
  }
  expect(taps).toBe(3);
  await expect(page.locator('body')).toHaveAttribute('data-number-focus', '0');
  await expect.poll(async () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('ironpact'); request.onsuccess = () => resolve(request.result); });
    const rows = await new Promise<Array<{ weight_kg: number; reps: number; rpe: number | null }>>((resolve) => { const request = db.transaction('sets').objectStore('sets').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close();
    return rows.length === 6 && rows.every((row) => row.weight_kg === 80 && row.reps === 5 && row.rpe === null);
  })).toBe(true);
});

test('Y3: plate pairs, hold removal, scrub, swipes and their accessible alternatives', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openBench(page);
  const kg = page.getByRole('slider', { name: copy.kg, exact: true });
  const plate = (value: number) => page.getByRole('button', { name: fill(copy.y3AddPair, { kg: value }), exact: true });
  await plate(25).click();
  await expect(kg).toHaveAttribute('aria-valuenow', '70');
  await plate(5).click();
  await expect(kg).toHaveAttribute('aria-valuenow', '80');
  await expect(page.locator('.session-mini-plate')).toHaveCount(4);
  await plate(5).click({ delay: 650 });
  await expect(kg).toHaveAttribute('aria-valuenow', '70');
  await plate(5).click();
  await expect(kg).toHaveAttribute('aria-valuenow', '80');
  for (const control of [kg, page.getByRole('slider', { name: copy.reps, exact: true }), ...await page.locator('.session-plate-chip').all(), page.locator('.session-log')]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(56);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.y).toBeGreaterThanOrEqual(812 * .6);
  }
  const dialBox = (await kg.boundingBox())!;
  await page.mouse.move(dialBox.x + dialBox.width / 2, dialBox.y + 45);
  await page.mouse.down();
  await page.mouse.move(dialBox.x + dialBox.width / 2, dialBox.y + 5, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await kg.getAttribute('aria-valuenow'))).toBeGreaterThan(80);
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
  await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
  await expect(page.locator('.session-set-row')).toHaveCount(1);
  const first = page.locator('.session-set-row').first();
  const swipe = async (direction: number) => {
    const box = (await first.boundingBox())!;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x + direction * 100, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
  };
  await swipe(1);
  await expect(page.locator('.session-set-row')).toHaveCount(2);
  await swipe(-1);
  const edit = page.getByRole('dialog', { name: copy.x4EditTitle });
  await expect(edit).toBeVisible();
  await edit.getByRole('button', { name: copy.x4SaveSet }).click();
  await expect(edit).toBeHidden();
  await first.getByRole('button').click();
  const menu = page.getByRole('dialog', { name: copy.x4SetMenu });
  await menu.getByRole('button', { name: copy.y3SameAgain }).click();
  await expect(page.locator('.session-set-row')).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await plate(5).click();
  await expect(page.locator('[data-session-dock]')).toHaveClass(/session-controls--instant/);
  expect(await page.locator('.session-mini-plate').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await page.getByRole('button', { name: copy.x4Log, exact: true }).click();
  await expect(page.locator('.session-set-row')).toHaveCount(4);
  expect(await page.locator('.session-set-row').last().evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
