// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import { AppShell } from '../../../../src/App.tsx';
import { copy, fill } from '../../../../src/ui/copy.ts';
import SignInScreen from '../../../../src/features/auth/SignInScreen.tsx';
import { router } from '../../../../src/router.tsx';
import { dismissInstallGate } from '../../../../src/features/auth/joinCode.ts';
import { mockRepo, testCrew, testMember, testProfile } from './mockRepo.ts';
import type { Profile } from '../../../../src/core/types.ts';

function renderSignIn(repo: ReturnType<typeof mockRepo>) {
  const memory = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInScreen /> },
      { path: '/crew/new', element: <div>crew</div> },
      { path: '/join/:code', element: <div>join</div> },
    ],
    { initialEntries: ['/sign-in'] },
  );
  render(
    <RepoProvider repo={repo}>
      <RouterProvider router={memory} />
    </RepoProvider>,
  );
}

describe('S2 sign in', () => {
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('sends a code, accepts a pasted 6-digit code, and verifies', async () => {
    const sendCode = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const verifyCode = vi.fn(async () => ({ ok: true as const, value: 'user-1' }));
    renderSignIn(mockRepo({ auth: { sendCode, verifyCode } }));
    fireEvent.change(screen.getByLabelText(copy.emailLabel), { target: { value: 'alice@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: copy.sendCode }));
    expect(await screen.findByLabelText(fill(copy.codeDigit, { n: 1 }))).toBeTruthy();
    expect(sendCode).toHaveBeenCalledWith('alice@example.test');
    fireEvent.paste(screen.getByLabelText(fill(copy.codeDigit, { n: 1 })), {
      clipboardData: { getData: () => '123456' },
    });
    for (let n = 1; n <= 6; n += 1) {
      expect((screen.getByLabelText(fill(copy.codeDigit, { n })) as HTMLInputElement).value).toBe(String(n));
    }
    fireEvent.click(screen.getByRole('button', { name: copy.x9Verify }));
    expect(verifyCode).toHaveBeenCalledWith('alice@example.test', '123456');
  });

  it('shows wrong-code and expired-code copy', async () => {
    const verifyCode = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'bad_code' })
      .mockResolvedValueOnce({ ok: false, error: 'expired' });
    renderSignIn(mockRepo({ auth: { verifyCode } }));
    fireEvent.change(screen.getByLabelText(copy.emailLabel), { target: { value: 'alice@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: copy.sendCode }));
    const first = await screen.findByLabelText(fill(copy.codeDigit, { n: 1 }));
    fireEvent.paste(first, { clipboardData: { getData: () => '000000' } });
    fireEvent.click(screen.getByRole('button', { name: copy.x9Verify }));
    expect(await screen.findByText(copy.wrongCode)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.x9Verify }));
    expect(await screen.findByText(copy.expiredCode)).toBeTruthy();
  });

  it('resends after the cooldown, clears the previous code, and supports changing email', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const sendCode = vi.fn(async () => ({ ok: true as const, value: undefined }));
    renderSignIn(mockRepo({ auth: { sendCode } }));
    fireEvent.change(screen.getByLabelText(copy.emailLabel), { target: { value: 'alice@example.test' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.sendCode })); });
    const first = screen.getByLabelText(fill(copy.codeDigit, { n: 1 }));
    fireEvent.paste(first, { clipboardData: { getData: () => '123456' } });
    expect(screen.getByRole('button', { name: copy.x9Resend }).hasAttribute('disabled')).toBe(true);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.x9Resend })); });
    expect(sendCode).toHaveBeenCalledTimes(2);
    expect((first as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: copy.x9ChangeEmail }));
    expect((screen.getByLabelText(copy.emailLabel) as HTMLInputElement).value).toBe('alice@example.test');
  });

  it('counts down and disables resend until 0', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const sendCode = vi.fn(async () => ({ ok: false as const, error: 'rate_limited' as const }));
    renderSignIn(mockRepo({ auth: { sendCode } }));
    fireEvent.change(screen.getByLabelText(copy.emailLabel), { target: { value: 'alice@example.test' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.sendCode }));
    });
    expect(screen.getByText(fill(copy.otpCountdown, { seconds: 60 }))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.sendCode }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByRole('button', { name: copy.sendCode }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(fill(copy.otpCountdown, { seconds: 1 }))).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText(/Code delayed/)).toBeNull();
    expect(screen.getByRole('button', { name: copy.sendCode }).hasAttribute('disabled')).toBe(false);
  });
});

describe('auth gate', () => {
  // Unit test setup: compile the lazy screen before exercising the interaction.
  beforeAll(async () => { await import('../../../../src/features/onboarding/CrewSetupScreen.tsx'); });
  beforeEach(async () => {
    sessionStorage.clear();
    dismissInstallGate();
    await router.navigate('/sign-in');
  });

  it('sends a code, verifies, then creates a crew from the profile step', async () => {
    const sendCode = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const verifyCode = vi.fn(async () => ({ ok: true as const, value: 'user-1' }));
    const create = vi.fn(async (name: string) => ({ ok: true as const, value: testCrew({ name }) }));
    const upsertMyProfile = vi.fn(async (patch: Partial<Profile>) => ({
      ok: true as const,
      value: testProfile(patch),
    }));
    let hasCrew = false;
    const repo = mockRepo({
      auth: { sendCode, verifyCode },
      crew: {
        create: async (name) => {
          hasCrew = true;
          return create(name);
        },
      },
      q: {
        myCrew: async () => (hasCrew ? { crew: testCrew(), members: [testMember()] } : undefined),
        profiles: async () => [],
      },
      w: { upsertMyProfile },
    });
    render(
      <AppShell repo={repo} />,
    );
    fireEvent.change(await screen.findByLabelText(copy.emailLabel), { target: { value: 'alice@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: copy.sendCode }));
    fireEvent.paste(await screen.findByLabelText(fill(copy.codeDigit, { n: 1 })), {
      clipboardData: { getData: () => '123456' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.x9Verify }));
    });
    fireEvent.click(await screen.findByRole('button', { name: copy.x9Continue }));
    fireEvent.change(await screen.findByLabelText(copy.x9Name), { target: { value: 'Lifter' } });
    fireEvent.click(screen.getByRole('button', { name: copy.x9Continue }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.x9Skip }));
    });
    expect(create).toHaveBeenCalledWith(copy.defaultCrewName);
    expect(upsertMyProfile).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Lifter', color_hue: 353, weekly_target: 3, initial: 'L' }),
    );
  });

  it('sends a first browser launch to the install gate, and a join link stays put', async () => {
    localStorage.removeItem('ironpact.install-dismissed');
    render(<AppShell repo={mockRepo()} />);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/install');
    });
    await act(async () => {
      await router.navigate('/join/ABCDEFGHJK');
    });
    expect(router.state.location.pathname).toBe('/join/ABCDEFGHJK');
  });
});
