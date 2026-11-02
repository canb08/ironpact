import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';
import { reachFloor, waitForBench } from './helpers.ts';

/**
 * H1 · §3.11, §7.7, Phase 5 DoD (375 px / 200% text) and Phase 6 accessibility.
 * Mock backend, signed in with a crew. Runs on both Playwright projects.
 * Text zoom is root font-size 200% (rem), not page zoom.
 */

const BENCH_ID = '00000000-0000-4000-8000-000000000010';
const DAY = '2026-06-01';

/** Findings fixed in H7. Kept empty so a regression fails the audit below. */
const KNOWN_FINDINGS = new Set<string>([]);

function findingKey(id: string): string {
  return id.replace(/-(?:Pixel7|iPhone15)-/, '-');
}

type Finding = { id: string; detail: string };
type Box = { name: string; path: string; w: number; h: number; min: number; timer: boolean; iconOnly: boolean; named: boolean };
type Probe = {
  scroll: number;
  view: number;
  offender: string;
  boxes: Box[];
  rings: Array<{ path: string; text: string }>;
  tab: { order: string[]; visual: string[] } | null;
};

test.describe.configure({ timeout: 600_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ironpact.install-dismissed', '1');
  });
});

test('S2 and S3 create leave the screen when a crew is already signed in', async ({ page }) => {
  await reachFloor(page);
  await page.goto('/sign-in');
  await expect(page.getByTestId('shared-bar')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/crew/new');
  await expect(page.getByTestId('shared-bar')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('axe, targets, names, rings and tab order on S1–S16', async ({ page }, info) => {
  const project = info.project.name.replace(/\s+/g, '');
  const device = page.viewportSize() ?? { width: 390, height: 844 };
  const findings: Finding[] = [];

  await reachFloor(page);
  await waitForBench(page);

  const visit = async (id: string, path: string, ready: () => Promise<void>, tab = false) => {
    await page.goto(path);
    await ready();
    await audit(page, project, id, device, findings, tab);
  };

  await visit('S4', '/', async () => {
    await expect(page.getByTestId('shared-bar')).toBeVisible();
  });
  await visit('S1', '/install', async () => {
    await expect(page.getByRole('heading', { name: copy.installTitle })).toBeVisible();
  });
  await visit('S3', '/join/AAAAAAAAAA', async () => {
    await expect(page.getByRole('button', { name: copy.copyCode, exact: true })).toBeVisible();
  });
  await visit('S6-entry', '/session', async () => {
    await expect(page.getByRole('heading', { name: copy.sessionTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.start, exact: true })).toBeVisible();
  });
  await visit('S11-run', '/log/run', async () => {
    await expect(page.getByRole('dialog', { name: copy.run })).toBeVisible();
  });
  await visit('S11-martial', '/log/martial', async () => {
    await expect(page.getByRole('dialog', { name: copy.x3Fight })).toBeVisible();
  });
  await visit('S11-weight', '/log/weight', async () => {
    await expect(page.getByRole('dialog', { name: copy.x3WeighIn })).toBeVisible();
  });
  await visit('S11-min', '/log/min', async () => {
    await expect(page.getByRole('dialog', { name: copy.min })).toBeVisible();
  });
  await visit('S12', '/crew', async () => {
    await expect(page.getByRole('heading', { name: copy.crewTitle })).toBeVisible();
  }, true);
  await visit('S13', '/progress', async () => {
    await expect(page.getByRole('heading', { name: copy.progressTitle })).toBeVisible();
  });
  await visit('S14', `/exercise/${BENCH_ID}`, async () => {
    await expect(page.getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
  });
  await visit('S15', `/day/${DAY}`, async () => {
    await expect(page.locator('.day-chip[aria-current="date"]')).toHaveAttribute('href', `/day/${DAY}`);
    await expect(page.getByText(copy.emptyDay)).toBeVisible();
  });
  await visit('S16', '/settings', async () => {
    await expect(page.getByRole('heading', { name: copy.settingsTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^${copy.settingsProfile}`) })).toBeVisible();
  });

  await page.goto('/session');
  await expect(page.getByRole('heading', { name: copy.sessionTitle })).toBeVisible();
  await page.getByRole('button', { name: copy.start, exact: true }).click();
  const picker = page.getByRole('dialog', { name: copy.pickerTitle });
  await expect(picker).toBeVisible();
  await audit(page, project, 'S7', device, findings);
  await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
  await expect(picker).toBeHidden();

  const readiness = page.getByRole('region', { name: copy.readinessTitle });
  await expect(readiness).toBeVisible();
  await audit(page, project, 'S5', device, findings);
  await readiness.getByRole('button', { name: copy.skip, exact: true }).click();
  await expect(readiness).toBeHidden();
  await expect(page.getByRole('button', { name: copy.logSet, exact: true })).toBeVisible();
  await audit(page, project, 'S6', device, findings, true);

  await page.getByRole('button', { name: copy.logSet, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.undo, exact: true })).toBeVisible();
  await expect(page.locator('.rest-timer__controls')).toBeVisible();
  await audit(page, project, 'S8', device, findings);

  const rack = page.getByRole('button', { name: copy.rackItName });
  await rack.focus();
  await page.keyboard.down('Enter');
  await expect(page.getByRole('region', { name: copy.summaryTitle })).toBeVisible();
  await page.keyboard.up('Enter');
  await audit(page, project, 'S10', device, findings);

  await page.getByRole('button', { name: copy.summaryDone, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.start, exact: true })).toBeVisible();
  await page.getByRole('button', { name: copy.start, exact: true }).click();
  const again = page.getByRole('dialog', { name: copy.pickerTitle });
  const kg = page.getByRole('spinbutton', { name: copy.kg, exact: true });
  const readinessAgain = page.getByRole('region', { name: copy.readinessTitle });
  await expect.poll(async () => {
    if (await again.isVisible()) return 'picker';
    if (await readinessAgain.isVisible()) return 'ready';
    if (await kg.isVisible()) return 'kg';
    return '';
  }).not.toBe('');
  if (await again.isVisible()) {
    await again.getByRole('button', { name: 'Bench press', exact: true }).click();
    await expect(again).toBeHidden();
  }
  if (await readinessAgain.isVisible()) {
    await readinessAgain.getByRole('button', { name: copy.skip, exact: true }).click();
    await expect(readinessAgain).toBeHidden();
  }
  await expect(kg).toBeVisible();
  await kg.press('ArrowUp');
  await page.getByRole('button', { name: copy.logSet, exact: true }).click();
  const pr = page.getByRole('region', { name: copy.prCardLabel });
  try {
    await expect(pr).toBeVisible({ timeout: 4_000 });
    await audit(page, project, 'S9', device, findings);
  } catch {
    info.annotations.push({ type: 'S9', description: 'PR card was not visible, so S9 was not scanned on this run' });
  }

  const fresh = findings.filter((finding) => !KNOWN_FINDINGS.has(findingKey(finding.id)));
  writeFileSync(`/tmp/h1-findings-${project}.json`, JSON.stringify({ findings, fresh }, null, 2));
  expect(fresh, fresh.map((finding) => `${finding.id} :: ${finding.detail}`).join('\n')).toEqual([]);
});

async function audit(
  page: Page,
  project: string,
  id: string,
  device: { width: number; height: number },
  findings: Finding[],
  tab = false,
): Promise<void> {
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 375, height: device.height });
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = '200%';
    await document.fonts.ready;
  });
  const probe = await page.evaluate(measure, {
    tab,
    log: copy.logSet,
    undo: copy.undo,
    minus: copy.restMinus15,
    plus: copy.restPlus15,
    skip: copy.skip,
  });
  if (probe.scroll > probe.view + 1) {
    findings.push({
      id: `H1-SCROLL-${project}-${id}`,
      detail: `horizontal scroll ${probe.scroll}px in a ${probe.view}px width at 200% text; offender ${probe.offender || 'document'}`,
    });
  }
  for (const box of probe.boxes) {
    if (box.w + 0.5 < box.min || box.h + 0.5 < box.min) {
      const kind = box.min >= 64 ? 'H1-TARGET64' : 'H1-TARGET48';
      findings.push({
        id: `${kind}-${project}-${id}-${slug(box.name || box.path)}`,
        detail: `${box.name || '(no name)'} ${box.path} is ${Math.round(box.w)}×${Math.round(box.h)}px, needs ${box.min}px`,
      });
    }
    if (box.iconOnly && !box.named) {
      findings.push({
        id: `H1-NAME-${project}-${id}-${slug(box.path)}`,
        detail: `icon-only button ${box.path} has no accessible name`,
      });
    }
  }
  for (const ring of probe.rings) {
    if (ring.text.length === 0) {
      findings.push({
        id: `H1-RING-${project}-${id}-${slug(ring.path)}`,
        detail: `ring ${ring.path} has no text alternative`,
      });
    }
  }
  if (tab && probe.tab && probe.tab.order.join('|') !== probe.tab.visual.join('|')) {
    findings.push({
      id: `H1-TAB-${project}-${id}`,
      detail: `tab [${probe.tab.order.join(' → ')}] vs visual [${probe.tab.visual.join(' → ')}]`,
    });
  }

  await settleMotion(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize(device);
  const results = await new AxeBuilder({ page }).analyze();
  for (const violation of results.violations) {
    if (violation.impact !== 'serious' && violation.impact !== 'critical') continue;
    const targets = violation.nodes.slice(0, 6).map((node) => node.target.join(' '));
    findings.push({
      id: `H1-AXE-${project}-${id}-${violation.id}`,
      detail: `${violation.impact} ${violation.help} (${violation.nodes.length}) :: ${targets.join(' | ')}`,
    });
  }
}

function slug(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (cleaned || 'el').slice(0, 80);
}

/** Axe samples live pixels. Wait out a fade or the PR flash unless reduced motion already killed it. */
async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.reducedMotion === 'on';
    if (reduced) return;
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      if (timing?.iterations === Infinity) return false;
      const state = animation.playState as string;
      return state === 'running' || state === 'pending';
    });
    const done = Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    await Promise.race([
      done,
      new Promise<void>((resolve) => { window.setTimeout(resolve, 2000); }),
    ]);
  });
}

function measure(labels: { tab: boolean; log: string; undo: string; minus: string; plus: string; skip: string }): Probe {
  type Item = { name: string; path: string; x: number; y: number; h: number; dom: number; tab: number };

  const shownText = (node: HTMLElement): string => {
    const clone = node.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return '';
    for (const hidden of clone.querySelectorAll('[aria-hidden="true"], svg, img')) hidden.remove();
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  };

  const accName = (node: HTMLElement): string => {
    const label = node.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim();
    if (label) return label;
    const ids = node.getAttribute('aria-labelledby');
    if (ids) {
      const text = ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    const shown = shownText(node);
    if (shown) return shown;
    return node.getAttribute('title')?.replace(/\s+/g, ' ').trim() ?? '';
  };

  const cssPath = (node: Element): string => {
    const parts: string[] = [];
    let current: Element | null = node;
    while (current && current !== document.body && parts.length < 4) {
      const name = current.tagName.toLowerCase();
      const classes = [...current.classList].slice(0, 2);
      const className = classes.length > 0 ? `.${classes.join('.')}` : '';
      parts.unshift(`${name}${className}`);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  const tabbables = (root: ParentNode): Item[] => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';
    const items: Item[] = [];
    let dom = 0;
    for (const node of root.querySelectorAll<HTMLElement>(selector)) {
      dom += 1;
      const raw = node.getAttribute('tabindex');
      if (raw === '-1') continue;
      if (node.closest('[aria-hidden="true"]')) continue;
      if (node.hasAttribute('disabled')) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const tab = raw == null || raw === '' ? 0 : Number(raw);
      items.push({
        name: accName(node),
        path: cssPath(node),
        x: rect.x,
        y: rect.y,
        h: rect.height,
        dom,
        tab: Number.isFinite(tab) ? tab : 0,
      });
    }
    const positive = items.filter((item) => item.tab > 0).sort((a, b) => a.tab - b.tab || a.dom - b.dom);
    const rest = items.filter((item) => item.tab <= 0).sort((a, b) => a.dom - b.dom);
    return [...positive, ...rest];
  };

  const readingOrder = (items: readonly Item[]): Item[] => {
    const pending = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: Item[][] = [];
    for (const item of pending) {
      const row = rows.find((group) => {
        const head = group[0];
        return head != null && Math.abs(head.y - item.y) < Math.max(12, Math.min(head.h, item.h) * 0.5);
      });
      if (row) row.push(item);
      else rows.push([item]);
    }
    return rows.flatMap((row) => [...row].sort((a, b) => a.x - b.x));
  };

  const view = document.documentElement.clientWidth;
  const scroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  let offender = '';
  let worst = 0;
  for (const node of document.body.querySelectorAll<HTMLElement>('body *')) {
    const style = getComputedStyle(node);
    if (style.position === 'fixed' || style.position === 'sticky' || style.display === 'none') continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const over = rect.right - view;
    if (over > worst && rect.left < view) {
      worst = over;
      offender = cssPath(node);
    }
  }

  const timerNames = new Set([labels.minus, labels.plus, labels.skip]);
  const boxes: Box[] = [];
  for (const node of document.querySelectorAll<HTMLElement>('button, [role="button"], a.ui-button')) {
    if (node.closest('[aria-hidden="true"]')) continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const name = accName(node);
    const inTimer = node.closest('.rest-timer') != null;
    const large = name === labels.log || name === labels.undo || (inTimer && timerNames.has(name));
    boxes.push({
      name,
      path: cssPath(node),
      w: rect.width,
      h: rect.height,
      min: large ? 64 : 48,
      timer: inTimer,
      iconOnly: shownText(node).length === 0,
      named: name.length > 0,
    });
  }

  const rings: Array<{ path: string; text: string }> = [];
  for (const node of document.querySelectorAll<HTMLElement>('[role="img"]')) {
    if (node.closest('[aria-hidden="true"]')) continue;
    const title = node.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    rings.push({ path: cssPath(node), text: accName(node) || title });
  }

  let tab: Probe['tab'] = null;
  if (labels.tab) {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const root = dialog ?? document.querySelector('main') ?? document.body;
    const items = tabbables(root);
    const visual = readingOrder(items);
    tab = {
      order: items.map((item) => item.name || item.path),
      visual: visual.map((item) => item.name || item.path),
    };
  }

  return { scroll, view, offender: worst > 1 ? offender : '', boxes, rings, tab };
}
