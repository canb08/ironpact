import { lazy, Suspense } from 'react';
import { useReducedMotion } from './reduced';

const NumberFlow = lazy(() => import('@number-flow/react'));

/** Lazy NumberFlow. Reduced motion (OS or profile) jumps to the value with no ticker. */
export function AnimatedNumber({ value, reduced = false }: { value: number; reduced?: boolean }) {
  const still = useReducedMotion(reduced);
  if (still) return <span data-motion="static">{value}</span>;
  return (
    <Suspense fallback={<span data-motion="static">{value}</span>}>
      <NumberFlow value={value} animated respectMotionPreference />
    </Suspense>
  );
}
