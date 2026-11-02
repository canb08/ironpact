import type { TierName } from '../../core/streak.ts';
import { copy, fill } from '../../ui/copy.ts';
import { ForgeFlame } from './ForgeFlame.tsx';

/** Tier-1 bar tier-up. Reduced motion is a static card and no particles (§3.7.3, §3.9.2). */
export function BarTierMoment({ tier, plates, reduced }: { tier: TierName; plates: number; reduced: boolean }) {
  return (
    <section className="tier-up" data-motion={reduced ? 'static' : 'live'} data-testid="bar-tier-up">
      <ForgeFlame plates={plates} tier={tier} reduced={reduced} />
      {reduced ? null : (
        <svg className="tier-up__chalk" data-puff="" aria-hidden="true" width="120" height="24" viewBox="0 0 120 24">
          {Array.from({ length: 60 }, (_, index) => (
            <circle key={index} cx={(index % 20) * 6 + 3} cy={8 + (index % 3) * 4} r={index % 4 === 0 ? 1.6 : 1} fill="var(--text)" />
          ))}
        </svg>
      )}
      <p>{fill(copy.tierUp, { Tier: tier })}</p>
    </section>
  );
}
