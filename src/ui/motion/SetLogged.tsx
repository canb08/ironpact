import { useEffect, useRef, type ReactNode } from 'react';
import * as m from 'motion/react-m';
import { MotionProvider } from './MotionProvider';
import { playSetLogged } from './playSetLogged';
import { useReducedMotion } from './reduced';

/** Plays the set-logged micro on the surrounding `<form>`. */
export function SetLoggedPlayer({ playKey, reduced }: { playKey: number; reduced: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = anchor.current?.closest('form');
    if (!(form instanceof HTMLElement) || reduced || playKey === 0) return;
    return playSetLogged(form);
  }, [playKey, reduced]);
  return <span ref={anchor} hidden />;
}

/** Tier-3 shell. Reduced motion renders the children with no transform. */
export function SetLoggedMotion({
  playKey,
  reduced = false,
  children,
}: {
  playKey: number;
  reduced?: boolean;
  children: ReactNode;
}) {
  const still = useReducedMotion(reduced);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || still || playKey === 0) return;
    return playSetLogged(node);
  }, [playKey, still]);
  if (still) return <div data-motion="static" data-play={playKey}>{children}</div>;
  return (
    <MotionProvider>
      <m.div ref={ref} data-motion="live" data-play={playKey} initial={false}>
        {children}
      </m.div>
    </MotionProvider>
  );
}
