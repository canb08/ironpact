import { useSyncExternalStore } from 'react';
import { debugWeekActive } from './view.ts';

/** Reads `?debug=week`. Production Supabase builds compile this to false (E5.11). */
export function useDebugWeek(): boolean {
  const search = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('popstate', onChange);
      return () => window.removeEventListener('popstate', onChange);
    },
    () => window.location.search,
    () => '',
  );
  return debugWeekActive(search);
}
