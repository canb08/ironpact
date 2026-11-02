import { useCallback, useEffect, useState } from 'react';
import { useMotionReduced } from '../../ui/motion/reduced-context';

/**
 * Tier-3 set logged: "Locked in." plus the SLAM / plate-drop / wdth flex.
 * One call from the logging card. Reduced motion keeps the card static.
 * The line is its own live region. The shared toast queue is one slot and
 * already carries "Undone · Restore", so this must not take that slot.
 */
export function useSetLoggedMicro() {
  const reduced = useMotionReduced();
  const [playKey, setPlayKey] = useState(0);
  const [visible, setVisible] = useState(false);
  const play = useCallback(() => {
    setVisible(true);
    setPlayKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, [visible, playKey]);

  return { play, playKey, visible, reduced };
}
