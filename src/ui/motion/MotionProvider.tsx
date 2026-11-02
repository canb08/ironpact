import type { ReactNode } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MotionReducedContext } from './reduced-context';
import { useReducedMotion } from './reduced';

/**
 * LazyMotion + domAnimation (R1 item 8, E3.10). `strict` rejects the full `motion` component
 * so features stay on `m.*` from `motion/react-m`. No extra box: `display: contents`.
 */
export function MotionProvider({ children, reduced = false }: { children: ReactNode; reduced?: boolean }) {
  const still = useReducedMotion(reduced);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionReducedContext.Provider value={still}>
        <div data-motion={still ? 'static' : 'live'} style={{ display: 'contents' }}>
          {children}
        </div>
      </MotionReducedContext.Provider>
    </LazyMotion>
  );
}
