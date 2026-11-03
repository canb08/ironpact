import { expect, type Page } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';

export const BENCH = '00000000-0000-4000-8000-000000000010';
export async function navigate(page: Page, to: string) {
  await page.evaluate(async (path) => {
    const modulePath = '/src/router.tsx';
    const { router } = await import(/* @vite-ignore */ modulePath) as typeof import('../../src/router.tsx');
    await router.navigate(path);
  }, to);
}

/** Load the production screens with the fully seeded real Repo fixture. */
export async function seedVisuals(page: Page, theme: 'dark' | 'light') {
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00.000Z'));
  await page.goto(`/tests/e2e/fixtures/x11.html?theme=${theme}`);
  await expect(page.getByRole('radio', { name: copy.progressLifts, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Bench press/ }).first()).toBeVisible();
}
