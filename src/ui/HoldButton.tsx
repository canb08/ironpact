import { useCallback, useEffect, useRef } from 'react';
import { Button } from './Button';
import type { ButtonProps } from './Button';
import { copy } from './copy';

export type HoldButtonProps = Omit<
  ButtonProps,
  | 'onClick'
  | 'onPointerDown'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onPointerLeave'
  | 'onLostPointerCapture'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onBlur'
> & {
  holdMs?: number;
  onHoldComplete: () => void;
};

export function HoldButton({
  holdMs = 600,
  onHoldComplete,
  disabled,
  children,
  ...props
}: HoldButtonProps) {
  const progress = useRef<HTMLProgressElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const source = useRef<string | undefined>(undefined);
  const complete = useRef(onHoldComplete);
  useEffect(() => {
    complete.current = onHoldComplete;
  }, [onHoldComplete]);
  if (!Number.isFinite(holdMs) || holdMs <= 0) throw new Error('Invalid hold duration');

  const cancel = useCallback(() => {
    clearInterval(timer.current);
    timer.current = undefined;
    source.current = undefined;
    if (progress.current) progress.current.value = 0;
  }, []);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearInterval(timer.current);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [cancel]);
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  const start = (input: string) => {
    if (disabled || source.current) return;
    if (progress.current) progress.current.value = 0;
    source.current = input;
    const started = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Date.now() - started;
      if (progress.current) progress.current.value = Math.min(1, elapsed / holdMs);
      if (elapsed >= holdMs) {
        clearInterval(timer.current);
        timer.current = undefined;
        // Keep the source until release so key auto-repeat cannot fire twice.
        complete.current();
      }
    }, 10);
  };

  return (
    <Button
      {...props}
      disabled={disabled}
      className={`ui-hold ${props.className ?? ''}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        start(`pointer:${event.pointerId}`);
      }}
      onPointerUp={(event) => {
        if (source.current === `pointer:${event.pointerId}`) cancel();
      }}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          if (!event.repeat) start(event.key);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          if (source.current === event.key) cancel();
        }
      }}
      onBlur={cancel}
    >
      <span>{children}</span>
      <progress
        ref={progress}
        className="ui-hold__progress"
        aria-label={copy.holdProgress}
        max={1}
        value={0}
      />
    </Button>
  );
}
