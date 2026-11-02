// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { InstallChip } from '../../../../src/features/floor/InstallChip.tsx';
import { copy } from '../../../../src/ui/copy.ts';

let standalone = false;
beforeEach(() => {
  standalone = false;
  localStorage.clear();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone Safari/604.1');
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(display-mode: standalone)' && standalone,
    addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function renderChip() { return render(<MemoryRouter><InstallChip /></MemoryRouter>); }

it('shows only after skipping the gate in a mobile browser tab, never installed or on desktop', () => {
  const gated = renderChip();
  expect(screen.queryByRole('link')).toBeNull();
  gated.unmount();
  localStorage.setItem('ironpact.install-dismissed', '1');
  const mobile = renderChip();
  expect(screen.getByRole('link', { name: copy.x3Install }).getAttribute('href')).toBe('/install');
  mobile.unmount();
  standalone = true;
  const installed = renderChip();
  expect(screen.queryByRole('link')).toBeNull();
  installed.unmount();
  standalone = false;
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64)');
  renderChip();
  expect(screen.queryByRole('link')).toBeNull();
});

it('remembers dismissal across mounts', () => {
  localStorage.setItem('ironpact.install-dismissed', '1');
  const first = renderChip();
  fireEvent.click(screen.getByRole('button', { name: copy.x3DismissInstall }));
  expect(screen.queryByRole('link')).toBeNull();
  first.unmount();
  renderChip();
  expect(screen.queryByRole('link')).toBeNull();
});

it('still dismisses for the visit when storage writes are denied', () => {
  localStorage.setItem('ironpact.install-dismissed', '1');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  renderChip();
  fireEvent.click(screen.getByRole('button', { name: copy.x3DismissInstall }));
  expect(screen.queryByRole('link')).toBeNull();
});

it('does not crash when storage reads are denied', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  renderChip();
  expect(screen.queryByRole('link')).toBeNull();
});
