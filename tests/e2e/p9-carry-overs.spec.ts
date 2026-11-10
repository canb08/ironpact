import { expect, test } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';
import { BENCH, navigate, seedVisuals } from './x11-seed.ts';

test.use({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce', timezoneId: 'Europe/Amsterdam' });

test('calendar ranges and activity delete labels describe the selected day', async ({ page }) => {
  await seedVisuals(page, 'dark');
  await navigate(page, '/day/2026-11-02');
  await expect(page.locator('.day-week-heading')).toContainText('Mon 2 Nov - Sun 8 Nov');
  await expect(page.getByRole('button', { name: copy.x6DeleteWorkout, exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: copy.x11DeleteRun, exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: copy.x11DeleteMin, exact: true })).toHaveCount(1);
  await page.locator('.day-session-header').filter({ hasText: copy.x6WeighIn }).click();
  await expect(page.getByRole('button', { name: copy.x11DeleteWeighIn, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await navigate(page, `/exercise/${BENCH}`);
  await expect(page.locator('.progress-muted').filter({ hasText: / - / }).first()).toContainText('Tue 3 Nov');
  await expect(page.locator('.progress-muted').filter({ hasText: / - / }).first()).not.toContainText('Today');
});

test('legacy partner names use the fallback in Progress and exercise detail', async ({ page }) => {
  await seedVisuals(page, 'dark');
  await expect(page.getByRole('switch', { name: `Show ${copy.x3Partner}`, exact: true })).toBeVisible();
  await expect(page.getByText(copy.x3LegacyName, { exact: true })).toHaveCount(0);
  await navigate(page, `/exercise/${BENCH}`);
  await expect(page.getByRole('switch', { name: `Show ${copy.x3Partner}`, exact: true })).toBeVisible();
  await expect(page.getByText(copy.x3LegacyName, { exact: true })).toHaveCount(0);
});

test('each quick log confirms its own action inside the accessible sheet', async ({ page }) => {
  await seedVisuals(page, 'dark');
  for (const [kind, save, saved] of [
    ['weight', copy.x11SaveWeighIn, copy.x11WeighInSaved],
    ['run', copy.x11SaveRun, copy.x11RunSaved],
    ['min', copy.x11SaveMin, copy.x11MinSaved],
  ] as const) {
    await navigate(page, `/log/${kind}`);
    const sheet = page.getByRole('dialog');
    if (kind === 'weight') await sheet.getByLabel(copy.weight, { exact: true }).fill('78.4');
    await sheet.getByRole('button', { name: save, exact: true }).click();
    if (kind === 'run') {
      await expect(page.getByRole('dialog', { name: copy.y9Together }).getByText(copy.summarySaved)).toBeVisible();
    } else {
      await expect(sheet.getByRole('status')).toHaveText(saved);
      await expect(sheet.getByText(saved, { exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
  }
});

test('Appearance theme segments support arrows and persist the selected theme', async ({ page }) => {
  await seedVisuals(page, 'dark');
  await navigate(page, '/settings/appearance');
  const theme = page.getByRole('radiogroup', { name: copy.themeChoice, exact: true });
  const dark = theme.getByRole('radio', { name: copy.themeDark, exact: true });
  await dark.focus();
  await page.keyboard.press('ArrowRight');
  await expect(theme.getByRole('radio', { name: copy.themeLight, exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(theme.getByRole('radio', { name: copy.themeLight, exact: true })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await navigate(page, '/settings');
  await navigate(page, '/settings/appearance');
  await expect(theme.getByRole('radio', { name: copy.themeLight, exact: true })).toHaveAttribute('aria-checked', 'true');
});
