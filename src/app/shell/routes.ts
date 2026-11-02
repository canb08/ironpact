/** Detail pages belong to Progress; Settings returns to the tab that opened it. */
export function parentTab(pathname: string): string {
  if (pathname === '/progress' || pathname.startsWith('/exercise/') || pathname.startsWith('/day/')) return '/progress';
  if (pathname === '/session') return '/session';
  if (pathname === '/crew') return '/crew';
  return '/';
}

export function isDetail(pathname: string): boolean {
  return pathname.startsWith('/exercise/') || pathname.startsWith('/day/')
    || pathname === '/settings' || pathname.startsWith('/settings/');
}

/** Router history starts at index zero even when browser history includes another site. */
export function canGoBack(state: unknown): boolean {
  if (state === null || typeof state !== 'object' || !('idx' in state)) return false;
  return typeof state.idx === 'number' && state.idx > 0;
}
