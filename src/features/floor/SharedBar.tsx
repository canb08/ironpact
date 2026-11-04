import { useEffect, useRef } from 'react';
import { PlateBar, useReducedMotion } from '../../ui';
import { feel } from '../../ui/feel/feel';
import { SPRING_EASE, SPRING_MS } from '../../ui/motion/springs';
import { weightDuration } from '../../ui/motion/weight';
import { rememberRingClose, ringCloseWasSeen } from '../duo/ringClose';
import type { MemberWeek } from '../duo/load.ts';

type BarMember = Pick<MemberWeek, 'id' | 'name' | 'credits' | 'target' | 'minCount' | 'weekStart'> & { weightKg?: number };

/** Storage remembers delivered drops, so interrupted partner sequences resume on open. */
export function SharedBar({ me, partner, reduced, current = true, crewId }: {
  me: BarMember; partner?: BarMember; reduced: boolean; current?: boolean; crewId?: string | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const still = useReducedMotion(reduced);
  const remembered = useRef(new Map<string, number>());
  useEffect(() => {
    const animations: Animation[] = [];
    const timers: number[] = [];
    const read = (key: string) => {
      try { const value = localStorage.getItem(key); if (value !== null && Number.isFinite(Number(value))) return Number(value); } catch { /* Memory works in private tabs. */ }
      return remembered.current.get(key);
    };
    const save = (key: string, value: number) => {
      remembered.current.set(key, value);
      try { localStorage.setItem(key, String(value)); } catch { /* Optional persistence. */ }
    };
    // Deferring the start lets StrictMode's probe cancel without consuming feedback.
    const start = () => {
      // Let the tab snapshot reveal the live bar before its earned motion starts.
      if (document.documentElement.dataset.tabTransition === 'on') {
        timers.push(window.setTimeout(start, 32));
        return;
      }
      let lastDrop = 0;
      for (const [side, member] of [me, partner].entries()) {
        if (!member) continue;
        const key = `ironpact.today-plates.${me.id}.${member.id}.${member.weekStart}`;
        const before = read(key);
        if (!current || before === undefined || member.credits <= before) {
          save(key, member.credits);
          continue;
        }
        let loaded = 0;
        let sequence = 0;
        const plates = root.current?.querySelectorAll<SVGRectElement>(`[data-side="${side === 0 ? 'you' : 'partner'}"] [data-plate]`);
        for (const plate of plates ?? []) {
          if (plate.dataset.plate === 'empty') continue;
          loaded += plate.dataset.plate === 'min' ? 0.5 : 1;
          if (loaded <= before) continue;
          const credits = loaded;
          const weight = plate.dataset.plate === 'min' ? 10 : member.weightKg ?? 20;
          const delay = still ? 0 : sequence++ * 180;
          const duration = weightDuration(weight);
          lastDrop = Math.max(lastDrop, still ? 0 : delay + duration);
          if (!still && plate.animate) animations.push(plate.animate([
            { translate: '0 -72px', opacity: 0 }, { translate: '0 0', opacity: 1 },
          ], { duration, delay, easing: SPRING_EASE.heavy, fill: 'backwards' }));
          const land = () => { feel('plate', { weightKg: weight, reducedMotion: still }); save(key, credits); };
          if (delay === 0) land();
          else timers.push(window.setTimeout(land, delay));
        }
      }
      const complete = partner && me.credits >= me.target && partner.credits >= partner.target;
      const key = `ironpact.lockout.${me.id}.${partner?.id}.${me.weekStart}`;
      if (!current || !complete || read(key) === 1 || crewId && ringCloseWasSeen(crewId, me.weekStart)) return;
      const lock = () => {
        save(key, 1);
        try { if (crewId) rememberRingClose(crewId, me.weekStart); } catch { /* Private tabs retain the in-memory lockout guard. */ }
        feel('lockout', { reducedMotion: still });
        if (still) return;
        for (const shaft of root.current?.querySelectorAll<SVGElement>('[data-shaft]') ?? []) {
          const bend = shaft.dataset.shaft === 'left' ? -3 : 3;
          shaft.style.transformOrigin = '171.5px 56px';
          if (shaft.animate) animations.push(shaft.animate([
            { transform: `rotate(${bend}deg)` }, { transform: 'rotate(0deg)' },
          ], { duration: SPRING_MS.slam, easing: SPRING_EASE.slam }));
        }
      };
      if (lastDrop === 0) lock();
      else timers.push(window.setTimeout(lock, lastDrop));
    };
    timers.push(window.setTimeout(start, 0));
    return () => { timers.forEach(window.clearTimeout); animations.forEach((animation) => animation.cancel()); };
  }, [me, partner, still, current, crewId]);

  return <div ref={root} data-week={me.weekStart} data-complete={!!partner && me.credits >= me.target && partner.credits >= partner.target}>
    <PlateBar members={[me, partner ?? { credits: 0, target: me.target }]} />
  </div>;
}
