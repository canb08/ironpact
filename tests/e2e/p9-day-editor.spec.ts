import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Repo } from '../../src/data/adapter.ts';
import { copy } from '../../src/ui/copy.ts';
import { mirrorCounts, reachFloor, waitForBench } from './helpers.ts';

test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });

async function openWorkout(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
  await reachFloor(page);
  await waitForBench(page);
  const date = await page.evaluate(async () => {
    const modulePath = '/src/data/index.ts';
    const { createRepo } = await import(/* @vite-ignore */ modulePath) as { createRepo: () => Repo };
    const repo = createRepo();
    const started = await repo.w.startSession({ kind: 'gym' });
    if (!started.ok) throw new Error(started.error);
    const bench = '00000000-0000-4000-8000-000000000010';
    const squat = await repo.w.createExercise({ name: 'Squat', export_label: 'Squat', kind: 'lift', category: 'compound', lower_body: true });
    if (!squat.ok) throw new Error(squat.error);
    for (let index = 0; index < 15; index++) {
      const result = await repo.w.logSet({ session_id: started.value.id, exercise_id: index < 8 ? bench : squat.value.id, reps: 5, weight_kg: index < 8 ? 80 : 100 });
      if (!result.ok) throw new Error(result.error);
    }
    const finished = await repo.w.finishSession(started.value.id);
    if (!finished.ok) throw new Error(finished.error);
    const edited = await repo.w.updateSession(started.value.id, { note: 'Steady working sets', started_at: `${started.value.local_date}T17:00:00.000Z`, ended_at: `${started.value.local_date}T18:00:00.000Z` });
    if (!edited.ok) throw new Error(edited.error);
    return started.value.local_date;
  });
  // Stay in the app: a hard navigation recreates the in-memory mock server.
  await page.locator('.app-shell__tabs a[href="/progress"]').click();
  await page.locator('a[href="/exercise/00000000-0000-4000-8000-000000000010"]').first().click();
  await page.locator(`a[href="/day/${date}"]`).first().click();
  return date;
}

test('375px day editor screenshots', async ({ page }) => {
  test.skip(!process.env.X6_SCREENSHOTS, 'Opt-in screenshot capture');
  await openWorkout(page);
  const phase = process.env.X6_SCREENSHOTS;
  const directory = `tests/e2e/screenshots/x6/${phase}`;
  await mkdir(directory, { recursive: true });
  await expect(page.getByText('Steady working sets', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}/day.png` });
  if (phase === 'before') {
    // The old editor has no sheet: capture its equivalent expanded set form.
    await page.getByRole('region', { name: 'Set 1', exact: true }).first().scrollIntoViewIfNeeded();
  } else {
    await page.locator('.day-set-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  }
  await page.screenshot({ path: `${directory}/edit.png` });
});

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
}

test('15 compact sets fit two screens, and weekday chips and sheets work in both themes', async ({ page }) => {
  const date = await openWorkout(page);
  const rows = page.locator('.day-set-row');
  await expect(rows).toHaveCount(15);
  await expect(page.locator('.day-editor form')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812 * 2);
  const chips = page.locator('.day-chip');
  await expect(chips).toHaveCount(7);
  await expect(chips.first()).toContainText('Mon');
  await expect(chips.last()).toContainText('Sun');
  await expect(page.locator('.day-chip[aria-current="date"]')).toHaveAttribute('href', `/day/${date}`);
  for (const target of await page.locator('.day-chip, .day-set-row, .day-session-header, .day-week-heading button').all()) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    await checkLayout(page);
    await rows.first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: 'Decrease kg', exact: true })).toBeFocused();
    await checkLayout(page);
    await sheet.getByRole('button', { name: copy.close, exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(sheet.getByRole('button', { name: 'Decrease kg', exact: true })).toBeFocused();
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(rows.first()).toBeFocused();
  }
  await page.getByRole('button', { name: copy.x6PreviousWeek }).click();
  await expect(page).not.toHaveURL(`/day/${date}`);
  await page.getByRole('button', { name: copy.x6NextWeek }).click();
  await expect(page).toHaveURL(`/day/${date}`);
  await expect(rows).toHaveCount(15);
});

test('editing a set in a sheet saves every field and survives reload', async ({ page }) => {
  await openWorkout(page);
  const row = page.locator('.day-set-row').first();
  await row.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('spinbutton', { name: copy.kg, exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await sheet.getByRole('button', { name: 'Increase kg', exact: true }).click();
  await sheet.getByRole('spinbutton', { name: copy.reps, exact: true }).fill('6');
  await sheet.getByRole('button', { name: '8', exact: true }).click();
  await sheet.getByRole('button', { name: copy.x6Warmup, exact: true }).click();
  await sheet.getByRole('textbox', { name: copy.note, exact: true }).fill('Controlled reps');
  await sheet.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toContainText('6 × 82.5 kg');
  await expect.poll(async () => (await mirrorCounts(page)).pending).toBeGreaterThan(0);
  await page.context().setOffline(false);
  await expect.poll(async () => {
    const { pending, dead } = await mirrorCounts(page);
    return { pending, dead };
  }).toEqual({ pending: 0, dead: 0 });
  await row.click();
  await sheet.getByRole('button', { name: copy.x6DeleteSet, exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.day-set-row')).toHaveCount(14);
  await page.getByRole('button', { name: copy.restore, exact: true }).click();
  await expect(page.locator('.day-set-row')).toHaveCount(15);
  await expect(row).toContainText('6 × 82.5 kg');
  await expect.poll(async () => {
    const { pending, dead } = await mirrorCounts(page);
    return { pending, dead };
  }).toEqual({ pending: 0, dead: 0 });
  await page.reload();
  await row.click();
  await expect(sheet.getByRole('spinbutton', { name: copy.kg, exact: true })).toHaveValue('82.5');
  await expect(sheet.getByRole('spinbutton', { name: copy.reps, exact: true })).toHaveValue('6');
  await expect(sheet.getByRole('button', { name: '8', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: copy.x6Warmup, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('textbox', { name: copy.note, exact: true })).toHaveValue('Controlled reps');
});

test('session edits move every set; workout deletion requires a hold and restores children', async ({ page }) => {
  const date = await openWorkout(page);
  const editWorkout = page.getByRole('button', { name: 'Edit workout', exact: true });
  await editWorkout.click();
  const sheet = page.getByRole('dialog');
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);
  await sheet.getByLabel(copy.dateLabel, { exact: true }).fill(nextDate);
  await sheet.getByLabel(copy.sessionNoteLabel, { exact: true }).fill('Moved workout');
  await sheet.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(`/day/${nextDate}`);
  await expect(page.locator('.day-set-row')).toHaveCount(15);
  await expect(page.getByText('Moved workout', { exact: true })).toBeVisible();
  const remove = page.getByRole('button', { name: copy.x6DeleteWorkout, exact: true });
  await remove.click();
  await expect(page.locator('.day-set-row')).toHaveCount(15);
  await remove.focus();
  await page.keyboard.down('Space');
  await expect(page.locator('.day-workout')).toHaveCount(0);
  await page.keyboard.up('Space');
  await expect(page.getByText(copy.emptyDay, { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const { pending, dead } = await mirrorCounts(page);
    return { pending, dead };
  }).toEqual({ pending: 0, dead: 0 });
  await page.getByRole('button', { name: copy.restore, exact: true }).click();
  await expect(page.locator('.day-set-row')).toHaveCount(15);
  await expect(page.getByText('Moved workout', { exact: true })).toBeVisible();
});
