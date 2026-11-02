import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';

const sections = [
  ['profile', copy.settingsProfile],
  ['training', copy.settingsTraining],
  ['appearance', copy.x8Appearance],
  ['privacy', copy.x8Privacy],
  ['crew', copy.settingsCrew],
  ['account', copy.settingsAccount],
] as const;

test.use({ viewport: { width: 375, height: 812 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: new RegExp(`^${copy.settingsProfile}`) })).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test(`settings index and six sub-pages fit mobile, remain accessible and navigate back in ${theme}`, async ({ page }) => {
    await page.evaluate(async (value) => {
      const path = '/src/data/index.ts';
      const { createRepo } = await import(path) as typeof import('../../src/data/index.ts');
      const repo = createRepo();
      await repo.w.upsertMyProfile({ theme: value });
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect(page.getByText(copy.settingsNotifications, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812);
    for (const [section, title] of sections) {
      const row = page.getByRole('button', { name: new RegExp(`^${title}`) });
      const box = await row.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/settings/${section}$`));
      await expect(page.locator('.app-shell__header').getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
      if (['profile', 'training', 'appearance', 'privacy'].includes(section)) {
        await expect(page.locator('.settings-profile')).toHaveAttribute('aria-busy', 'false');
      }
      for (const control of await page.getByRole('switch').all()) {
        expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await expect(control).toHaveAttribute('aria-checked', /^(true|false)$/);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1624);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
      await expect(page).toHaveURL(/\/settings$/);
    }
  });
}

test('profile saves survive navigation, notifications stay hidden, and export controls work locally offline', async ({ page, context }) => {
  await page.getByRole('button', { name: new RegExp(`^${copy.settingsProfile}`) }).click();
  const name = page.getByRole('textbox', { name: copy.displayName });
  await expect(name).toBeEnabled();
  await name.fill('Lifter');
  await name.blur();
  await expect.poll(async () => page.evaluate(async () => {
    const path = '/src/data/index.ts';
    const { createRepo } = await import(path) as typeof import('../../src/data/index.ts');
    return (await createRepo().q.me())?.display_name;
  })).toBe('Lifter');
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${copy.x8Privacy}`) }).click();
  await page.locator('summary').filter({ hasText: copy.x8Tokens }).click();
  await page.locator('summary').filter({ hasText: copy.exportPreview }).click();
  await expect(page.getByRole('button', { name: copy.generateToken })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: copy.generateToken })).toBeDisabled();
  await page.getByRole('button', { name: copy.exportJson, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.exportJson, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: copy.exportPreview }).locator('pre')).toBeVisible();
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${copy.settingsProfile}`) }).click();
  await expect(name).toHaveValue('Lifter');
  await expect(page.getByText(copy.settingsNotifications, { exact: true })).toHaveCount(0);
});

test('switches support keyboard input, visible focus and persisted state', async ({ page }) => {
  await page.getByRole('button', { name: new RegExp(`^${copy.x8Appearance}`) }).click();
  const sound = page.getByRole('switch', { name: copy.soundOn, exact: true });
  await expect(sound).toBeEnabled();
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await sound.focus();
  await page.keyboard.press('Space');
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  expect(await sound.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: copy.x1Back, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${copy.x8Appearance}`) }).click();
  await expect(sound).toHaveAttribute('aria-checked', 'false');
});
