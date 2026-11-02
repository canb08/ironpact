// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { InstallChip } from '../../../../src/features/floor/InstallChip.tsx';
import { copy } from '../../../../src/ui/copy.ts';

let standalone = false;

beforeEach(() => {
  standalone = false;
  localStorage.clear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(display-mode: standalone)' && standalone,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function renderChip() {
  return render(
    <MemoryRouter>
      <InstallChip />
    </MemoryRouter>,
  );
}

it('shows the install chip only after the gate was skipped, and hides it once installed', () => {
  const hidden = renderChip();
  expect(screen.queryByRole('link', { name: copy.install })).toBeNull();
  hidden.unmount();

  localStorage.setItem('ironpact.install-dismissed', '1');
  const skipped = renderChip();
  const link = screen.getByRole('link', { name: copy.install });
  expect(link.getAttribute('href')).toBe('/install');
  expect(link.textContent).toBe('Install to keep your data safe.');
  skipped.unmount();

  standalone = true;
  renderChip();
  expect(screen.queryByRole('link', { name: copy.install })).toBeNull();
});
