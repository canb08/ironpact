import { expect, test, type Page } from '@playwright/test';
import { copy } from '../../src/ui/copy.ts';
import { reachFloor, waitForBench } from './helpers.ts';

interface Shift { value: number; startTime: number; hadRecentInput: boolean }
interface ClsProbe {
  entries: Shift[];
  observer: PerformanceObserver;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  // Include async data paints, font swaps and the end of the input exclusion window.
  await page.waitForTimeout(1_600);
}

for (const screen of ['Floor', 'Session'] as const) {
  test(`${screen}: CLS stays at or below 0.05 from navigation through settled content`, async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
    // Finish mock auth/pull before measuring either signed-in route, so an
    // onboarding redirect cannot replace the screen whose CLS is measured.
    await reachFloor(page);
    await waitForBench(page);
    await page.addInitScript(() => {
      if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) return;
      const entries: Shift[] = [];
      const record = (batch: PerformanceEntry[]) => {
        for (const entry of batch) {
          const shift = entry as PerformanceEntry & Shift;
          entries.push({ value: shift.value, startTime: shift.startTime, hadRecentInput: shift.hadRecentInput });
        }
      };
      const observer = new PerformanceObserver((list) => record(list.getEntries()));
      observer.observe({ type: 'layout-shift', buffered: true });
      Object.assign(globalThis, { __p4Cls: { entries, observer } });
    });
    // Observe from before the route paints; installing after reachFloor would miss
    // the load shifts that this budget is intended to catch.
    await page.goto(screen === 'Floor' ? '/' : '/session');
    const supported = await page.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('layout-shift'));
    test.skip(!supported, 'This engine does not expose layout-shift entries; WebKit CLS is not reported as zero.');

    if (screen === 'Floor') {
      await expect(page.getByTestId('my-week')).toBeVisible();
      await expect(page.getByTestId('bar-plates')).toBeVisible();
    } else {
      await waitForBench(page);
      await page.getByRole('button', { name: copy.start, exact: true }).click();
      const picker = page.getByRole('dialog', { name: copy.pickerTitle });
      await expect(picker).toBeVisible();
      await picker.getByRole('button', { name: 'Bench press', exact: true }).click();
      const readiness = page.getByRole('region', { name: copy.readinessTitle });
      if (await readiness.isVisible()) await readiness.getByRole('button', { name: copy.skip, exact: true }).click();
      await expect(page.getByRole('button', { name: copy.logSet, exact: true })).toBeVisible();
    }
    await settle(page);
    const report = await page.evaluate(() => {
      const probe = (globalThis as unknown as { __p4Cls: ClsProbe }).__p4Cls;
      for (const entry of probe.observer.takeRecords()) {
        const shift = entry as PerformanceEntry & Shift;
        probe.entries.push({ value: shift.value, startTime: shift.startTime, hadRecentInput: shift.hadRecentInput });
      }
      probe.observer.disconnect();
      // CLS is the largest session window: <1 s gaps, at most 5 s long.
      let cls = 0;
      let value = 0;
      let first = 0;
      let previous = -Infinity;
      for (const entry of probe.entries.filter((entry) => !entry.hadRecentInput).sort((a, b) => a.startTime - b.startTime)) {
        if (entry.startTime - previous >= 1_000 || entry.startTime - first >= 5_000) {
          first = entry.startTime;
          value = 0;
        }
        value += entry.value;
        previous = entry.startTime;
        cls = Math.max(cls, value);
      }
      return { cls, entries: probe.entries, observedMs: performance.now() };
    });
    await info.attach(`${screen.toLowerCase()}-cls`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    expect(report.observedMs).toBeGreaterThan(1_600);
    expect(report.cls, `${screen} layout-shift entries: ${JSON.stringify(report.entries)}`).toBeLessThanOrEqual(0.05);
  });
}
