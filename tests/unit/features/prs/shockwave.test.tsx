// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import type { Repo } from '../../../../src/data/adapter.ts';
import {
  formatPartnerPr,
  repoPartnerPrPort,
  usePartnerPrShockwave,
  type PartnerPrSeen,
} from '../../../../src/features/prs/usePartnerPrShockwave.ts';

const row: PartnerPrSeen = { id: 'p1', partnerName: 'A', exerciseName: 'Bench', kg: 85, reps: 5 };

function Probe() {
  const state = usePartnerPrShockwave();
  return <p data-testid="shock" data-status={state.status}>{state.events.map((event) => event.line).join('|')}</p>;
}

function memoryRepo(rows: readonly PartnerPrSeen[]) {
  const seen = new Set<string>();
  const marks: string[][] = [];
  const repo = {
    q: {
      unseenPartnerPrs: async () => rows.filter((item) => !seen.has(item.id)),
    },
    w: {
      markPrEventsSeen: async (ids: readonly string[]) => {
        marks.push([...ids]);
        for (const id of ids) seen.add(id);
      },
    },
  } as unknown as Repo;
  return { repo, marks };
}

describe('partner PR shockwave hook', () => {
  afterEach(() => cleanup());

  it('returns an unseen partner PR once and marks it seen', async () => {
    expect(formatPartnerPr(row)).toBe('A · Bench · 85 kg × 5');
    const { repo, marks } = memoryRepo([row]);
    const { unmount } = render(<RepoProvider repo={repo}><Probe /></RepoProvider>);
    await waitFor(() => expect(screen.getByTestId('shock').getAttribute('data-status')).toBe('ready'));
    expect(screen.getByTestId('shock').textContent).toBe('A · Bench · 85 kg × 5');
    expect(marks).toEqual([['p1']]);

    unmount();
    render(<RepoProvider repo={repo}><Probe /></RepoProvider>);
    await waitFor(() => expect(screen.getByTestId('shock').getAttribute('data-status')).toBe('ready'));
    expect(screen.getByTestId('shock').textContent).toBe('');
    expect(marks).toEqual([['p1']]);
  });

  it('stays unsupported when the repo has no seen_by write', () => {
    const repo = { q: { prEvents: async () => [] }, w: { recordPrEvents: async () => ({ ok: true, value: [] }) } } as unknown as Repo;
    expect(repoPartnerPrPort(repo)).toBeNull();
    render(<RepoProvider repo={repo}><Probe /></RepoProvider>);
    expect(screen.getByTestId('shock').getAttribute('data-status')).toBe('unsupported');
    expect(screen.getByTestId('shock').textContent).toBe('');
  });
});
