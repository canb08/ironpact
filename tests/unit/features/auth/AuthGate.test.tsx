// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../../../src/App.tsx';
import { router } from '../../../../src/router.tsx';
import { dismissInstallGate, readJoinCode } from '../../../../src/features/auth/joinCode.ts';
import type { Repo, SyncStatus } from '../../../../src/data/adapter.ts';
import { mockRepo, testCrew, testMember } from './mockRepo.ts';

const observed = vi.hoisted(() => ({ render: vi.fn(), mount: vi.fn(), unmount: vi.fn() }));

vi.mock('../../../../src/router.tsx', async () => {
  const { createElement, useEffect } = await import('react');
  const { createMemoryRouter, Outlet } = await import('react-router');
  function Layout() {
    useEffect(() => {
      observed.mount();
      return () => { observed.unmount(); };
    }, []);
    return createElement(Outlet);
  }
  function Route({ path }: { path: string }) {
    observed.render(path);
    return createElement('div', { 'data-testid': 'route' }, path);
  }
  return {
    router: createMemoryRouter([{
      element: createElement(Layout),
      children: ['/', '/install', '/sign-in', '/crew/new', '/join/:code', '/session'].map((path) => ({
        path,
        element: createElement(Route, { path }),
      })),
    }]),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const crew = { crew: testCrew(), members: [testMember()] };

describe('AuthGate first paint', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await router.navigate('/');
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders install first on a browser launch, without mounting the Floor', async () => {
    const read = deferred<Awaited<ReturnType<Repo['q']['myCrew']>>>();
    render(<AppShell repo={mockRepo({ userId: 'user-1', q: { myCrew: () => read.promise } })} />);
    expect(observed.render).not.toHaveBeenCalled();
    await act(async () => { read.resolve(crew); });
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/install');
    expect(observed.render).toHaveBeenCalledWith('/install');
    expect(observed.render).not.toHaveBeenCalledWith('/');
  });

  it('renders the Floor after one pass for a signed-in member with a crew', async () => {
    dismissInstallGate();
    const read = deferred<Awaited<ReturnType<Repo['q']['myCrew']>>>();
    const myCrew = vi.fn(() => read.promise);
    render(<AppShell repo={mockRepo({ userId: 'user-1', q: { myCrew } })} />);
    expect(observed.render).not.toHaveBeenCalled();
    await act(async () => { read.resolve(crew); });
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/');
    expect(myCrew).toHaveBeenCalledTimes(1);
  });

  it('holds the first paint through StrictMode effect cleanup and replay', async () => {
    const read = deferred<Awaited<ReturnType<Repo['q']['myCrew']>>>();
    const repo = mockRepo({ userId: 'user-1', q: { myCrew: () => read.promise } });
    render(<StrictMode><AppShell repo={repo} /></StrictMode>);
    expect(observed.render).not.toHaveBeenCalled();
    await act(async () => { read.resolve(crew); });
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/install');
    expect(observed.render).not.toHaveBeenCalledWith('/');
  });

  it('renders crew setup first for a signed-in user without a crew', async () => {
    dismissInstallGate();
    render(<AppShell repo={mockRepo({ userId: 'user-1' })} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/crew/new');
    expect(observed.render).not.toHaveBeenCalledWith('/');
  });

  it('waits for the fresh-device pull and renders the Floor without crew setup', async () => {
    dismissInstallGate();
    await router.navigate('/sign-in');
    const pulled = deferred<void>();
    let membership: typeof crew | undefined;
    const pullNow = vi.fn(async () => { await pulled.promise; membership = crew; });
    render(<AppShell repo={mockRepo({
      userId: 'user-1', q: { myCrew: async () => membership }, sync: { pullNow },
    })} />);
    await waitFor(() => { expect(pullNow).toHaveBeenCalledOnce(); });
    expect(observed.render).not.toHaveBeenCalled();
    await act(async () => { pulled.resolve(); });
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/');
    expect(observed.render).not.toHaveBeenCalledWith('/crew/new');
  });

  it('recovers from crew setup when a later pull brings membership', async () => {
    dismissInstallGate();
    const mirror: { membership?: typeof crew } = {};
    let notify: ((status: SyncStatus) => void) | undefined;
    const unsubscribe = vi.fn();
    const onStatus = vi.fn((cb: (status: SyncStatus) => void) => { notify = cb; return unsubscribe; });
    const repo = mockRepo({
      userId: 'user-1', q: { myCrew: async () => mirror.membership }, sync: { onStatus },
    });
    const view = render(<AppShell repo={repo} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/crew/new');
    mirror.membership = crew;
    await act(async () => { notify?.(repo.sync.status()); });
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/');
    expect(observed.mount).toHaveBeenCalledOnce();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(onStatus.mock.calls.length);
  });

  it('decides crew setup immediately offline without attempting a pull', async () => {
    dismissInstallGate();
    const pullNow = vi.fn(async () => {});
    render(<AppShell repo={mockRepo({
      userId: 'user-1', sync: {
        pullNow,
        status: () => ({ state: 'offline', pendingCount: 0, deadCount: 0, lastSyncedAt: null }),
      },
    })} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/crew/new');
    expect(pullNow).not.toHaveBeenCalled();
  });

  it('caps a hung first pull at 3 seconds and still reacts to its late completion', async () => {
    vi.useFakeTimers();
    dismissInstallGate();
    const pulled = deferred<void>();
    const mirror: { membership?: typeof crew } = {};
    let notify: ((status: SyncStatus) => void) | undefined;
    const repo = mockRepo({
      userId: 'user-1', q: { myCrew: async () => mirror.membership },
      sync: {
        pullNow: () => pulled.promise,
        onStatus: (cb) => { notify = cb; return () => {}; },
      },
    });
    render(<AppShell repo={repo} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_999); });
    expect(observed.render).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByTestId('route')).toHaveProperty('textContent', '/crew/new');
    mirror.membership = crew;
    await act(async () => { pulled.resolve(); notify?.(repo.sync.status()); });
    expect(screen.getByTestId('route')).toHaveProperty('textContent', '/');
  });

  it('releases the gate after a failed pull', async () => {
    dismissInstallGate();
    render(<AppShell repo={mockRepo({
      userId: 'user-1', sync: { pullNow: async () => { throw new Error('offline'); } },
    })} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/crew/new');
  });

  it('ignores the old account pull after sign-out', async () => {
    dismissInstallGate();
    const pulled = deferred<void>();
    const pullNow = vi.fn(() => pulled.promise);
    const repo = mockRepo({ userId: 'user-1', sync: { pullNow } });
    render(<AppShell repo={repo} />);
    await waitFor(() => { expect(pullNow).toHaveBeenCalledOnce(); });
    await act(async () => { await repo.auth.signOut(); });
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/sign-in');
    await act(async () => { pulled.resolve(); });
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('renders sign-in first for a signed-out user who skipped install', async () => {
    dismissInstallGate();
    render(<AppShell repo={mockRepo()} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/sign-in');
    expect(observed.render).not.toHaveBeenCalledWith('/');
  });

  it('keeps children hidden until the initial redirect lands', async () => {
    const landing = deferred<void>();
    const navigate = router.navigate.bind(router);
    vi.spyOn(router, 'navigate').mockImplementationOnce(async (target, options) => {
      await landing.promise;
      await navigate(target, options);
    });
    render(<AppShell repo={mockRepo()} />);
    expect(router.state.location.pathname).toBe('/');
    expect(observed.render).not.toHaveBeenCalled();
    await act(async () => { landing.resolve(); });
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/install');
    expect(observed.render).not.toHaveBeenCalledWith('/');
  });

  it('shows children at 3 seconds if myCrew is still pending, and handles its late result', async () => {
    vi.useFakeTimers();
    const read = deferred<Awaited<ReturnType<Repo['q']['myCrew']>>>();
    render(<AppShell repo={mockRepo({ userId: 'user-1', q: { myCrew: () => read.promise } })} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_999); });
    expect(observed.render).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    expect(screen.getByTestId('route')).toHaveProperty('textContent', '/');
    await act(async () => { read.resolve(crew); });
    expect(screen.getByTestId('route')).toHaveProperty('textContent', '/install');
    expect(observed.mount).toHaveBeenCalledTimes(1);
    expect(observed.unmount).not.toHaveBeenCalled();
  });

  it('shows children if myCrew rejects', async () => {
    const myCrew = vi.fn().mockRejectedValue(new Error('DB unavailable'));
    render(<AppShell repo={mockRepo({ userId: 'user-1', q: { myCrew } })} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/');
  });

  it('keeps children mounted while redirecting after sign-out', async () => {
    dismissInstallGate();
    const repo = mockRepo({ userId: 'user-1', q: { myCrew: async () => crew } });
    render(<AppShell repo={repo} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/');
    await act(async () => { await repo.auth.signOut(); });
    await waitFor(() => {
      expect(screen.getByTestId('route')).toHaveProperty('textContent', '/sign-in');
    });
    expect(observed.mount).toHaveBeenCalledTimes(1);
    expect(observed.unmount).not.toHaveBeenCalled();
  });

  it('preserves join links and their code on the first pass', async () => {
    await router.navigate('/join/ABCDEFGHJK');
    render(<AppShell repo={mockRepo()} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/join/:code');
    expect(router.state.location.pathname).toBe('/join/ABCDEFGHJK');
    expect(readJoinCode()).toBe('ABCDEFGHJK');
    expect(observed.render).not.toHaveBeenCalledWith('/install');
  });

  it('does not hide children during a later slow route check', async () => {
    dismissInstallGate();
    const read = deferred<Awaited<ReturnType<Repo['q']['myCrew']>>>();
    const myCrew = vi.fn().mockResolvedValueOnce(crew).mockImplementation(() => read.promise);
    render(<AppShell repo={mockRepo({ userId: 'user-1', q: { myCrew } })} />);
    expect(await screen.findByTestId('route')).toHaveProperty('textContent', '/');
    await act(async () => { await router.navigate('/session'); });
    expect(screen.getByTestId('route')).toHaveProperty('textContent', '/session');
    expect(observed.mount).toHaveBeenCalledTimes(1);
    expect(observed.unmount).not.toHaveBeenCalled();
    await act(async () => { read.resolve(crew); });
  });
});
