// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoContext } from '../../app/repoContext.ts';
import type { Repo } from '../../data/adapter.ts';
import { copy } from '../../ui/copy.ts';
import ProofPrompt from './ProofPrompt.tsx';
import { proofDisplayName } from './names.ts';

afterEach(cleanup);
describe('Proof profile names', () => {
  it.each(['', '   ', copy.x3LegacyName, ` ${copy.x3LegacyName} `, undefined])('uses Partner for an unset or legacy name (%s)', (name) => {
    expect(proofDisplayName(name)).toBe(copy.x3Partner);
  });
  it('preserves a name and supports the self fallback used by card avatars', () => {
    expect(proofDisplayName(' Crewmate ')).toBe('Crewmate');
    expect(proofDisplayName(copy.x3LegacyName, copy.x7You)).toBe(copy.x7You);
  });
  it.each([copy.x3LegacyName, '  '])('the together prompt displays With Partner for %s', async (name) => {
    const repo = { q: {
      me: async () => ({ id: 'self' }),
      myCrew: async () => ({ members: [{ user_id: 'partner', left_at: null }] }),
      profiles: async () => [{ display_name: name }],
    } } as unknown as Repo;
    render(<RepoContext value={repo}><ProofPrompt input={{ kind: 'run', day: '2026-11-03', entryRef: { table: 'cardio_entries', id: 'run' } }} onDone={vi.fn()} /></RepoContext>);
    expect(await screen.findByRole('button', { name: 'With Partner' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'With Athlete' })).toBeNull();
  });
});
