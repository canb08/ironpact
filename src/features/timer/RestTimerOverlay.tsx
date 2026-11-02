import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { screenMaySleep, subscribeScreenMaySleep } from '../../platform/wakeLock.ts';
import { BigNumber, Button, Chip, copy } from '../../ui/index.ts';
import { useRestTimer } from './useRestTimer.ts';
import './restTimer.css';

export type RestTimerPart = 'all' | 'readout' | 'controls';

function reducedMotionQuery(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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

/**
 * Plain S8. P2D mounts this on the session screen.
 * `part="readout"` is the top zone (chip, digits, pulse, live region, sleep chip).
 * `part="controls"` is the −15 / +15 / Skip row above LOG SET (E7.1).
 */
export function RestTimerOverlay({
  part = 'all',
  reduceMotion,
  onSkipHold,
}: {
  part?: RestTimerPart;
  reduceMotion?: boolean;
  onSkipHold?: () => void;
}) {
  const { state, adjust, skip } = useRestTimer();
  const asleep = useSyncExternalStore(subscribeScreenMaySleep, screenMaySleep, () => false);
  const reduce = reduceMotion ?? reducedMotionQuery();
  const [pulse, setPulse] = useState(false);
  const pulsedFor = useRef<number | null>(null);
  const showReadout = part !== 'controls';

  useEffect(() => {
    if (!showReadout || reduce) return;
    if (state.phase !== 'over' || state.overSeconds > 0 || state.endsAt === null) return;
    if (pulsedFor.current === state.endsAt) return;
    pulsedFor.current = state.endsAt;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 300);
    return () => window.clearTimeout(id);
  }, [showReadout, reduce, state.phase, state.overSeconds, state.endsAt]);

  const showControls = part !== 'readout' && state.phase !== 'idle';
  if (state.phase === 'idle' && !asleep) return null;
  if (part === 'controls' && !showControls) return null;

  return (
    <section className="rest-timer" aria-label={copy.restTimerLabel}>
      {showReadout && state.phase !== 'idle' && (
        <Chip className="rest-timer__chip">{state.label}</Chip>
      )}
      {showReadout && state.phase === 'running' && (
        <BigNumber size="mega" value={state.label} aria-hidden="true" />
      )}
      {showReadout && state.showLoaded && <p className="rest-timer__loaded">{copy.restComplete}</p>}
      {showReadout && asleep && <Chip>{copy.screenMaySleep}</Chip>}
      {showReadout && (
        <div className="rest-timer__live" role="status" aria-live="polite">{state.live}</div>
      )}
      {showReadout && pulse && <div className="rest-timer__pulse" data-testid="rest-pulse" aria-hidden="true" />}
      {showControls && (
        <div className="rest-timer__controls">
          <Button size="xl" variant="secondary" onClick={() => adjust(-15)}>{copy.restMinus15}</Button>
          <Button size="xl" variant="secondary" onClick={() => adjust(15)}>{copy.restPlus15}</Button>
          <SkipButton onSkip={skip} onSkipHold={onSkipHold} />
        </div>
      )}
    </section>
  );
}
