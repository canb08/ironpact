import { animate } from 'motion/react';
import { EASE_OUT, MOTION_MS, SLAM } from './springs';

/**
 * Tier-3 set logged (spec §3.7.2): card scale 0.96 → 1 on SLAM, one 4px plate drop,
 * weight number `wdth` 100 → 125 → 100. Call only when motion is allowed.
 * Anybody is not installed (P4A); `wdth` is still written for when that face lands.
 */
export function playSetLogged(card: HTMLElement): () => void {
  const cardRun = animate(
    card,
    { scale: [0.96, 1], y: [0, 4, 0] },
    {
      scale: { type: SLAM.type, stiffness: SLAM.stiffness, damping: SLAM.damping },
      y: { duration: MOTION_MS.plateDrop / 1000, times: [0, 0.5, 1], ease: [...EASE_OUT] },
      reduceMotion: false,
    },
  );
  const input = card.querySelector<HTMLElement>('[data-set-logged-weight] input');
  const flex = input
    ? animate(
      input,
      { fontVariationSettings: ['"wdth" 100', '"wdth" 125', '"wdth" 100'] },
      { duration: MOTION_MS.wdth / 1000, times: [0, 0.5, 1], ease: [...EASE_OUT], reduceMotion: false },
    )
    : null;
  return () => {
    cardRun.stop();
    flex?.stop();
  };
}
