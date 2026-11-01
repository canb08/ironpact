// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import InstallGate from '../../../src/features/install/InstallGate';
import { copy } from '../../../src/ui/copy';

const platform = vi.hoisted(() => ({
  isStandalone: vi.fn(() => false),
  getInstallBrowser: vi.fn(() => 'ios-safari'),
  canPromptInstall: vi.fn(() => false),
  promptInstall: vi.fn().mockResolvedValue('accepted'),
  subscribeInstall: vi.fn(() => () => {}),
  persistStorageAfterInstall: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../src/platform/install', () => platform);
vi.mock('../../../src/platform/storage', () => platform);

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/install']}>
      <Routes>
        <Route path="/install" element={<InstallGate />} />
        <Route path="/" element={<p>Floor destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  platform.isStandalone.mockReturnValue(false);
  platform.getInstallBrowser.mockReturnValue('ios-safari');
  platform.canPromptInstall.mockReturnValue(false);
  platform.promptInstall.mockResolvedValue('accepted');
});

describe('S1 installation gate', () => {
  it.each([
    ['ios-safari', copy.installIosShare], ['android', copy.installAndroidMenu],
    ['ios-other', copy.installOpenSafari], ['other', copy.installOther],
  ])('shows %s instructions and an escape to the app', (browser, instruction) => {
    platform.getInstallBrowser.mockReturnValue(browser);
    renderGate();
    expect(screen.getByRole('heading', { name: copy.installTitle })).toBeTruthy();
    expect(screen.getByText(instruction)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.installButton })).toBeNull();
    expect(platform.persistStorageAfterInstall).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: copy.installContinue }));
    expect(screen.getByText('Floor destination')).toBeTruthy();
  });

  it('redirects standalone launches without showing S1 and requests storage persistence', async () => {
    platform.isStandalone.mockReturnValue(true);
    renderGate();
    expect(screen.queryByRole('heading', { name: copy.installTitle })).toBeNull();
    expect(screen.getByText('Floor destination')).toBeTruthy();
    await waitFor(() => expect(platform.persistStorageAfterInstall).toHaveBeenCalled());
  });

  it('only invokes a captured prompt on a user tap', async () => {
    platform.getInstallBrowser.mockReturnValue('android');
    platform.canPromptInstall.mockReturnValue(true);
    renderGate();
    expect(platform.promptInstall).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: copy.installButton })));
    expect(platform.promptInstall).toHaveBeenCalledTimes(1);
  });

  it('keeps manual steps and the browser escape available after a prompt error', async () => {
    platform.getInstallBrowser.mockReturnValue('android');
    platform.canPromptInstall.mockReturnValue(true);
    platform.promptInstall.mockResolvedValue('unavailable');
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: copy.installButton }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(copy.installPromptUnavailable));
    expect(screen.getByText(copy.installAndroidMenu)).toBeTruthy();
    expect(screen.getByRole('link', { name: copy.installContinue })).toBeTruthy();
  });
});
