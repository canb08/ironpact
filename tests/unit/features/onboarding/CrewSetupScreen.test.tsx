// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
    ['already_in_crew', copy.alreadyInCrew],
  ] as const)('shows the string for %s', async (error, text) => {
    const redeem = vi.fn(async () => ({ ok: false as const, error }));
    renderCrew('/join/ABCDEFGHJK', mockRepo({ userId: 'user-1', crew: { redeem } }));
    fireEvent.change(screen.getByLabelText(copy.displayName), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: copy.lockIn }));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(redeem).toHaveBeenCalledOnce();
  });

  it('blocks a name over 16 characters', () => {
    const create = vi.fn();
    renderCrew('/crew/new', mockRepo({ userId: 'user-1', crew: { create } }));
    fireEvent.change(screen.getByLabelText(copy.displayName), { target: { value: 'ABCDEFGHIJKLMNOPQ' } });
    expect(screen.getByText(copy.nameLength)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.lockIn }).hasAttribute('disabled')).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
