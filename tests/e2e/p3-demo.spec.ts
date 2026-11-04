import { devices, expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { MOCK_USER_IDS } from '../../src/data/adapter.mock.ts';
import { copy } from '../../src/ui/copy.ts';
import { reachFloor } from './helpers.ts';

/**
 * L10's mock bus is one in-memory room per page, not a cross-process transport.
 * This harness leaves that bus in place and only copies committed upserts and
 * presence between the two pages, so each page's own mock still fans out,
 * pulls and expires presence.
 */
const PARTNER = 'Partner';
const QUIET = new RegExp(String.raw`^${PARTNER} is training: \d+ min$`);
const BENCH = new RegExp(String.raw`^${PARTNER} is training: Bench 1/1, \d+ min$`);

interface HubMsg {
  kind: 'upsert' | 'presence';
  table?: string;
  rows?: unknown[];
  crewId?: string;
  row?: unknown;
}

class MockHub {
  private readonly log: { from: string; msg: HubMsg }[] = [];
  private readonly cursor = new Map<string, number>();

  handle(payload: unknown): HubMsg[] {
    if (!payload || typeof payload !== 'object') return [];
    const body = payload as { op?: unknown; id?: unknown; msg?: HubMsg };
    if (typeof body.id !== 'string' || (body.op !== 'pull' && body.op !== 'push')) return [];
    if (body.op === 'push' && body.msg && (body.msg.kind === 'upsert' || body.msg.kind === 'presence')) {
      this.log.push({ from: body.id, msg: body.msg });
      return [];
    }
    const from = this.cursor.get(body.id) ?? 0;
    const batch = this.log.slice(from).flatMap((entry) => entry.from === body.id ? [] : [entry.msg]);
    this.cursor.set(body.id, this.log.length);
    return batch;
  }
}

const HARNESS = `
const __p3gPageId = crypto.randomUUID();
const __p3gInbox = [];
const __p3gShadows = new Map();
const __p3gListeners = new Set();
let __p3gRemote = null;
function __p3gDrain() {
  if (!__p3gRemote) return;
  const batch = __p3gInbox.splice(0, __p3gInbox.length);
  const later = [];
  let changed = false;
  for (const msg of batch) {
    if (msg.kind === 'upsert' && Array.isArray(msg.rows)) {
      __p3gRemote.seed(msg.table, msg.rows);
      changed = true;
    } else if (msg.kind === 'presence') {
      const shadow = __p3gShadows.get(msg.crewId);
      if (shadow) shadow.setPresence(msg.row);
      else later.push(msg);
    }
  }
  if (later.length) __p3gInbox.unshift(...later);
  if (changed) for (const callbacks of __p3gListeners) callbacks.onChange();
}
async function __p3gTick() {
  try {
    const batch = await globalThis.__p3gHub({ op: 'pull', id: __p3gPageId });
    if (Array.isArray(batch) && batch.length) __p3gInbox.push(...batch);
  } catch { /* The binding is installed before navigation. */ }
  __p3gDrain();
}
globalThis.__p3gPullNow = __p3gTick;
export function createMockRemote(options = {}) {
  let next = options;
  try {
    if (globalThis.localStorage && localStorage.getItem('ironpact.p3g-user') === 'bob') {
      next = { ...options, userId: '${MOCK_USER_IDS.bob}' };
    }
  } catch { /* localStorage can be blocked; the page stays Alice. */ }
  const remote = createMockRemoteUnshared(next);
  __p3gRemote = remote;
  const upsert = remote.upsert.bind(remote);
  remote.upsert = async (table, rows) => {
    const result = await upsert(table, rows);
    if (result && result.ok && Array.isArray(result.value)) {
      try {
        await globalThis.__p3gHub({ op: 'push', id: __p3gPageId, msg: { kind: 'upsert', table, rows: result.value } });
      } catch { /* Ignore a closed page. */ }
    }
    return result;
  };
  const subscribeCrew = remote.subscribeCrew.bind(remote);
  remote.subscribeCrew = async (crewId, callbacks) => {
    __p3gListeners.add(callbacks);
    let connection;
    try {
      connection = await subscribeCrew(crewId, callbacks);
    } catch (error) {
      globalThis.__p3gSubError = String(error && error.message ? error.message : error);
      throw error;
    }
    let shadow = __p3gShadows.get(crewId);
    if (!shadow) {
      shadow = await subscribeCrew(crewId, { onPresence() {}, onChange() {} });
      __p3gShadows.set(crewId, shadow);
    }
    globalThis.__p3gSubscribed = (globalThis.__p3gSubscribed ?? 0) + 1;
    __p3gDrain();
    return {
      setPresence(row) {
        connection.setPresence(row);
        void globalThis.__p3gHub({ op: 'push', id: __p3gPageId, msg: { kind: 'presence', crewId, row } }).catch(() => {});
      },
      reconnect() { connection.reconnect(); shadow.reconnect(); },
      close() { __p3gListeners.delete(callbacks); connection.close(); },
    };
  };
  setInterval(() => { void __p3gTick(); }, 40);
  void __p3gTick();
  return remote;
}
`;

async function shareMock(context: BrowserContext, hub: MockHub, pages: Set<Page>): Promise<void> {
  await context.exposeBinding('__p3gHub', async (source, payload: unknown) => {
    pages.add(source.page);
    const op = payload && typeof payload === 'object' && 'op' in payload ? (payload as { op?: unknown }).op : undefined;
    const batch = hub.handle(payload);
    if (op === 'push') {
      for (const other of pages) {
        if (other === source.page) continue;
        void other.evaluate(() => {
          const pull = (globalThis as { __p3gPullNow?: () => Promise<void> }).__p3gPullNow;
          return pull?.();
        });
      }
    }
    return batch;
  });
  await context.route('**/src/data/adapter.mock.ts*', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes('export function createMockRemote')) {
      throw new Error('P3G harness could not find createMockRemote in the dev mock module');
    }
    const patched = body.replace('export function createMockRemote', 'function createMockRemoteUnshared') + HARNESS;
    await route.fulfill({ response, body: patched });
  });
}

async function today(page: Page): Promise<void> {
  const tab = page.locator('.app-shell__tabs').getByRole('link', { name: copy.x10Today, exact: true });
  if (await tab.isVisible()) await tab.click();
  else await page.goto('/');
}

async function onFloor(page: Page): Promise<void> {
  await expect.poll(async () => {
    const install = page.getByRole('link', { name: copy.installContinue });
    if (await install.isVisible()) await install.click();
    const path = new URL(page.url()).pathname;
    if (path === '/install' || path === '/crew/new' || path === '/sign-in') await today(page);
    return new URL(page.url()).pathname === '/' && await page.getByTestId('shared-bar').isVisible();
  }, { timeout: 20_000 }).toBe(true);
}

async function subscriptionCount(page: Page): Promise<number> {
  return page.evaluate(() => (globalThis as { __p3gSubscribed?: number }).__p3gSubscribed ?? 0);
}

async function expectMine(page: Page, userId: string): Promise<void> {
  await expect(page.getByTestId('shared-bar').getByRole('img')).toHaveAccessibleName(/^You 0 of 3, Partner 0 of 3$/);
  await expect(page.getByTestId('shared-bar')).toHaveAttribute('data-user', userId);
}

function bobContextOptions(info: TestInfo): Record<string, unknown> {
  const device = info.project.name === 'iPhone 15' ? devices['iPhone 15'] : devices['Pixel 7'];
  return { ...device, baseURL: info.project.use.baseURL };
}

test('phase 3 demo: presence, crew feed, ring, debug week, then presence clears', async ({ browser, context, page }, testInfo) => {
  const hub = new MockHub();
  const pages = new Set<Page>();
  await context.addInitScript(() => {
    localStorage.setItem('ironpact.install-dismissed', '1');
  });
  await shareMock(context, hub, pages);
  const bobContext = await browser.newContext(bobContextOptions(testInfo));
  await bobContext.addInitScript(() => {
    localStorage.setItem('ironpact.install-dismissed', '1');
    localStorage.setItem('ironpact.p3g-user', 'bob');
  });
  const bob = await bobContext.newPage();
  try {
    await shareMock(bobContext, hub, pages);
    const started = new Date();
    await context.clock.install({ time: started });
    await bobContext.clock.install({ time: started });

    await reachFloor(page);
    await onFloor(page);
    await reachFloor(bob);
    await onFloor(bob);
    await expect.poll(() => subscriptionCount(page)).toBeGreaterThan(0);
    await expect.poll(() => subscriptionCount(bob)).toBeGreaterThan(0);
    await expectMine(page, MOCK_USER_IDS.alice);
    await expectMine(bob, MOCK_USER_IDS.bob);
    await expect(page.getByTestId('week-streak')).toHaveCount(0);
    await expect(page.getByTestId('debug-week')).toHaveCount(0);

    await bob.getByRole('link', { name: copy.x3StartWorkout, exact: true }).click();
    const picker = bob.getByRole('dialog', { name: copy.pickerTitle });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(bob.locator('.session-exercise').getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
    await expect(page.getByTestId('presence-banner')).toHaveText(QUIET);
    const dock = bob.locator('[data-session-dock]');
    const weight = dock.getByRole('spinbutton', { name: copy.kg, exact: true });
    await weight.fill('80');
    await expect(weight).toHaveValue('80');
    await dock.getByRole('button', { name: copy.x4Log, exact: true }).click();
    await expect(bob.getByText(copy.x4SetOne, { exact: true })).toBeVisible();
    await expect(page.getByTestId('presence-banner')).toHaveText(BENCH);

    await page.locator('.app-shell__tabs').getByRole('link', { name: copy.crewTitle, exact: true }).click();
    await expect(page.getByRole('list', { name: copy.crewFeedTitle })).toContainText('Bench press', { timeout: 3_000 });

    await today(bob);
    await onFloor(bob);
    await expect(bob.getByTestId('shared-bar').getByRole('img')).toHaveAccessibleName(/You 1 of 3/);
    await today(page);
    await onFloor(page);
    await expect(page.getByTestId('shared-bar').getByRole('img')).toHaveAccessibleName(/Partner 1 of 3/);

    await page.goto('/?debug=week');
    await expect(page.getByTestId('shared-bar')).toBeVisible();
    const streak = page.getByTestId('week-streak');
    // Assert the canonical spoken value, not the visual reel's clipped 0–9.
    await settleMotion(page);
    await expect(streak).toMatchAriaSnapshot(String.raw`
      - paragraph: /^1\s*-week streak$/
    `);
    await expect(page.getByTestId('debug-week')).toHaveText(copy.x3DebugWeek);
    await expect(page.getByTestId('presence-banner')).toHaveText(BENCH);

    await page.clock.fastForward('02:10');
    await expect(page.getByTestId('presence-banner')).toHaveCount(0);
  } finally {
    await bobContext.close();
  }
});

async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const roots: Array<Document | ShadowRoot> = [document];
    for (const node of document.querySelectorAll('number-flow-react')) if (node.shadowRoot) roots.push(node.shadowRoot);
    const finite = roots.flatMap((root) => root.getAnimations()).filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}
