// @vitest-environment jsdom
import '../../data/harness.ts';
import { StrictMode, useSyncExternalStore } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import { createMockRemote, MOCK_EXERCISE_ID, MOCK_USER_IDS } from '../../../../src/data/adapter.mock.ts';
import { IronpactDB } from '../../../../src/data/db.ts';
import { createDataRepo } from '../../../../src/data/repo.ts';
import { usePartnerPrShockwave } from '../../../../src/features/prs/usePartnerPrShockwave.ts';
import { PartnerShockwave } from '../../../../src/features/duo/PartnerShockwave.tsx';
import { partnerShockwaveSnapshot, resetShockwaveForTests, subscribePartnerShockwaves } from '../../../../src/features/duo/shockwave.ts';
import { recomputePrs } from '../../../../src/core/prs.ts';
import { ManualEnvironment, unwrap } from '../../data/harness.ts';

function Probe({ inSession = false }: { inSession?: boolean }) {
  usePartnerPrShockwave();
  const events = useSyncExternalStore(subscribePartnerShockwaves, partnerShockwaveSnapshot);
  return <PartnerShockwave events={events} inSession={inSession} reduced />;
}

async function setup() {
  const now = '2026-11-02T10:00:00.000Z';
  const remote = createMockRemote({ now: () => Date.parse(now) });
  // Produce real PR drafts as the partner, then open the viewer's real Repo.
  await remote.verifyCode('bob@example.test', '123456');
  const db = new IronpactDB(`ironpact-shockwave-${crypto.randomUUID()}`);
  const environment = new ManualEnvironment();
  environment.setOnline(true);
  let repo = createDataRepo(remote, { db, environment, autoStart: false });
  await repo.ready;
  await repo.sync.pullNow();
  const history = { sessions: [], sets: [], cardio: [], bodyweights: [], exercises: await repo.q.exercises() } as Parameters<typeof recomputePrs>[0];
  for (const [i, kg] of [60, 85].entries()) {
    const session = unwrap(await repo.w.startSession({ kind: 'gym' }));
    const at = `2026-11-0${i + 1}T10:00:00.000Z`;
    unwrap(await repo.w.updateSession(session.id, { started_at: at, local_date: at.slice(0, 10) }));
    unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: MOCK_EXERCISE_ID, reps: 5, weight_kg: kg }));
    unwrap(await repo.w.finishSession(session.id));
  }
  const entries = await repo.q.entriesBetween(MOCK_USER_IDS.bob, '2026-01-01', '2026-12-31');
  const drafts = recomputePrs({ ...history, ...entries, bodyweights: entries.bodyweight });
  unwrap(await repo.w.recordPrEvents(drafts.filter((draft) => draft.pr_type === 'e1rm')));
  await repo.sync.flushNow();
  const prs = await repo.q.prEvents({});
  repo.close();
  await remote.verifyCode('alice@example.test', '123456');
  repo = createDataRepo(remote, { db, environment, autoStart: false });
  await repo.ready;
  const mark = vi.spyOn(remote, 'markPrEventsSeen');
  return { repo, remote, environment, prs, mark, close: async () => { repo.close(); await db.delete(); } };
}

afterEach(() => { cleanup(); resetShockwaveForTests(); vi.restoreAllMocks(); });

describe('real Repo → hook → P4E playback → seen RPC', () => {
  it('plays once under StrictMode and remains seen on the next open without local storage', async () => {
    const h = await setup();
    try {
      const view = render(<StrictMode><RepoProvider repo={h.repo}><Probe /></RepoProvider></StrictMode>);
      const card = await screen.findByTestId('partner-shockwave');
      expect(card.textContent).toContain('85 kg × 5');
      await waitFor(() => expect(h.mark).toHaveBeenCalledTimes(1));
      await waitFor(async () => expect(await h.repo.q.unseenPartnerPrs()).toEqual([]));
      view.unmount();
      resetShockwaveForTests(); // Prove the server receipt, not just the local guard.
      render(<RepoProvider repo={h.repo}><Probe /></RepoProvider>);
      await waitFor(() => expect(partnerShockwaveSnapshot()).toEqual([]));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
      expect(screen.queryByTestId('partner-shockwave')).toBeNull();
      expect(h.mark).toHaveBeenCalledTimes(1);
    } finally { cleanup(); await h.close(); }
  });

  it('does not mark while a session is active or after an unplayed unmount', async () => {
    const h = await setup();
    try {
      const view = render(<RepoProvider repo={h.repo}><Probe inSession /></RepoProvider>);
      await waitFor(() => expect(partnerShockwaveSnapshot()).toHaveLength(1));
      expect(h.mark).not.toHaveBeenCalled();
      expect(screen.queryByTestId('partner-shockwave')).toBeNull();
      view.unmount();
      expect(await h.repo.q.unseenPartnerPrs()).toHaveLength(1);
      render(<RepoProvider repo={h.repo}><Probe /></RepoProvider>);
      await screen.findByTestId('partner-shockwave');
      await waitFor(() => expect(h.mark).toHaveBeenCalledTimes(1));
    } finally { cleanup(); await h.close(); }
  });

  it('retries an offline receipt on next open without replaying the card', async () => {
    const h = await setup();
    try {
      await h.repo.sync.pullNow();
      h.environment.setOnline(false);
      const view = render(<RepoProvider repo={h.repo}><Probe /></RepoProvider>);
      await screen.findByTestId('partner-shockwave');
      expect(h.mark).not.toHaveBeenCalled();
      expect(await h.repo.q.unseenPartnerPrs()).toHaveLength(1);
      view.unmount();
      h.environment.setOnline(true);
      render(<RepoProvider repo={h.repo}><Probe /></RepoProvider>);
      await waitFor(() => expect(h.mark).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('partner-shockwave')).toBeNull();
      await waitFor(async () => expect(await h.repo.q.unseenPartnerPrs()).toEqual([]));
    } finally { cleanup(); await h.close(); }
  });

  it('hides a claim that no longer agrees with the partner source', async () => {
    const h = await setup();
    try {
      const source = h.remote.inspect('sets').find((row) => row.id === h.prs[0]!.source_id)!;
      h.remote.seed('sets', [{ ...source, weight_kg: 50, updated_at: '2026-11-03T00:00:00Z' }]);
      render(<RepoProvider repo={h.repo}><Probe /></RepoProvider>);
      await act(async () => { await h.repo.sync.pullNow(); await new Promise((resolve) => setTimeout(resolve, 100)); });
      expect(screen.queryByTestId('partner-shockwave')).toBeNull();
      expect(h.mark).not.toHaveBeenCalled();
    } finally { cleanup(); await h.close(); }
  });
});
