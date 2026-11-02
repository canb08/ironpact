// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../../../src/App.tsx';
import { router } from '../../../../src/router.tsx';
import { dismissInstallGate, readJoinCode } from '../../../../src/features/auth/joinCode.ts';
import type { Repo } from '../../../../src/data/adapter.ts';
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
