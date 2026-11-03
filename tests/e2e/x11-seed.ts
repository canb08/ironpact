import type { Page } from '@playwright/test';
import type { Repo } from '../../src/data/adapter.ts';
import { reachFloor, waitForBench } from './helpers.ts';

export const BENCH = '00000000-0000-4000-8000-000000000010';
export const TODAY = '2026-11-03';
export async function navigate(page: Page, to: string) {
  await page.evaluate(async (path) => {
    const modulePath = '/src/router.tsx';
    const { router } = await import(/* @vite-ignore */ modulePath) as typeof import('../../src/router.tsx');
    await router.navigate(path);
  }, to);
}

/** Real mock-backed Repo and outbox. Only partner fixture rows use the local mirror. */
export async function seedVisuals(page: Page, theme: 'dark' | 'light') {
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00.000Z'));
  await page.addInitScript(() => localStorage.setItem('ironpact.install-dismissed', '1'));
  await reachFloor(page);
  await waitForBench(page);
  await page.evaluate(async (theme) => {
    const path = '/src/data/index.ts';
    const { createRepo } = await import(/* @vite-ignore */ path) as { createRepo: () => Repo };
    const repo = createRepo();
    function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
      if (!result.ok) throw new Error(result.error);
      return result.value;
    }
    value(await repo.w.upsertMyProfile({ display_name: 'Lifter', initial: 'L', theme, tz: 'Europe/Amsterdam', reduce_motion: true, haptics_on: false, weekly_target: 5 }));
    for (const [index, date] of ['2026-10-20', '2026-10-27', '2026-11-02'].entries()) {
      const session = value(await repo.w.startSession({ kind: 'gym' }));
      for (let set = 0; set < 6; set++) value(await repo.w.logSet({ session_id: session.id, exercise_id: '00000000-0000-4000-8000-000000000010', reps: 5, weight_kg: 70 + index * 5 }));
      value(await repo.w.finishSession(session.id));
      value(await repo.w.updateSession(session.id, { local_date: date, started_at: `${date}T17:00:00.000Z`, ended_at: `${date}T17:45:00.000Z` }));
      const run = value(await repo.w.logRun({ distance_m: 4000 + index * 500, duration_s: 1500 + index * 60 }));
      value(await repo.w.updateSession(run.session_id, { local_date: date, started_at: `${date}T08:00:00.000Z`, ended_at: `${date}T08:30:00.000Z` }));
      const fight = value(await repo.w.logMartial({ discipline: 'Muay Thai', duration_min: 60, rounds: 6 }));
      value(await repo.w.updateSession(fight.session_id, { local_date: date, started_at: `${date}T10:00:00.000Z`, ended_at: `${date}T11:00:00.000Z` }));
      const weight = value(await repo.w.logBodyweight(80 - index * 0.5));
      value(await repo.w.updateEntry('bodyweight_entries', weight.id, { local_date: date, measured_at: `${date}T07:00:00.000Z` }));
    }
    const min = value(await repo.w.logMin('10-minute walk'));
    value(await repo.w.updateSession(min.session_id, { local_date: '2026-11-02', started_at: '2026-11-02T18:00:00.000Z' }));
    value(await repo.w.recomputePrs('00000000-0000-4000-8000-000000000010'));
    // Avoid an unseen PR takeover while inspecting unrelated screens.
    const prs = await repo.q.prEvents({});
    value(await repo.w.markPrEventsSeen(prs.map((pr) => pr.id)));
    await repo.sync.flushNow();
    const dbPath = '/src/data/db.ts';
    const { IronpactDB } = await import(/* @vite-ignore */ dbPath) as typeof import('../../src/data/db.ts');
    const db = new IronpactDB();
    const me = await repo.q.me();
    const crew = await repo.q.myCrew();
    const partnerId = crew?.members.find((member) => member.user_id !== me?.id)?.user_id;
    if (!partnerId) throw new Error('Missing seeded partner');
    // Keep the legacy stored name: every partner-facing screen must show its fallback.
    const partner = await db.profiles.get(partnerId);
    if (!partner) throw new Error('Missing partner profile');
    if (partner.display_name !== 'Athlete') throw new Error('Expected legacy partner name');
    const last = (await db.sessions.toArray()).find((row) => row.kind === 'gym' && row.local_date === '2026-11-02');
    if (!last) throw new Error('Missing workout');
    const partnerSession = '10000000-0000-4000-8000-000000000001';
    await db.sessions.put({ ...last, id: partnerSession, user_id: partnerId });
    const sets = await db.sets.where('session_id').equals(last.id).toArray();
    await db.sets.bulkPut(sets.map((row, index) => ({ ...row, id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, session_id: partnerSession, user_id: partnerId, weight_kg: 90 })));
    const weight = (await db.bodyweight_entries.toArray())[0];
    if (!weight) throw new Error('Missing weigh-in');
    await db.bodyweight_entries.bulkPut(['2026-10-20', '2026-10-27'].map((date, index) => ({ ...weight,
      id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      local_date: date, measured_at: `${date}T07:00:00.000Z`, weight_kg: 80 - index * 0.5,
    })));
    db.close();
    document.documentElement.dataset.theme = theme;
  }, theme);
  await navigate(page, '/progress');
}
