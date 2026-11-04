import { lazy, Suspense } from 'react';
import { SPRING_EASE, SPRING_MS } from './springs';
import { useReducedMotion } from './reduced';

const NumberFlow = lazy(() => import('@number-flow/react'));

/** Lazy NumberFlow. Reduced motion (OS or profile) jumps to the value with no ticker. */
export function AnimatedNumber({ value, reduced = false }: { value: number; reduced?: boolean }) {
  const still = useReducedMotion(reduced);
  if (still || typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return <span data-motion="static">{value}</span>;
  return (
    <Suspense fallback={<span data-motion="static">{value}</span>}>
      <NumberFlow value={value} format={{ useGrouping: false }} animated respectMotionPreference transformTiming={{ duration: SPRING_MS.ui, easing: SPRING_EASE.ui }} spinTiming={{ duration: SPRING_MS.ui, easing: SPRING_EASE.ui }} />
    </Suspense>
  );
}
