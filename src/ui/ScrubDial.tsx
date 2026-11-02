import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { feel } from './feel/feel';
import './scrubdial.css';

const PX_PER_STEP = 18;
const TAP_SLOP_PX = 8;
const MAX_TICKS = 12;

export type ScrubDialProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (value: number) => string;
  disabled?: boolean;
  /** Keyboard fallback. Fires on a tap that did not cross a detent. */
  onTapNumber?: () => void;
  ariaValueText?: string;
  /** Vertical picker: neighbours, a ruler, and a 56px numeral. Default stays a single numeral. */
  wheel?: boolean;
};

type Gesture = {
  pointerId: number;
  originY: number;
  lastY: number;
  lastT: number;
  carry: number;
};

function places(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function roundToStep(value: number, step: number): number {
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(places(step)));
}

function keySteps(key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return 1;
    case 'ArrowDown':
    case 'ArrowLeft':
      return -1;
    case 'PageUp':
      return 10;
    case 'PageDown':
      return -10;
    case 'Home':
      return -1_000_000;
    case 'End':
      return 1_000_000;
    default:
      return null;
  }
}

function flickScale(pxPerMs: number): number {
  const speed = Math.abs(pxPerMs);
  if (speed < 0.5) return 1;
  if (speed < 1.2) return 2;
  return 4;
}

/**
 * Vertical-drag numeral. One detent per `step`. A fast flick crosses more
 * detents. Arrow keys and PageUp / PageDown move the same steps. No layout animation.
 */
export function ScrubDial({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  format,
  disabled = false,
  onTapNumber,
  ariaValueText,
  wheel = false,
}: ScrubDialProps) {
  const labelId = useId();
  const valueRef = useRef(value);
  const gesture = useRef<Gesture | null>(null);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  if (!Number.isFinite(step) || step <= 0 || min > max) throw new Error('Invalid scrub range');

  const shown = format ? format(value) : String(roundToStep(value, step));
  const valueText = ariaValueText ?? (unit ? `${shown} ${unit}` : shown);
  const neighbour = (steps: number): string => {
    const next = roundToStep(value + steps * step, step);
    if (next < min || next > max || next === value) return '';
    return format ? format(next) : String(next);
  };
  const above = wheel ? neighbour(-1) : '';
  const below = wheel ? neighbour(1) : '';
  const unitBeside = wheel && !!unit && unit.length <= 4;

  const commit = (steps: number) => {
    if (disabled || steps === 0) return;
    const current = valueRef.current;
    const next = Math.min(max, Math.max(min, roundToStep(current + steps * step, step)));
    if (next === current) return;
    valueRef.current = next;
    onChange(next);
    const detents = Math.min(MAX_TICKS, Math.max(1, Math.round(Math.abs(next - current) / step)));
    for (let i = 0; i < detents; i += 1) feel('tick');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps = keySteps(event.key);
    if (steps === null) return;
    event.preventDefault();
    commit(steps);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      originY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      carry: 0,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || disabled) return;
    const dy = current.lastY - event.clientY;
    const now = performance.now();
    const dt = Math.max(now - current.lastT, 1);
    current.carry += dy * flickScale(dy / dt);
    current.lastY = event.clientY;
    current.lastT = now;
    const steps = Math.trunc(current.carry / PX_PER_STEP);
    if (steps === 0) return;
    current.carry -= steps * PX_PER_STEP;
    commit(steps);
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>, tap: boolean) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = Math.abs(event.clientY - current.originY);
    gesture.current = null;
    if (tap && moved < TAP_SLOP_PX) onTapNumber?.();
  };

  return (
    <div className={wheel ? 'ui-scrub ui-scrub--wheel' : 'ui-scrub'}>
      <span className="ui-scrub__label" id={labelId}>{label}</span>
      <div
        className="ui-scrub__control"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-labelledby={labelId}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={valueText}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endGesture(event, true)}
        onPointerCancel={(event) => endGesture(event, false)}
      >
        {wheel ? (
          <>
            <span className="ui-scrub__stack">
              <span className="ui-scrub__neighbor" aria-hidden="true">{above || '\u00a0'}</span>
              <span className="ui-scrub__figure">
                <span className="ui-scrub__center">
                  <span className="ui-scrub__value">{shown}</span>
                  {unitBeside && unit ? <span className="ui-scrub__unit">{unit}</span> : null}
                </span>
                {unit && !unitBeside ? <span className="ui-scrub__unit">{unit}</span> : null}
              </span>
              <span className="ui-scrub__neighbor" aria-hidden="true">{below || '\u00a0'}</span>
            </span>
            <span className="ui-scrub__rail" aria-hidden="true">
              {Array.from({ length: 15 }, (_, index) => (
                <span key={index} className={index === 7 ? 'ui-scrub__tick is-center' : 'ui-scrub__tick'} />
              ))}
            </span>
          </>
        ) : (
          <>
            <span className="ui-scrub__value">{shown}</span>
            {unit ? <span className="ui-scrub__unit">{unit}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
