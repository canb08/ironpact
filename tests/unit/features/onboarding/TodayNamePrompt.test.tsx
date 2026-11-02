// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import { TodayNamePrompt } from '../../../../src/features/onboarding/TodayNamePrompt.tsx';
import { hintSeen, rememberHint } from '../../../../src/features/onboarding/storage.ts';
import { copy } from '../../../../src/ui/copy.ts';
import { mockRepo, testProfile } from '../auth/mockRepo.ts';

function mount(repo = mockRepo({ userId: 'user-1', q: { me: async () => testProfile({ display_name: 'Athlete' }) } })) {
  return render(<RepoProvider repo={repo}><TodayNamePrompt /></RepoProvider>);
}

describe('X9 Today name prompt', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('prompts legacy profiles, saves only name/initial, then stays dismissed', async () => {
    const save = vi.fn(async () => ({ ok: true as const, value: testProfile() }));
    const repo = mockRepo({ userId: 'user-1', q: { me: async () => testProfile({ display_name: 'Athlete' }) }, w: { upsertMyProfile: save } });
    const view = mount(repo);
    fireEvent.change(await screen.findByLabelText(copy.x9Name), { target: { value: '  Lifter  ' } });
    fireEvent.click(screen.getByRole('button', { name: copy.x9SaveName }));
    await waitFor(() => { expect(screen.queryByRole('region')).toBeNull(); });
    expect(save).toHaveBeenCalledWith({ display_name: 'Lifter', initial: 'L' });
    view.unmount();
    mount(repo);
    await waitFor(() => { expect(screen.queryByRole('region')).toBeNull(); });
    expect(hintSeen('name', 'user-1')).toBe(true);
  });

  it('dismisses an empty name once without writing a profile', async () => {
    const save = vi.fn();
    mount(mockRepo({ userId: 'user-1', q: { me: async () => testProfile({ display_name: '' }) }, w: { upsertMyProfile: save } }));
    fireEvent.click(await screen.findByRole('button', { name: copy.x9Dismiss }));
    expect(screen.queryByRole('region')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(hintSeen('name', 'user-1')).toBe(true);
    expect(hintSeen('name', 'user-other')).toBe(false);
  });

  it('never prompts someone who already has a name', async () => {
    const me = vi.fn(async () => testProfile({ display_name: 'Lifter' }));
    mount(mockRepo({ userId: 'user-1', q: { me } }));
    await waitFor(() => { expect(me).toHaveBeenCalledOnce(); });
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('leaves a failed save visible and retryable', async () => {
    const save = vi.fn().mockResolvedValueOnce({ ok: false, error: 'storage_full' })
      .mockResolvedValueOnce({ ok: true, value: testProfile() });
    mount(mockRepo({ userId: 'user-1', q: { me: async () => testProfile({ display_name: '' }) }, w: { upsertMyProfile: save } }));
    fireEvent.change(await screen.findByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
    fireEvent.click(screen.getByRole('button', { name: copy.x9SaveName }));
    expect(await screen.findByText(copy.x9SaveError)).toBeTruthy();
    expect(hintSeen('name', 'user-1')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: copy.x9SaveName }));
    await waitFor(() => { expect(screen.queryByRole('region')).toBeNull(); });
  });

  it('continues safely when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(() => rememberHint('guide', 'user-1')).not.toThrow();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: copy.x9Dismiss }));
    expect(screen.queryByRole('region')).toBeNull();
  });
});
