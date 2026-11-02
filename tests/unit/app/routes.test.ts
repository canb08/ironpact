import { describe, expect, it } from 'vitest';
import { canGoBack, isDetail, parentTab } from '../../../src/app/shell/routes.ts';

describe('shell navigation', () => {
  it('keeps Progress selected on exercise and day details', () => {
    for (const path of ['/progress', '/exercise/bench', '/day/2026-11-02']) expect(parentTab(path)).toBe('/progress');
    expect(parentTab('/session')).toBe('/session');
    expect(parentTab('/crew')).toBe('/crew');
    expect(parentTab('/settings')).toBe('/');
  });
  it('gives details a back button, including settings sub-pages', () => {
    for (const path of ['/exercise/bench', '/day/2026-11-02', '/settings', '/settings/training']) expect(isDetail(path)).toBe(true);
    for (const path of ['/', '/crew', '/session', '/progress']) expect(isDetail(path)).toBe(false);
  });
  it('does not leave a fresh PWA for an external browser history entry', () => {
    for (const state of [null, undefined, {}, { idx: 0 }, { idx: -1 }, { idx: '1' }]) expect(canGoBack(state)).toBe(false);
    expect(canGoBack({ idx: 1 })).toBe(true);
  });
});
