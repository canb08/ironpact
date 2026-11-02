import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { screenMaySleep, subscribeScreenMaySleep } from '../../platform/wakeLock.ts';
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

/** One readout, kept in the dock; expanding changes its size rather than duplicating it. */
export function RestTimerOverlay({ reduceMotion, onSkipHold }: { part?: RestTimerPart; reduceMotion?: boolean; onSkipHold?: () => void }) {
  const { state, adjust, skip } = useRestTimer();
  const asleep = useSyncExternalStore(subscribeScreenMaySleep, screenMaySleep, () => false);
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const pulsedFor = useRef<number | null>(null);
  const reduce = reduceMotion ?? (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (reduce || state.phase !== 'over' || state.overSeconds > 0 || state.endsAt === null || pulsedFor.current === state.endsAt) return;
    pulsedFor.current = state.endsAt;
    setPulse(true);
  }, [reduce, state.phase, state.overSeconds, state.endsAt]);
  useEffect(() => {
    if (!pulse) return;
    const id = window.setTimeout(() => setPulse(false), 300);
    return () => window.clearTimeout(id);
  }, [pulse]);

  if (state.phase === 'idle' && !asleep) return null;
  return <section className={`rest-timer${expanded ? ' rest-timer--expanded' : ''}`} aria-label={copy.restTimerLabel}>
    {state.phase !== 'idle' && <>
      <div className="rest-timer__bar">
        <Button className="rest-timer__readout" variant="ghost" aria-label={fill(copy.x4TimerAction, { time: state.label, action: expanded ? copy.x4TimerCollapse : copy.x4TimerExpand })}
          aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <span className="rest-timer__chip">{state.label}</span>
        </Button>
        <div className="rest-timer__controls">
          <Button variant="ghost" onClick={() => adjust(-15)}>{copy.restMinus15}</Button>
          <Button variant="ghost" onClick={() => adjust(15)}>{copy.restPlus15}</Button>
          <SkipButton onSkip={skip} onSkipHold={onSkipHold} />
        </div>
      </div>
      {state.showLoaded && <p className="rest-timer__loaded">{copy.restComplete}</p>}
      <div className="rest-timer__live" role="status" aria-live="polite">{state.live}</div>
      {pulse && !reduce && <div className="rest-timer__pulse" data-testid="rest-pulse" aria-hidden="true" />}
    </>}
    {asleep && <p className="rest-timer__sleep">{copy.screenMaySleep}</p>}
  </section>;
}
