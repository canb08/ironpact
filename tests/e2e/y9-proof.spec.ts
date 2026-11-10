import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { copy } from '../../src/ui/copy.ts';
import { logBench, reachFloor, waitForBench } from './helpers.ts';

test.describe('Y9 Proof', () => {
  test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
    await reachFloor(page);
    await waitForBench(page);
  });
  async function capture(page: Page, name: string) {
    if (!process.env.Y9_ARTIFACT_DIR) return;
    await mkdir(process.env.Y9_ARTIFACT_DIR, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.Y9_ARTIFACT_DIR}/${name}.png`, animations: 'disabled' });
  }
  async function wall(page: Page) {
    await page.locator('.app-shell__tabs').getByRole('link', { name: copy.y9Title, exact: true }).click();
    await expect(page.locator('.proof-stats')).toBeVisible();
  }
  async function assertQuality(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const targets = await page.locator('button:visible, a:visible').evaluateAll((nodes) => nodes.filter((node) => !node.closest('[inert]')).map((node) => ({ text: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    for (const target of targets) { expect(target.width, target.text ?? '').toBeGreaterThanOrEqual(44); expect(target.height, target.text ?? '').toBeGreaterThanOrEqual(44); }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  async function finishLift(page: Page) {
    await logBench(page, 1);
    await page.getByRole('button', { name: copy.x4FinishHold, exact: true }).focus();
    await page.keyboard.down('Enter');
    try { await expect(page.getByRole('region', { name: copy.summaryTitle })).toBeVisible(); }
    finally { await page.keyboard.up('Enter'); }
    await page.getByRole('button', { name: copy.summaryDone, exact: true }).click();
    await expect(page.getByRole('dialog', { name: copy.y9Together })).toBeVisible();
  }
  async function upload(page: Page, name: string, label: string) {
    const png = await page.evaluate((color) => {
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 160;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 120, 160);
      ctx.fillStyle = '#edebe6'; ctx.fillRect(20, 70, 80, 8);
      ctx.fillStyle = '#d3263a'; ctx.fillRect(28, 40, 12, 70); ctx.fillRect(80, 40, 12, 70);
      return canvas.toDataURL('image/png').split(',')[1]!;
    }, name === 'replacement.png' ? '#2563c9' : '#2a2c30');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: label, exact: true }).click();
    await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  }
  test('lift together photo, solo run placeholder, viewer edits and Crew link', async ({ page }) => {
    await wall(page);
    await expect(page.getByText(copy.y9Empty)).toBeVisible();
    await assertQuality(page); await capture(page, 'proof-empty');
    await page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Today, exact: true }).click();
    await finishLift(page);
    await assertQuality(page); await capture(page, 'prompt-together');
    await page.getByRole('button', { name: /^With / }).click();
    const photoPrompt = page.getByRole('dialog', { name: copy.y9AddPhoto });
    await expect(photoPrompt.locator('input[capture="environment"]')).toHaveAttribute('accept', 'image/*');
    await assertQuality(page); await capture(page, 'prompt-photo');
    await page.context().setOffline(true);
    await upload(page, 'proof.png', copy.y9TakePhoto);
    await expect(photoPrompt).toBeHidden();
    await wall(page);
    await expect(page.locator('.proof-card img[alt="Workout photo"]')).toBeVisible();
    await expect(page.locator('.proof-card img[alt="Workout photo"]')).toHaveAttribute('src', /^blob:/);
    await page.context().setOffline(false);
    await expect(page.getByText(copy.y9Session, { exact: true })).toBeVisible();
    await page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Today, exact: true }).click();
    await page.getByRole('link', { name: copy.x3Run, exact: true }).click();
    await page.getByRole('button', { name: copy.x11SaveRun, exact: true }).click();
    await page.getByRole('button', { name: copy.y9Solo, exact: true }).click();
    await page.getByRole('dialog', { name: copy.y9AddPhoto }).getByRole('button', { name: copy.y9Skip, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await wall(page);
    const cards = page.locator('.proof-card');
    await expect(cards).toHaveCount(2);
    const boxes = await cards.evaluateAll((nodes) => nodes.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    expect(boxes[0]!.y).toBe(boxes[1]!.y); expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x);
    const runCard = page.locator('.proof-card').filter({ hasText: /^.*Run/s });
    await expect(runCard.locator('img')).toHaveCount(0);
    await expect(runCard.locator('.proof-route')).toBeVisible();
    await expect(runCard.locator('.proof-bar')).toHaveCount(0);
    await assertQuality(page); await capture(page, 'proof-filled');
    await cards.filter({ has: page.locator('img') }).getByRole('button').click();
    const viewer = page.getByRole('dialog', { name: copy.y9Title, exact: true });
    await expect(viewer.getByRole('region', { name: copy.y9Details })).toContainText('Bench press');
    await expect(viewer.locator('img[alt="Workout photo"]')).toBeVisible();
    await assertQuality(page); await capture(page, 'proof-viewer');
    await viewer.getByRole('button', { name: copy.y9Menu }).click();
    await viewer.getByRole('button', { name: copy.y9Caption, exact: true }).click();
    await viewer.getByLabel(copy.y9Caption, { exact: true }).fill('One more session');
    await viewer.getByRole('button', { name: copy.y9SaveCaption }).click();
    await expect(viewer.getByText('One more session', { exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: copy.y9Menu }).click();
    await upload(page, 'replacement.png', copy.y9Replace);
    await expect(viewer.getByRole('button', { name: copy.y9Replace })).toBeHidden();
    await viewer.getByRole('button', { name: copy.y9Menu }).click();
    await viewer.getByRole('button', { name: copy.y9Remove, exact: true }).click();
    await expect(viewer.locator('img')).toHaveCount(0);
    await viewer.getByRole('button', { name: copy.y9Previous }).click();
    await expect(viewer.getByRole('region', { name: copy.y9Details })).toContainText('Run');
    const surface = viewer.locator('.proof-viewer__photos');
    await surface.dispatchEvent('pointerdown', { clientX: 310, clientY: 220 });
    await surface.dispatchEvent('pointerup', { clientX: 70, clientY: 225 });
    await expect(viewer.getByRole('region', { name: copy.y9Details })).toContainText('Bench press');
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await page.locator('.app-shell__tabs').getByRole('link', { name: copy.crewTitle, exact: true }).click();
    await page.getByRole('link', { name: copy.y9CrewLink, exact: true }).click();
    await expect(viewer.getByText('One more session', { exact: true })).toBeVisible();
  });
  test('closing either prompt step records solo without blocking the workout', async ({ page }) => {
    await page.getByRole('link', { name: copy.x3Fight, exact: true }).click();
    await page.getByRole('button', { name: copy.y2LogClass, exact: true }).click();
    await expect(page.getByRole('button', { name: /^With / })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^With / }).click();
    await page.getByRole('dialog', { name: copy.y9AddPhoto }).getByRole('button', { name: copy.close, exact: true }).click();
    await wall(page);
    await expect(page.locator('.proof-card')).toHaveCount(1);
    await expect(page.locator('.proof-total')).toHaveText('0 sessions together');
    await expect(page.locator('.proof-card img')).toHaveCount(0);
    await page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Today, exact: true }).click();
    await page.getByRole('link', { name: copy.x3Run, exact: true }).click();
    await page.getByRole('button', { name: copy.x11SaveRun, exact: true }).click();
    await page.getByRole('dialog', { name: copy.y9Together }).getByRole('button', { name: copy.close, exact: true }).click();
    await wall(page); await expect(page.locator('.proof-card')).toHaveCount(2);
    await page.reload(); await expect(page.locator('.proof-card')).toHaveCount(2);
  });
});
