import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { MOCK_USER_IDS } from '../../src/data/adapter.mock.ts';
import { copy, fill } from '../../src/ui/copy.ts';
import { reachFloor, waitForBench } from './helpers.ts';

const CLOCK = Date.parse('2026-06-01T08:00:00.000Z');
const chip = (page: Page) => page.locator('.rest-timer__chip');
const card = (page: Page) => page.getByRole('region', { name: copy.prCardLabel });

async function openBench(page: Page): Promise<void> {
  if (!page.url().includes('/session')) await page.goto('/session');
  await page.getByRole('button', { name: copy.start, exact: true }).click();
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  await expect.poll(async () => await picker.isVisible()
    || await page.getByRole('button', { name: 'Bench press', exact: true }).isVisible()).toBe(true);
  if (await picker.isVisible()) await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
  const readiness = page.getByRole('region', { name: copy.readinessTitle });
  if (await readiness.isVisible()) await readiness.getByRole('button', { name: copy.skip, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.logSet, exact: true })).toBeVisible();
}

async function log(page: Page, kg: string): Promise<void> {
  await page.getByRole('spinbutton', { name: copy.kg, exact: true }).fill(kg);
  await page.getByRole('button', { name: copy.logSet, exact: true }).click();
  await expect(page.getByText(fill(copy.sessionSetCount, { count: 1 }), { exact: true })).toBeVisible();
}

/** Make the baseline and the heavier set through the real workout/outbox path. */
async function preparePr(page: Page): Promise<void> {
  await reachFloor(page);
  await waitForBench(page);
  await openBench(page);
  await log(page, '80');
  await expect(page.getByText(copy.firstSession, { exact: true })).toBeVisible();
  const rack = page.getByRole('button', { name: copy.finish });
  await rack.focus();
  await page.keyboard.down('Enter');
  try {
    // HoldButton measures elapsed Date.now(), while CSS/rAF keep real time.
    await page.clock.setFixedTime(CLOCK + 700);
    await expect(page.getByRole('region', { name: copy.summaryTitle })).toBeVisible();
  } finally {
    await page.keyboard.up('Enter');
  }
  await page.getByRole('button', { name: copy.summaryDone, exact: true }).click();
  await page.clock.setFixedTime(CLOCK + 120_000);
  await openBench(page);
}

interface FlashSample { at: number; opacity: number }

/** Sample the rendered pulse, including CSS repetitions, rather than counting DOM nodes. */
async function watchFlashes(page: Page, selector: string): Promise<void> {
  await page.evaluate((target) => {
    const samples: FlashSample[] = [];
    let running = true;
    const sample = (at: number) => {
      const elements = [...document.querySelectorAll(target)];
      const opacity = Math.max(0, ...elements.map((element) => {
        const style = getComputedStyle(element);
        return style.display === 'none' || style.visibility === 'hidden' ? 0 : Number(style.opacity);
      }));
      samples.push({ at, opacity });
      if (running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    Object.assign(globalThis, { __p4Flashes: { samples, stop: () => { running = false; } } });
  }, selector);
}

async function assertSinglePulse(page: Page, locator: Locator): Promise<void> {
  // CSS animations use real rendering time; setFixedTime freezes Date only.
  await page.waitForTimeout(1_600);
  const samples = await page.evaluate(() => {
    const probe = (globalThis as unknown as {
      __p4Flashes: { samples: FlashSample[]; stop(): void };
    }).__p4Flashes;
    probe.stop();
    return probe.samples;
  });
  const starts = samples.filter((sample, index) => sample.opacity > 0.01
    && (samples[index - 1]?.opacity ?? 0) <= 0.01).map((sample) => sample.at);
  expect(samples.length, 'rendered frames were observed').toBeGreaterThan(30);
  expect(starts, 'the sequence must visibly flash once, so a missing cue cannot pass').toHaveLength(1);
  for (const start of starts) {
    expect(starts.filter((at) => at >= start && at < start + 1_000).length).toBeLessThanOrEqual(3);
  }
  expect(samples.at(-1)?.opacity).toBe(0);
  // A missed compositor pulse must not hide an infinite or fast CSS animation.
  const animations = await locator.evaluateAll((elements) => elements.flatMap((element) =>
    element.getAnimations().map((animation) => {
      const timing = animation.effect?.getTiming();
      return { iterations: timing?.iterations, duration: timing?.duration };
    })));
  for (const animation of animations) {
    expect(animation.iterations).toBe(1);
    expect(Number(animation.duration)).toBeLessThanOrEqual(300);
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
  await page.clock.setFixedTime(CLOCK);
});

test('reduced motion: a heavier set shows the static PR card without any canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await preparePr(page);
  // Watch the whole sequence: an eagerly-created then removed canvas also fails.
  await page.evaluate(() => {
    let count = document.querySelectorAll('canvas').length;
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element) count += Number(node.matches('canvas')) + node.querySelectorAll('canvas').length;
      }
      Object.assign(globalThis, { __p4CanvasCount: count });
    }).observe(document.documentElement, { childList: true, subtree: true });
    Object.assign(globalThis, { __p4CanvasCount: count });
  });
  await log(page, '100');
  await expect(card(page)).toHaveAttribute('data-motion', 'static');
  await expect(card(page)).toContainText(copy.prE1rm);
  await expect(card(page).getByRole('button', { name: copy.backToWork })).toBeVisible();
  await page.waitForTimeout(1_600);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as { __p4CanvasCount?: number }).__p4CanvasCount)).toBe(0);
});

test('PR takeover has one impact pulse; Back to work preserves the timer deadline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await preparePr(page);
  await watchFlashes(page, '[data-flash]');
  await log(page, '100');
  await expect(card(page)).toHaveAttribute('data-motion', 'live');
  await expect(page.locator('.app-shell__tabs')).toBeHidden();
  await expect(card(page)).toHaveAttribute('data-phase', 'play');
  await assertSinglePulse(page, card(page).locator('[data-flash]'));
  await expect(chip(page)).toHaveText('2:00');
  await page.clock.setFixedTime(CLOCK + 130_000);
  await expect(chip(page)).toHaveText('1:50');
  await card(page).getByRole('button', { name: copy.backToWork }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('.app-shell__tabs')).toBeVisible();
  await expect(chip(page)).toHaveText('1:50');
  await page.clock.setFixedTime(CLOCK + 135_000);
  await expect(chip(page)).toHaveText('1:45');
});

test('timer zero has one visible pulse and stays quiet while overtime advances', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await reachFloor(page);
  await waitForBench(page);
  await openBench(page);
  await log(page, '80');
  await expect(chip(page)).toHaveText('2:00');
  await watchFlashes(page, '[data-testid="rest-pulse"]');
  await page.clock.setFixedTime(CLOCK + 120_000);
  await expect(page.getByText(copy.restComplete, { exact: true })).toBeVisible();
  await assertSinglePulse(page, page.getByTestId('rest-pulse'));
  await page.clock.setFixedTime(CLOCK + 125_000);
  await expect(chip(page)).toHaveText(fill(copy.restOverChip, { time: '0:05' }));
  await expect(page.getByTestId('rest-pulse')).toHaveCount(0);
});

test('partner shockwave bridge plays once across two opens in an independent context', async ({ browser, page }, info) => {
  await preparePr(page);
  await log(page, '100');
  await expect(card(page)).toBeVisible();
  const event = await page.evaluate(async () => {
    const dataPath = '/src/data/index.ts';
    const { createRepo } = await import(dataPath) as typeof import('../../src/data/index.ts');
    const rows = await createRepo().q.prEvents({});
    const pr = rows.find((row) => row.pr_type === 'e1rm');
    if (!pr) throw new Error('The real set did not create an e1RM PR');
    return { id: pr.id, name: 'partner', exercise: 'Bench press', detail: '100 kg × 5' };
  });
  const device = info.project.name === 'iPhone 15' ? devices['iPhone 15'] : devices['Pixel 7'];
  const viewer = await browser.newContext({ ...device, baseURL: info.project.use.baseURL });
  try {
    // Match P3G's two-user mock setup without replacing the real repo or UI.
    await viewer.route('**/src/data/adapter.mock.ts*', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      expect(body).toContain('export function createMockRemote');
      await route.fulfill({ response, body: body.replace('export function createMockRemote', 'function createMockRemoteForP4')
        + `\nexport function createMockRemote(options = {}) { return createMockRemoteForP4({ ...options, userId: '${MOCK_USER_IDS.bob}' }); }\n` });
    });
    await viewer.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
    let opened = await viewer.newPage();
    // The producer → unseen query → seen_by port is absent on main. Deliver at
    // P4E's existing publisher boundary; this test proves the UI/local reopen guard,
    // not remote delivery or server-side seen_by (see the PR contract request).
    const deliver = async (target: Page) => {
      await target.evaluate(async (row) => {
        const path = '/src/features/duo/shockwave.ts';
        const mod = await import(path) as typeof import('../../src/features/duo/shockwave.ts');
        mod.publishPartnerShockwaves([row]);
      }, event);
    };
    await reachFloor(opened);
    await expect(opened.locator(`[aria-labelledby="my-week-heading"] [data-member="${MOCK_USER_IDS.bob}"]`).first()).toBeAttached();
    await deliver(opened);
    const shockwave = opened.getByTestId('partner-shockwave');
    await expect(shockwave).toHaveAttribute('data-shockwave', event.id);
    await expect(shockwave).toHaveAttribute('data-motion', 'live');
    await expect(shockwave).toContainText('partner · Bench press · 100 kg × 5');
    await expect.poll(() => opened.evaluate(() => JSON.parse(localStorage.getItem('ironpact.shockwave.played') ?? '[]') as string[])).toContain(event.id);
    await expect(shockwave).toHaveCount(0);
    await opened.close();
    opened = await viewer.newPage();
    await reachFloor(opened);
    await opened.evaluate(() => {
      let count = 0;
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof Element) count += Number(node.matches('[data-testid="partner-shockwave"]'))
            + node.querySelectorAll('[data-testid="partner-shockwave"]').length;
        }
        Object.assign(globalThis, { __p4Shockwaves: count });
      }).observe(document.documentElement, { childList: true, subtree: true });
      Object.assign(globalThis, { __p4Shockwaves: count });
    });
    await deliver(opened);
    await opened.waitForTimeout(2_000);
    await expect(opened.getByTestId('partner-shockwave')).toHaveCount(0);
    expect(await opened.evaluate(() => (globalThis as { __p4Shockwaves?: number }).__p4Shockwaves)).toBe(0);
  } finally {
    await viewer.close();
  }
});
