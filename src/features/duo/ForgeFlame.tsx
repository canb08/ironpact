import { AnimatedNumber } from '../../ui/motion/AnimatedNumber';
import { useEffect, useRef, useState } from 'react';
import type { TierName } from '../../core/streak.ts';
import { copy } from '../../ui/copy.ts';
import { useReducedMotion } from '../../ui/motion/reduced.ts';
import { FLAME_CORE, FLAME_MID, FLAME_TIER_COLOR, flameBreath } from './flame.ts';

/** Teardrop, point up. Three stacked copies: outer tier, molten mid, chalk core. */
const TEAR = 'M32 4C32 4 54 26 54 40C54 52 44 60 32 60C20 60 10 52 10 40C10 26 32 4 32 4Z';
const TEAR_MID = 'M32 16C32 16 46 32 46 42C46 50 40 54 32 54C24 54 18 50 18 42C18 32 32 16 32 16Z';
const TEAR_CORE = 'M32 28C32 28 40 38 40 44C40 48 36 50 32 50C28 50 24 48 24 44C24 38 32 28 32 28Z';

export function ForgeFlame({
  plates,
  tier,
  reduced = false,
  batterySaver = false,
}: {
  plates: number;
  tier: TierName;
  reduced?: boolean;
  batterySaver?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const still = useReducedMotion(reduced);
  const breath = flameBreath({ reduced: still, batterySaver, onScreen });
  const outer = FLAME_TIER_COLOR[tier];

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      setOnScreen(entry?.isIntersecting ?? false);
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="forge-flame"
      data-motion={still ? 'static' : 'live'}
      data-breath={breath}
      data-tier={tier}
      data-battery={batterySaver ? 'on' : 'off'}
    >
      <svg className="forge-flame__shape" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <title>{tier}</title>
        <path className="forge-flame__outer" d={TEAR} fill={outer} />
        <path d={TEAR_MID} fill={FLAME_MID} />
        <path d={TEAR_CORE} fill={FLAME_CORE} />
        {tier === 'Obsidian' ? (
          <path className="forge-flame__rim" data-rim="" d={TEAR} fill="none" stroke={FLAME_MID} strokeWidth="2" />
        ) : null}
      </svg>
      <p className="forge-plate">
        <span className="forge-plate__count"><AnimatedNumber value={plates} reduced={reduced} /></span>
        <span className="forge-plate__label">{copy.platesLabel}</span>
      </p>
    </div>
  );
}
