// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RepoContext } from '../../app/repoContext.ts';
import type { Repo } from '../../data/adapter.ts';
import { copy } from '../../ui/copy.ts';
import ProofPrompt from './ProofPrompt.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function prompt(proof: object) {
  const repo = { q: {
    me: async () => ({ id: 'self' }),
    myCrew: async () => ({ members: [{ user_id: 'partner', left_at: null }] }),
    profiles: async () => [{ display_name: 'Crewmate' }],
  }, proof } as unknown as Repo;
  const done = vi.fn();
  render(<RepoContext value={repo}><ProofPrompt input={{ kind: 'run', day: '2026-11-03', entryRef: { table: 'cardio_entries', id: 'run' } }} onDone={done} /></RepoContext>);
  return done;
}

it('shows a card-write failure in the sheet and logs its stage without dismissing', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const done = prompt({ createOrJoinCard: async () => ({ ok: false, error: 'storage_full' }) });
  fireEvent.click(screen.getByRole('button', { name: copy.y9Solo }));
  fireEvent.click(screen.getByRole('button', { name: copy.y9Skip }));
  expect((await screen.findByRole('alert')).textContent).toContain(copy.storageFull);
  expect(log).toHaveBeenCalledWith('[Proof save] create_card: storage_full');
  expect(done).not.toHaveBeenCalled();
});

it('surfaces the actual photo-write exception in development and console diagnostics', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const reason = new Error('Error preparing Blob/File data to be stored in object store'); reason.name = 'UnknownError';
  const done = prompt({
    createOrJoinCard: async () => ({ ok: true, value: { id: 'card' } }),
    addPhoto: async () => { throw reason; },
  });
  fireEvent.click(screen.getByRole('button', { name: copy.y9Solo }));
  fireEvent.change(screen.getByLabelText(copy.y9TakePhoto), { target: { files: [new File(['photo'], 'proof.png', { type: 'image/png' })] } });
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(copy.y9SaveError);
  expect(alert.textContent).toContain(`add_photo: ${String(reason)}`);
  expect(log).toHaveBeenCalledWith(`[Proof save] add_photo: ${String(reason)}`);
  expect(done).not.toHaveBeenCalled();
});
