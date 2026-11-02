// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import SettingsScreen from '../../../../src/features/settings/SettingsScreen.tsx';
import { applyDocumentFeel, clearDocumentFeel } from '../../../../src/features/settings/feel.ts';
import { copy } from '../../../../src/ui/copy.ts';
import { mockRepo } from './harness.ts';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => undefined,
}));

vi.mock('../../../../src/features/settings/feel.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/features/settings/feel.ts')>();
  return { ...actual, applyDocumentFeel: vi.fn() };
});

let context: Awaited<ReturnType<typeof mockRepo>>;
beforeEach(async () => {
  clearDocumentFeel();
  context = await mockRepo();
});
afterEach(async () => {
  await context.close();
  clearDocumentFeel();
  vi.restoreAllMocks();
});

it('before the profile resolves, no save is called and applyDocumentFeel is not called', async () => {
  const save = vi.spyOn(context.repo.w, 'upsertMyProfile');
  render(<RepoProvider repo={context.repo}><SettingsScreen /></RepoProvider>);

  const name = document.getElementById('settings-name');
  expect(name).toBeInstanceOf(HTMLInputElement);
  expect((name as HTMLInputElement).value).toBe('');
  expect((name as HTMLInputElement).disabled).toBe(true);
  expect(document.documentElement.dataset.theme).toBeUndefined();
  expect(applyDocumentFeel).not.toHaveBeenCalled();

  const sound = screen.getByRole('checkbox', { name: copy.soundOn, hidden: true });
  fireEvent.click(sound);
  fireEvent.change(sound, { target: { checked: true } });
  await act(async () => { await Promise.resolve(); });

  expect(save).not.toHaveBeenCalled();
  expect(applyDocumentFeel).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.theme).toBeUndefined();
});
