import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';

// Real screens, router and AuthGate with an isolated new-account Repo. The normal
// mock app is already signed in with a crew, so cannot exercise first-run setup.
async function visit(page: Page, scenario: string) {
  await page.goto(`/tests/e2e/fixtures/x9.html?scenario=${scenario}`);
}

async function audit(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const small = await page.locator('button, input, a[href]').evaluateAll((elements) => elements.filter((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
  }).map((element) => element.getAttribute('aria-label') ?? element.textContent));
  expect(small).toEqual([]);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
}

async function screenshot(page: Page, name: string) {
  await audit(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `tests/e2e/screenshots/x9/after/${name}.png` });
}

test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, reducedMotion: 'reduce',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
});

test('X9 first run: email code, crew, profile and three-card guide reach Today with a name', async ({ page }) => {
  await visit(page, 'signin');
  await page.getByLabel(copy.emailLabel, { exact: true }).fill('alice@example.test');
  await screenshot(page, 'email');
  await page.getByRole('button', { name: copy.sendCode, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.x9CheckEmail })).toBeVisible();
  await screenshot(page, 'code');
  await expect(page.getByRole('button', { name: copy.x9Resend })).toBeDisabled();
  await page.getByLabel('Code digit 1', { exact: true }).evaluate((input) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text', '123456');
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await page.getByRole('button', { name: copy.x9Verify, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.x9CrewTitle })).toBeVisible();
  await screenshot(page, 'crew-create');
  await page.getByRole('button', { name: copy.x9Continue, exact: true }).click();
  await page.getByLabel(copy.x9Name, { exact: true }).fill('Lifter');
  await expect(page.getByRole('button', { name: copy.x9Red, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('spinbutton', { name: copy.x9Target, exact: true })).toHaveValue('3');
  await screenshot(page, 'profile');
  await page.getByRole('button', { name: copy.x9Continue, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.x9Sessions })).toBeFocused();
  await screenshot(page, 'explainer-sessions');
  await page.getByRole('button', { name: copy.x9Next }).click();
  await screenshot(page, 'explainer-bar');
  await page.getByRole('button', { name: copy.x9Next }).click();
  await screenshot(page, 'explainer-prs');
  await page.getByRole('button', { name: copy.x9Finish }).click();
  await expect(page.getByTestId('shared-bar')).toContainText('Lifter');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ironpact.x9.guide.user-1'))).toBe('1');
});

test('X9 join keeps the invite, defaults to blue and allows a different colour and target', async ({ page }) => {
  await visit(page, 'join');
  await expect(page.getByLabel('Invite character 1', { exact: true })).toHaveValue('A');
  await expect(page.getByLabel('Invite character 10', { exact: true })).toHaveValue('K');
  await screenshot(page, 'crew-join');
  await page.getByRole('button', { name: copy.x9Continue, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.x9Blue, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: copy.x9Red, exact: true }).click();
  await page.getByLabel(copy.x9Name, { exact: true }).fill('Spotter');
  await page.getByRole('spinbutton', { name: copy.x9Target, exact: true }).fill('4');
  await page.getByRole('button', { name: copy.x9Continue, exact: true }).click();
  await page.getByRole('button', { name: copy.x9Skip }).click();
  await expect(page.getByTestId('shared-bar')).toContainText('Spotter');
  await expect(page.getByTestId('shared-bar')).toContainText('0 of 4');
});

test('X9 Today name prompt integration preview is dismissible and account scoped', async ({ page }) => {
  // Preview-only mount; the production FloorScreen import requires Lead approval.
  await visit(page, 'today');
  await expect(page.getByRole('region', { name: copy.x9NamePrompt })).toBeVisible();
  await screenshot(page, 'today-name-prompt');
  await page.getByRole('button', { name: copy.x9Dismiss }).click();
  await expect(page.getByRole('region', { name: copy.x9NamePrompt })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shared-bar')).toBeVisible();
  await expect(page.getByRole('region', { name: copy.x9NamePrompt })).toHaveCount(0);
});

test('X9 install, light theme and 200% text preserve focus, targets and width', async ({ page }) => {
  await visit(page, 'install');
  await expect(page.getByRole('heading', { name: copy.installTitle })).toBeVisible();
  await screenshot(page, 'install');
  for (const scenario of ['signin', 'join', 'today']) {
    await visit(page, scenario);
    await expect(page.locator('main')).toBeVisible();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.style.fontSize = '200%'; });
    await audit(page);
    if (scenario === 'join') {
      await page.getByRole('button', { name: copy.x9Continue, exact: true }).click();
      await audit(page);
    }
  }
});
