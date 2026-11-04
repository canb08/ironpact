import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function mediaPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/** Spec §3.7.3: the OS media query or the in-app `profiles.reduce_motion` toggle. */
export function motionIsReduced(profileReduce: boolean, mediaReduce = mediaPrefersReducedMotion()): boolean {
  return profileReduce || mediaReduce;
}

export function useReducedMotion(profileReduce = false): boolean {
  const [media, setMedia] = useState(mediaPrefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(QUERY);
    const sync = () => setMedia(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);
  const [documentStill, setDocumentStill] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'on');
  useEffect(() => {
    const sync = () => setDocumentStill(document.documentElement.dataset.reducedMotion === 'on');
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    sync();
    return () => observer.disconnect();
  }, []);
  return profileReduce || media || documentStill;
}
