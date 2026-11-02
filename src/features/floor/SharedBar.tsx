import { useEffect, useRef } from 'react';
import { PlateBar, useReducedMotion } from '../../ui';
import type { MemberWeek } from '../duo/load.ts';

type BarMember = Pick<MemberWeek, 'id' | 'name' | 'credits' | 'target' | 'minCount' | 'weekStart'>;

/** Remember each person's week so returning from a workout (or a partner pull)
 * slides only new plates. An unseen week starts quietly. Storage is optional. */
export function SharedBar({ me, partner, reduced }: { me: BarMember; partner?: BarMember; reduced: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const still = useReducedMotion(reduced);
  const previous = useRef(new Map<string, number>());

  useEffect(() => {
    for (const [index, member] of [me, partner].entries()) {
      if (!member) continue;
      const key = `ironpact.today-plates.${me.id}.${member.id}.${member.weekStart}`;
      let before = previous.current.get(key);
      try {
        const saved = localStorage.getItem(key);
        if (before === undefined && saved !== null && Number.isFinite(Number(saved))) before = Number(saved);
        localStorage.setItem(key, String(member.credits));
      } catch { /* Private tabs can still load and animate during this visit. */ }
      previous.current.set(key, member.credits);
      if (still) {
        root.current?.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
        continue;
      }
      if (before === undefined || member.credits <= before) continue;
      let loaded = 0;
      const plates = root.current?.querySelectorAll<SVGRectElement>(`[data-side="${index === 0 ? 'you' : 'partner'}"] [data-plate]`);
      for (const plate of plates ?? []) {
        if (plate.dataset.plate === 'empty') continue;
        loaded += plate.dataset.plate === 'min' ? 0.5 : 1;
        if (loaded <= before || !plate.animate) continue;
        plate.animate([
          { translate: `${index === 0 ? -24 : 24}px 0`, opacity: 0 },
          { translate: '0 0', opacity: 1 },
        ], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      }
    }
    // These finite animations belong to the SVG nodes; removing the nodes ends them.
  }, [me, partner, still]);

  return <div ref={root}>
    <PlateBar members={[me, partner ?? { credits: 0, target: me.target }]} />
  </div>;
}
