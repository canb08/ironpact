import { useId } from 'react';
import { Button } from './Button';
import { copy, fill } from './copy';

export interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  unit?: string;
}

export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  disabled = false,
  unit,
}: StepperProps) {
  const id = useId();
  if (!Number.isFinite(step) || step <= 0 || min > max) throw new Error('Invalid stepper range');
  const change = (direction: number) => {
    // Round away floating point noise from decimal increments.
    const next = Math.min(max, Math.max(min, Number((value + direction * step).toPrecision(12))));
    if (!disabled && next !== value) onChange(next);
  };
  return (
    <div className="ui-stepper">
      <div className="ui-stepper__heading">
        <label id={`${id}-label`} htmlFor={id}>{label}</label>
        <span id={`${id}-step`} className="ui-stepper__step">
          {fill(copy.x1Step, { step })}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="ui-stepper__controls">
        <Button
          size="xl"
          variant="secondary"
          aria-label={fill(copy.decrease, { label })}
          disabled={disabled || value <= min}
          onClick={() => change(-1)}
        >
          −
        </Button>
        <input
          id={id}
          aria-describedby={`${id}-step`}
          type="number"
          inputMode="decimal"
          value={value}
          step={step}
          min={Number.isFinite(min) ? min : undefined}
          max={Number.isFinite(max) ? max : undefined}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (!disabled && Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          onKeyDown={(event) => {
            if (['+', '=', 'ArrowUp', '-', 'ArrowDown'].includes(event.key)) {
              event.preventDefault();
              change(['-', 'ArrowDown'].includes(event.key) ? -1 : 1);
            }
          }}
        />
        <Button
          size="xl"
          variant="secondary"
          aria-label={fill(copy.increase, { label })}
          disabled={disabled || value >= max}
          onClick={() => change(1)}
        >
          +
        </Button>
      </div>
    </div>
  );
}
