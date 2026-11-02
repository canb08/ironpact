// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function openProfile() {
  fireEvent.click(screen.getByRole('button', { name: copy.x9Continue }));
}
function submitProfile() {
  fireEvent.click(screen.getByRole('button', { name: copy.x9Continue }));
  fireEvent.click(screen.getByRole('button', { name: copy.x9Skip }));
}

describe('S3 crew', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
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
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
    submitProfile();
    expect(redeem).toHaveBeenCalledWith('ABCDEFGHJK');
  });

  it.each([
    ['code_dead', copy.deadInvite],
    ['crew_full', copy.crewFull],
    ['slow_down', copy.inviteSlow],
  ] as const)('shows the string for %s', async (error, text) => {
    const redeem = vi.fn(async () => ({ ok: false as const, error }));
    renderCrew('/join/ABCDEFGHJK', mockRepo({ userId: 'user-1', crew: { redeem } }));
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
    submitProfile();
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
      openProfile();
      fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
      submitProfile();
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
      openProfile();
      fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
      submitProfile();
      expect(await screen.findByText(copy.alreadyInCrew)).toBeTruthy();
      expect(screen.getByRole('button', { name: copy.x9Skip }).hasAttribute('disabled')).toBe(false);
      expect(screen.queryByText('floor')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: copy.x9Skip }));
      await waitFor(() => { expect(pullNow).toHaveBeenCalledTimes(2); });
    },
  );

  it('blocks a name over 16 characters', () => {
    const create = vi.fn();
    renderCrew('/crew/new', mockRepo({ userId: 'user-1', crew: { create } }));
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'ABCDEFGHIJKLMNOPQ' } });
    expect(screen.getByText(copy.nameLength)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.x9Continue }).hasAttribute('disabled')).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('X9 setup', () => {
  beforeEach(() => { localStorage.clear(); });

  it.each([
    ['/crew/new', 353], ['/join/ABCDEFGHJK', 217],
  ])('saves the name, seat colour and default target from %s', async (path, hue) => {
    const save = vi.fn(async () => ({ ok: true as const, value: testProfile({ id: 'user-1' }) }));
    renderCrew(String(path), mockRepo({ userId: 'user-1', w: { upsertMyProfile: save } }));
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: '  Lifter  ' } });
    fireEvent.click(screen.getByRole('button', { name: copy.x9Continue }));
    expect(screen.getByRole('heading', { name: copy.x9Sessions })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.x9Next }));
    expect(screen.getByRole('heading', { name: copy.x9Bar })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.x9Next }));
    expect(screen.getByRole('heading', { name: copy.x9Prs })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.x9Finish }));
    expect(await screen.findByText('floor')).toBeTruthy();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Lifter', initial: 'L', color_hue: hue, weekly_target: 3 }));
    expect(localStorage.getItem('ironpact.x9.guide.user-1')).toBe('1');
  });

  it('does not redeem twice after a failed profile save and allows a retry', async () => {
    const redeem = vi.fn(async () => ({ ok: true as const, value: testCrew() }));
    const save = vi.fn().mockResolvedValueOnce({ ok: false, error: 'storage_full' })
      .mockResolvedValueOnce({ ok: true, value: testProfile() });
    renderCrew('/join/ABCDEFGHJK', mockRepo({ userId: 'user-1', crew: { redeem }, w: { upsertMyProfile: save } }));
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
    submitProfile();
    expect(await screen.findByText(copy.x9SaveError)).toBeTruthy();
    expect(localStorage.getItem('ironpact.x9.guide.user-1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.x9Skip }));
    expect(await screen.findByText('floor')).toBeTruthy();
    expect(redeem).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('remembers skipping per account and allows another account to see the guide', () => {
    localStorage.setItem('ironpact.x9.guide.user-other', '1');
    renderCrew('/crew/new', mockRepo({ userId: 'user-1' }));
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
    fireEvent.click(screen.getByRole('button', { name: copy.x9Continue }));
    expect(screen.getByRole('heading', { name: copy.x9Sessions })).toBeTruthy();
  });

  it('does not show a completed guide again', async () => {
    localStorage.setItem('ironpact.x9.guide.user-1', '1');
    renderCrew('/crew/new', mockRepo({ userId: 'user-1' }));
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
    fireEvent.click(screen.getByRole('button', { name: copy.x9Continue }));
    expect(await screen.findByText('floor')).toBeTruthy();
    expect(screen.queryByRole('region', { name: copy.x9Explainer })).toBeNull();
  });

  it('keeps a duplicate name editable without redeeming a used invite again', async () => {
    const redeem = vi.fn(async () => ({ ok: true as const, value: testCrew() }));
    const save = vi.fn(async () => ({ ok: true as const, value: testProfile() }));
    renderCrew('/join/ABCDEFGHJK', mockRepo({ userId: 'user-1', crew: { redeem }, w: { upsertMyProfile: save }, q: {
      myCrew: async () => ({ crew: testCrew(), members: [testMember(), testMember('partner')] }),
      profiles: async () => [testProfile({ id: 'partner', display_name: 'Lifter' })],
    } }));
    openProfile();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'lifter' } });
    submitProfile();
    expect(await screen.findByText(copy.nameTaken)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(copy.x9Name), { target: { value: 'Spotter' } });
    submitProfile();
    expect(await screen.findByText('floor')).toBeTruthy();
    expect(redeem).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });
});
