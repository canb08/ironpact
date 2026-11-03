import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { copy } from '../../src/ui/copy.ts';
import { logBench } from './helpers.ts';
import { BENCH, navigate, seedVisuals } from './x11-seed.ts';

test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: 'Europe/Amsterdam' });
test.beforeEach(({ browserName }) => { test.skip(browserName !== 'webkit' && !process.env.X11_CHROMIUM, 'X11 baselines use iPhone 15 WebKit on Linux'); });

async function capture(page: Page, name: string, scrollTop = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((top) => { if (top) window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }, scrollTop);
  if (process.env.X11_CAPTURE === 'before') {
    const path = `tests/e2e/screenshots/x11/before/${name}.png`;
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await page.screenshot({ path, animations: 'disabled' });
    return;
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const smallTargets = await page.locator('button, a[href], input:not([type="checkbox"]):not([type="radio"]), select, summary, [role="slider"]').evaluateAll((elements) => elements.filter((element) => {
    if (element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  }).map((element) => element.getAttribute('aria-label') ?? element.textContent));
  expect(smallTargets, `${name}: 44 px targets`).toEqual([]);
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })), name).toEqual([]);
  // Soft assertions collect every screen while still failing CI for any mismatch.
  await expect.soft(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
  if (process.env.X11_CAPTURE === 'after') {
    const path = `tests/e2e/screenshots/x11/after/${name}.png`;
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await page.screenshot({ path, animations: 'disabled' });
  }
}

for (const theme of ['dark', 'light'] as const) {
  test(`R2 populated screens in ${theme}`, async ({ page }) => {
    test.setTimeout(240_000);
    await seedVisuals(page, theme);
    for (const label of [copy.progressLifts, copy.x5Cardio, copy.x5Fight, copy.progressBody]) {
      await page.getByRole('radio', { name: label, exact: true }).click();
      await expect(page.locator('.progress-panel .progress-line--you').first()).toBeVisible();
      await capture(page, `${theme}/progress-${label.toLowerCase()}`);
    }
    await navigate(page, `/exercise/${BENCH}`);
    await expect(page.getByTestId('best-e1rm')).toContainText('93.3');
    await capture(page, `${theme}/exercise`);
    await navigate(page, '/day/2026-11-02');
    await expect(page.locator('.day-set-row')).toHaveCount(6);
    await capture(page, `${theme}/day`);
    await page.locator('.day-set-row').first().click();
    await capture(page, `${theme}/day-edit`);
    await page.keyboard.press('Escape');
    for (const kind of [copy.run, copy.min]) {
      await page.locator('.day-workout').filter({ has: page.getByRole('button', { name: new RegExp(`^Edit ${kind === copy.min ? kind : kind.toLowerCase()}$`) }) }).scrollIntoViewIfNeeded();
      await capture(page, `${theme}/day-${kind.toLowerCase()}`, false);
    }
    await page.locator('.day-session-header').filter({ hasText: copy.x6WeighIn }).click();
    await capture(page, `${theme}/day-weigh-in`);
    await page.keyboard.press('Escape');
    await navigate(page, '/day/2026-11-03');
    await capture(page, `${theme}/day-today`);
    await navigate(page, '/crew');
    await expect(page.locator('.crew-hero').first()).toBeVisible();
    await capture(page, `${theme}/crew`);
    await navigate(page, '/settings');
    await expect(page.getByRole('button', { name: new RegExp(`^${copy.settingsProfile}`) })).toBeVisible();
    await capture(page, `${theme}/settings`);
    await navigate(page, '/settings/appearance');
    await expect(page.locator('.settings-profile')).toHaveAttribute('aria-busy', 'false');
    await capture(page, `${theme}/appearance`);
    await navigate(page, '/');
    await expect(page.getByTestId('shared-bar')).toBeVisible();
    await capture(page, `${theme}/today`);
    for (const kind of ['weight', 'run', 'min']) {
      await navigate(page, `/log/${kind}`);
      await expect(page.getByRole('dialog')).toBeVisible();
      await capture(page, `${theme}/log-${kind}`);
      if (kind === 'weight') await page.getByRole('dialog').getByLabel(copy.weight, { exact: true }).fill('78.4');
      await page.getByRole('dialog').locator('button[type="submit"]').click();
      if (process.env.X11_CAPTURE !== 'before') {
        const saved = kind === 'weight' ? copy.x11WeighInSaved : kind === 'run' ? copy.x11RunSaved : copy.x11MinSaved;
        await expect(page.getByRole('dialog').getByRole('status')).toHaveText(saved);
      }
      await capture(page, `${theme}/log-${kind}-saved`);
      await page.getByRole('button', { name: copy.close, exact: true }).click();
    }
    await navigate(page, '/session');
    await expect(page.getByRole('dialog', { name: copy.pickerTitle })).toBeVisible();
    await capture(page, `${theme}/train-picker`);
    await logBench(page, 6);
    await expect(page.locator('[data-session-dock]')).toBeVisible();
    await capture(page, `${theme}/train-rest`);
    const skip = page.getByRole('button', { name: copy.skip, exact: true });
    await expect(skip).toBeVisible();
    await skip.click();
    await expect(skip).toBeHidden();
    await capture(page, `${theme}/train-six-sets`);
    await page.getByRole('button', { name: copy.x4FinishHold, exact: true }).focus();
    await page.keyboard.down('Enter');
    await page.clock.setFixedTime(new Date('2026-11-03T12:00:01.000Z'));
    try { await expect(page.getByRole('region', { name: copy.summaryTitle })).toBeVisible(); }
    finally { await page.keyboard.up('Enter'); }
    await capture(page, `${theme}/train-summary`);
  });

  test(`R2 onboarding in ${theme}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-03T12:00:00.000Z'));
    for (const scenario of ['install', 'signin', 'join', 'crew']) {
      await page.goto(`/tests/e2e/fixtures/x9.html?scenario=${scenario}`);
      await expect(page.locator('main')).toBeVisible();
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      await capture(page, `${theme}/onboarding-${scenario}`);
      if (scenario === 'crew') {
        await page.getByRole('button', { name: copy.x9Continue, exact: true }).click();
        await page.getByLabel(copy.x9Name, { exact: true }).fill('Lifter');
        await capture(page, `${theme}/onboarding-profile`);
        await page.getByRole('button', { name: copy.x9Continue, exact: true }).click();
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        for (const card of ['sessions', 'bar', 'prs']) {
          await capture(page, `${theme}/onboarding-${card}`);
          if (card !== 'prs') await page.getByRole('button', { name: copy.x9Next }).click();
        }
      }
    }
  });
}
