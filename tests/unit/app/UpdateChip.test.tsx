// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoProvider } from '../../../src/app/RepoProvider.tsx';
import { UpdateChip } from '../../../src/app/UpdateChip.tsx';
import { copy } from '../../../src/ui';
import { shellRepo } from './harness.ts';

const reload = vi.fn();

afterEach(() => {
  cleanup();
  reload.mockReset();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

function stubRegistration(options: { waiting?: boolean; controller?: boolean } = {}) {
  const postMessage = vi.fn();
  const updateListeners = new Set<() => void>();
  const waiting = options.waiting
    ? { postMessage, state: 'installed', addEventListener: vi.fn(), removeEventListener: vi.fn() }
    : null;
  const registration = {
    waiting,
    installing: null as { state: string; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> } | null,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'updatefound') updateListeners.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'updatefound') updateListeners.delete(listener);
    },
  };
  const serviceWorker = {
    controller: options.controller ? { scriptURL: '/sw.js' } : null,
    getRegistration: vi.fn().mockResolvedValue(registration),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
  return { postMessage, registration, updateListeners, serviceWorker };
}

function renderChip(sessionOpen = false) {
  const harness = shellRepo();
  harness.setSessionOpen(sessionOpen);
  render(
    <RepoProvider repo={harness.repo}>
      <UpdateChip />
    </RepoProvider>,
  );
  return harness;
}

describe('SW update chip', () => {
  it('stays hidden when no updated worker is waiting', async () => {
    const { serviceWorker } = stubRegistration({ waiting: false, controller: true });
    renderChip(false);
    await waitFor(() => expect(serviceWorker.getRegistration).toHaveBeenCalled());
    await expect(serviceWorker.getRegistration.mock.results[0]?.value).resolves.toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.swUpdate })).toBeNull();
  });

  it('stays hidden on the first install, before a controller exists', async () => {
    const { serviceWorker } = stubRegistration({ waiting: true, controller: false });
    renderChip(false);
    await waitFor(() => expect(serviceWorker.getRegistration).toHaveBeenCalled());
    await expect(serviceWorker.getRegistration.mock.results[0]?.value).resolves.toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.swUpdate })).toBeNull();
  });

  it('offers the update when a worker is waiting and no session is open', async () => {
    stubRegistration({ waiting: true, controller: true });
    renderChip(false);
    expect(await screen.findByRole('button', { name: copy.swUpdate })).toBeTruthy();
  });

  it('suppresses the chip while a session is open', async () => {
    const { serviceWorker } = stubRegistration({ waiting: true, controller: true });
    const harness = renderChip(true);
    await waitFor(() => expect(serviceWorker.getRegistration).toHaveBeenCalled());
    await expect(harness.repo.q.openSession()).resolves.toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.swUpdate })).toBeNull();
  });

  it('posts SKIP_WAITING and reloads', async () => {
    const { postMessage } = stubRegistration({ waiting: true, controller: true });
    const location = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...location, reload } });
    renderChip(false);
    await userEvent.click(await screen.findByRole('button', { name: copy.swUpdate }));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', { configurable: true, value: location });
  });
});
