// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../../src/App.tsx';
import { copy } from '../../../src/ui';
import { shellRepo } from './harness.ts';

describe('AppShell mounts the shell chrome', () => {
  it('shows the offline banner from inside the shell', () => {
    const { repo } = shellRepo('offline');
    render(<AppShell repo={repo} />);
    expect(screen.getByRole('status').textContent).toBe(copy.offlineBanner);
  });

  it('shows the server-asleep banner from inside the shell', () => {
    const { repo } = shellRepo('server_asleep');
    render(<AppShell repo={repo} />);
    expect(screen.getByRole('status').textContent).toBe(copy.serverAsleep);
  });
});
