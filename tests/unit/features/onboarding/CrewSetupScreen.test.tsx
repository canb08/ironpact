// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import CrewSetupScreen from '../../../../src/features/onboarding/CrewSetupScreen.tsx';
import { copy } from '../../../../src/ui/copy.ts';
import { mockRepo, testCrew, testMember, testProfile } from '../auth/mockRepo.ts';

function renderCrew(path: string, repo: ReturnType<typeof mockRepo>) {
  const memory = createMemoryRouter(
    [
      { path: '/crew/new', element: <CrewSetupScreen /> },
      { path: '/join/:code', element: <CrewSetupScreen /> },
      { path: '/', element: <div>floor</div> },
    ],
    { initialEntries: [path] },
  );
  render(
    <RepoProvider repo={repo}>
      <RouterProvider router={memory} />
    </RepoProvider>,
  );
}

describe('S3 crew', () => {
  it('prefills /join/ABCDEFGHJK and joins with that code', async () => {
    const redeem = vi.fn(async () => ({ ok: true as const, value: testCrew() }));
    const upsertMyProfile = vi.fn(async () => ({ ok: true as const, value: testProfile() }));
    renderCrew(
      '/join/ABCDEFGHJK',
      mockRepo({
        userId: 'user-1',
        crew: { redeem },
        q: { myCrew: async () => ({ crew: testCrew(), members: [testMember()] }), profiles: async () => [] },
        w: { upsertMyProfile },
      }),
    );
    expect((screen.getByLabelText('Invite character 1') as HTMLInputElement).value).toBe('A');
    expect((screen.getByLabelText('Invite character 10') as HTMLInputElement).value).toBe('K');
    fireEvent.change(screen.getByLabelText(copy.displayName), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: copy.lockIn }));
    expect(redeem).toHaveBeenCalledWith('ABCDEFGHJK');
  });

  it.each([
    ['code_dead', copy.deadInvite],
    ['crew_full', copy.crewFull],
    ['slow_down', copy.inviteSlow],
  ] as const)('shows the string for %s', async (error, text) => {
    const redeem = vi.fn(async () => ({ ok: false as const, error }));
    renderCrew('/join/ABCDEFGHJK', mockRepo({ userId: 'user-1', crew: { redeem } }));
    fireEvent.change(screen.getByLabelText(copy.displayName), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: copy.lockIn }));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(redeem).toHaveBeenCalledOnce();
  });

  it.each(['/crew/new', '/join/ABCDEFGHJK'])(
    'recovers already_in_crew from %s by pulling before navigating without changing the profile',
    async (path) => {
      let finishPull!: () => void;
      const pulled = new Promise<void>((resolve) => { finishPull = resolve; });
      let membership: Awaited<ReturnType<ReturnType<typeof mockRepo>['q']['myCrew']>>;
      const pullNow = vi.fn(async () => {
        await pulled;
        membership = { crew: testCrew(), members: [testMember()] };
      });
      const already = vi.fn(async () => ({ ok: false as const, error: 'already_in_crew' as const }));
      const upsertMyProfile = vi.fn();
      renderCrew(path, mockRepo({
        userId: 'user-1', crew: { create: already, redeem: already },
        q: { myCrew: async () => membership }, sync: { pullNow }, w: { upsertMyProfile },
      }));
      fireEvent.change(screen.getByLabelText(copy.displayName), { target: { value: 'Alex' } });
      fireEvent.click(screen.getByRole('button', { name: copy.lockIn }));
      await waitFor(() => { expect(pullNow).toHaveBeenCalledOnce(); });
      expect(screen.queryByText('floor')).toBeNull();
      expect(screen.queryByText(copy.alreadyInCrew)).toBeNull();
      await act(async () => { finishPull(); });
      expect(await screen.findByText('floor')).toBeTruthy();
      expect(upsertMyProfile).not.toHaveBeenCalled();
    },
  );

  it.each(['rejected', 'empty mirror'])(
    'keeps recovery retryable when the pull fails (%s)',
    async (failure) => {
      const pullNow = vi.fn(async () => {
        if (failure === 'rejected') throw new Error('network');
      });
      renderCrew('/crew/new', mockRepo({
        userId: 'user-1',
        crew: { create: async () => ({ ok: false, error: 'already_in_crew' }) },
        sync: { pullNow },
      }));
      fireEvent.change(screen.getByLabelText(copy.displayName), { target: { value: 'Alex' } });
      fireEvent.click(screen.getByRole('button', { name: copy.lockIn }));
      expect(await screen.findByText(copy.alreadyInCrew)).toBeTruthy();
      expect(screen.getByRole('button', { name: copy.lockIn }).hasAttribute('disabled')).toBe(false);
      expect(screen.queryByText('floor')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: copy.lockIn }));
      await waitFor(() => { expect(pullNow).toHaveBeenCalledTimes(2); });
    },
  );

  it('blocks a name over 16 characters', () => {
    const create = vi.fn();
    renderCrew('/crew/new', mockRepo({ userId: 'user-1', crew: { create } }));
    fireEvent.change(screen.getByLabelText(copy.displayName), { target: { value: 'ABCDEFGHIJKLMNOPQ' } });
    expect(screen.getByText(copy.nameLength)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.lockIn }).hasAttribute('disabled')).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
