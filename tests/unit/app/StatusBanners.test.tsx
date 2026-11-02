// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepoProvider } from '../../../src/app/RepoProvider.tsx';
import { StatusBanners } from '../../../src/app/StatusBanners.tsx';
import { copy } from '../../../src/ui';
import { shellRepo } from './harness.ts';

function renderBanners(initial: 'idle' | 'flushing' | 'offline' | 'server_asleep' = 'idle') {
  const harness = shellRepo(initial);
  render(
    <RepoProvider repo={harness.repo}>
      <StatusBanners />
    </RepoProvider>,
  );
  return harness;
}

describe('status banners', () => {
  it('stays quiet while sync is idle or flushing', () => {
    const harness = renderBanners('idle');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => harness.setState('flushing'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the offline banner while the phone is offline', () => {
    renderBanners('offline');
    expect(screen.getByRole('status').textContent).toBe(copy.offlineBanner);
    expect(screen.queryByText(copy.serverAsleep)).toBeNull();
  });

  it('shows the server-asleep banner when the server is paused', () => {
    renderBanners('server_asleep');
    expect(screen.getByRole('status').textContent).toBe(copy.serverAsleep);
    expect(screen.queryByText(copy.offlineBanner)).toBeNull();
  });

  it('swaps and clears the banner as sync status changes', () => {
    const harness = renderBanners('offline');
    expect(screen.getByRole('status').textContent).toBe(copy.offlineBanner);
    act(() => harness.setState('server_asleep'));
    expect(screen.getByRole('status').textContent).toBe(copy.serverAsleep);
    act(() => harness.setState('idle'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
