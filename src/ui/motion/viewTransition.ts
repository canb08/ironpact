/**
 * View Transitions API, feature-detected (spec §3.7).
 * Reduced motion and unsupported browsers swap instantly.
 */
export function startViewTransition(
  update: () => void | Promise<void>,
  reduced = false,
): 'transition' | 'instant' {
  if (
    reduced
    || typeof document === 'undefined'
    || typeof document.startViewTransition !== 'function'
  ) {
    void update();
    return 'instant';
  }
  document.startViewTransition(() => update());
  return 'transition';
}
