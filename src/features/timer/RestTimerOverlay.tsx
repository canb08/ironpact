import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { screenMaySleep, subscribeScreenMaySleep } from '../../platform/wakeLock.ts';
import { Sheet } from '../../ui/Sheet.tsx';
import { MotionReducedContext, useMotionReduced } from '../../ui/motion/reduced-context.ts';
import { useReducedMotion } from '../../ui/motion/reduced.ts';
import { feel } from '../../ui/feel/feel.ts';
import { Button, copy, fill } from '../../ui/index.ts';
import { useRestTimer } from './useRestTimer.ts';
import './restTimer.css';

export type RestTimerPart = 'all' | 'readout' | 'controls';

function SkipButton({ onSkip, onSkipHold }: { onSkip: () => void; onSkipHold?: () => void }) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const pressed = useRef(false);
  const skipRef = useRef(onSkip);
  const holdRef = useRef(onSkipHold);
  useEffect(() => {
    skipRef.current = onSkip;
    holdRef.current = onSkipHold;
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!onSkipHold) {
    return <Button size="xl" onClick={onSkip}>{copy.skip}</Button>;
  }

  return (
    <Button
      size="xl"
      onPointerDown={() => {
        pressed.current = true;
        held.current = false;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          held.current = true;
          pressed.current = false;
          holdRef.current?.();
          skipRef.current();
        }, 600);
      }}
      onPointerUp={() => {
        window.clearTimeout(timer.current);
        if (!pressed.current || held.current) return;
        pressed.current = false;
        skipRef.current();
      }}
      onPointerLeave={() => {
        pressed.current = false;
        window.clearTimeout(timer.current);
      }}
      onPointerCancel={() => {
        pressed.current = false;
        window.clearTimeout(timer.current);
      }}
    >
      {copy.skip}
    </Button>
  );
}

interface NextSet {
  exercise: string;
  weightKg: number;
  reps: number;
  bodyweight?: boolean;
}

/** One timestamp-derived readout, presented in the dock or in the full-screen sheet. */
export function RestTimerOverlay({ reduceMotion, onSkipHold, nextSet }: {
  part?: RestTimerPart;
  reduceMotion?: boolean;
  onSkipHold?: () => void;
  nextSet?: NextSet;
}) {
  const { state, adjust, skip } = useRestTimer();
  const asleep = useSyncExternalStore(subscribeScreenMaySleep, screenMaySleep, () => false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);
  const pulsedFor = useRef<number | null>(null);
  const swipe = useRef<{ id: number; y: number; last: number } | null>(null);
  const swiped = useRef(false);
  const profileReduced = useMotionReduced();
  const reduce = useReducedMotion(reduceMotion || profileReduced);
  const open = expanded !== null && expanded === state.startedAt && state.phase !== 'idle';

  const expand = () => { feel('tick'); setExpanded(state.startedAt); };
  const close = () => { feel('tick'); setExpanded(null); };
  const shift = (seconds: 15 | -15) => { adjust(seconds); feel('tick'); };
  const skipWithFeel = () => { skip(); setExpanded(null); feel('tick'); };

  // The kernel earns the pulse at zero. Rendering never triggers another bell.
  useEffect(() => {
    if (reduce || !state.pulse || state.phase !== 'over' || state.overSeconds > 0 || state.startedAt === null || pulsedFor.current === state.startedAt) return;
    pulsedFor.current = state.startedAt;
    setPulse(true);
  }, [reduce, state.pulse, state.phase, state.overSeconds, state.startedAt]);
  useEffect(() => {
    if (!pulse) return;
    const id = window.setTimeout(() => setPulse(false), 300);
    return () => window.clearTimeout(id);
  }, [pulse]);

  const begin = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    if (!open) event.currentTarget.focus();
    swipe.current = { id: event.pointerId, y: event.clientY, last: event.clientY };
    swiped.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    if (swipe.current?.id === event.pointerId) swipe.current.last = event.clientY;
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const current = swipe.current;
    swipe.current = null;
    if (!current || current.id !== event.pointerId) return;
    const delta = current.last - current.y;
    if (!open && delta <= -40) { swiped.current = true; expand(); }
    else if (open && delta >= 80) close();
  };

  if (state.phase === 'idle' && !asleep) return null;
  const readout = <span className="rest-timer__chip">{state.label}</span>;
  const controls = <>
    <Button variant="ghost" onClick={() => shift(-15)}>{copy.restMinus15}</Button>
    <Button variant="ghost" onClick={() => shift(15)}>{copy.restPlus15}</Button>
  </>;
  return <section className={`rest-timer${reduce ? ' rest-timer--instant' : ''}`} aria-label={copy.restTimerLabel}>
    {state.phase !== 'idle' && <>
      <div className="rest-timer__progress" role="progressbar" aria-label={copy.y4RestProgress}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)}>
        <div style={{ transform: `scaleX(${state.progress})` }} />
      </div>
      <div className="rest-timer__bar">
        <Button className="rest-timer__readout" variant="ghost"
          aria-label={fill(copy.x4TimerAction, { time: state.label, action: copy.x4TimerExpand })}
          aria-expanded={open} aria-haspopup="dialog" onPointerDown={begin} onPointerMove={move} onPointerUp={end}
          onPointerCancel={() => { swipe.current = null; }} onLostPointerCapture={() => { swipe.current = null; }}
          onClick={() => { if (!swiped.current) expand(); swiped.current = false; }}>
          {!open && readout}<span className="rest-timer__expand">{copy.y4Expand}</span>
        </Button>
        <div className="rest-timer__controls">
          {controls}
          <SkipButton onSkip={skipWithFeel} onSkipHold={onSkipHold} />
        </div>
      </div>
      {state.phase === 'over' && <p className="rest-timer__next">{copy.y4NextSet}</p>}
      {state.showLoaded && <p className="rest-timer__loaded">{copy.restComplete}</p>}
      <div className="rest-timer__live" role="status" aria-live="polite">{state.live}</div>
      {pulse && !reduce && <div className="rest-timer__pulse" data-testid="rest-pulse" aria-hidden="true" />}
      <MotionReducedContext.Provider value={reduce}><Sheet open={open} onClose={close} title={copy.y4Rest}>
        <div className="rest-full">
          <div className="rest-full__readout" onPointerDown={begin} onPointerMove={move} onPointerUp={end}
            onPointerCancel={() => { swipe.current = null; }} onLostPointerCapture={() => { swipe.current = null; }}>{readout}</div>
          {state.phase === 'over' && <p className="rest-timer__next">{copy.y4NextSet}</p>}
          {nextSet && <div className="rest-full__ghost" aria-label={copy.y4NextSet}>
            <p>{copy.y4NextSet}</p><strong>{nextSet.exercise}</strong>
            <span>{fill(nextSet.bodyweight ? copy.y4GhostBodyweight : copy.y4GhostSet, { kg: nextSet.weightKg, reps: nextSet.reps })}</span>
          </div>}
          <div className="rest-full__targets">{controls}</div>
          <SkipButton onSkip={skipWithFeel} onSkipHold={onSkipHold} />
        </div>
      </Sheet></MotionReducedContext.Provider>
    </>}
    {asleep && <p className="rest-timer__sleep">{copy.screenMaySleep}</p>}
  </section>;
}
