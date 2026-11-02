import { Component, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import * as m from 'motion/react-m';
import type { PrEventDraft } from '../../core/prs.ts';
import { play } from '../../platform/audio.ts';
import { BigNumber, Button, copy, fill } from '../../ui';
import { AnimatedNumber } from '../../ui/motion/AnimatedNumber.tsx';
import { createFlashGuard } from '../../ui/motion/flash.ts';
import { useMotionReduced } from '../../ui/motion/reduced-context.ts';
import { useReducedMotion } from '../../ui/motion/reduced.ts';
import { SLAM } from '../../ui/motion/springs.ts';
import { firePrConfettiLazy, resetPrConfetti } from './confetti.ts';
import { formatPrKg, prEyebrow } from './label.ts';
import { prMomentGone, subscribePrGone } from './gone.ts';
import { PR_SEQUENCE_MS } from './sequence.ts';
import './takeover.css';

function weightUnit(event: PrEventDraft): string | undefined {
  return event.pr_type === 'distance' || event.pr_type === 'pace' ? undefined : 'KG';
}

function deltaLine(event: PrEventDraft): { text: string; kg: number } | null {
  if (event.previous_value == null) return null;
  const kg = event.value - event.previous_value;
  if (kg > 0.05) return { text: fill(copy.prDeltaKg, { kg: formatPrKg(kg) }), kg };
  if (event.pr_type === 'rep_max') return { text: copy.prDeltaRep, kg: 0 };
  return null;
}

class NumberFallback extends Component<{ children: ReactNode; fallback: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError(): { bad: boolean } {
    return { bad: true };
  }
  render(): ReactNode {
    return this.state.bad ? this.props.fallback : this.props.children;
  }
}

function Delta({ line }: { line: { text: string; kg: number } }) {
  if (line.kg <= 0.05) return <p>{line.text}</p>;
  const shown = Math.round(line.kg * 10) / 10;
  return (
    <p>
      <span className="pr-takeover__sr">{line.text}</span>
      <span aria-hidden="true">+<AnimatedNumber value={shown} /> KG</span>
    </p>
  );
}

/** Hides the queued view once the session card unmounts, without a queue dismiss API. */
export function PrMomentSlot({ id, event, onClose }: { id: string; event: PrEventDraft; onClose: () => void }) {
  const dead = useSyncExternalStore(subscribePrGone, () => prMomentGone(id), () => false);
  if (dead) return null;
  return <Takeover event={event} onClose={onClose} />;
}

/** Full-screen PR takeover (§3.9.4). Tap anywhere to skip to the final frame. */
export function Takeover({ event, onClose }: { event: PrEventDraft; onClose: () => void }) {
  const profileStill = useMotionReduced();
  const mediaStill = useReducedMotion(false);
  const still = profileStill || mediaStill;
  const [skipped, setSkipped] = useState(false);
  const [flash] = useState(() => createFlashGuard().allow());
  const played = useRef(false);
  const delta = deltaLine(event);
  const stamp = event.pr_type === 'rep_max' && event.reps === 5 ? copy.prStamp : copy.prNewStamp;
  const final = still || skipped;

  useEffect(() => {
    if (still || played.current) return undefined;
    if (skipped) {
      played.current = true;
      play('pr-riser');
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (played.current) return;
      played.current = true;
      play('pr-riser');
    }, PR_SEQUENCE_MS.final);
    return () => window.clearTimeout(timer);
  }, [still, skipped]);

  useEffect(() => {
    if (still || skipped) return undefined;
    const timer = window.setTimeout(() => {
      void firePrConfettiLazy();
    }, PR_SEQUENCE_MS.burst);
    return () => {
      window.clearTimeout(timer);
      resetPrConfetti();
    };
  }, [still, skipped]);

  if (still) return null;

  const stop = (domEvent: { stopPropagation(): void }) => {
    domEvent.stopPropagation();
  };

  return (
    <section
      className={final ? 'pr-takeover pr-takeover--final' : 'pr-takeover pr-takeover--play'}
      aria-label={copy.prCardLabel}
      data-motion="live"
      data-phase={final ? 'final' : 'play'}
      style={{ pointerEvents: 'auto' }}
      onPointerDown={() => setSkipped(true)}
    >
      {!final && flash && <div className="pr-takeover__flash" data-flash="impact" aria-hidden="true" />}
      <div className={final ? 'pr-takeover__stage' : 'pr-takeover__stage pr-takeover__stage--shake'}>
        <p className="pr-takeover__eyebrow">{prEyebrow(event)}</p>
        <p className="pr-takeover__stamp">{stamp}</p>
        <m.div
          className="pr-takeover__hero"
          initial={final ? false : { scale: 1.6 }}
          animate={{ scale: 1 }}
          transition={final ? { duration: 0 } : { type: SLAM.type, stiffness: SLAM.stiffness, damping: SLAM.damping }}
        >
          <BigNumber size="mega" value={formatPrKg(event.value)} unit={weightUnit(event)} />
        </m.div>
        {delta && (
          <NumberFallback fallback={<p>{delta.text}</p>}>
            <Suspense fallback={<p>{delta.text}</p>}>
              <Delta line={delta} />
            </Suspense>
          </NumberFallback>
        )}
        {event.pr_type === 'e1rm' && <p className="pr-takeover__e1rm">{fill(copy.prE1rmLine, { kg: formatPrKg(event.value) })}</p>}
        <p>{copy.prDetail}</p>
      </div>
      <div className="pr-takeover__actions">
        <Button size="xl" onPointerDown={stop} onClick={(domEvent) => { stop(domEvent); onClose(); }}>
          {copy.backToWork}
        </Button>
        <Button
          size="xl"
          variant="secondary"
          data-share="stub"
          onPointerDown={stop}
          onClick={(domEvent) => { stop(domEvent); }}
        >
          {copy.sharePr}
        </Button>
      </div>
    </section>
  );
}
