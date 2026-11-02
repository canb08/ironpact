import { useRef } from 'react';

export interface SegmentOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  label: string;
  value: string;
  options: readonly SegmentOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** A single tab stop; arrows wrap past disabled choices, Home/End jump to the ends. */
export function SegmentedControl({ label, value, options, onChange, disabled = false }: SegmentedControlProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((option, index) => ({ ...option, index })).filter((option) => !option.disabled);
  const entry = enabled.find((option) => option.value === value) ?? enabled[0];
  return <div className="ui-segmented" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
    {options.map((option, index) => <button
      key={option.value}
      ref={(element) => { buttons.current[index] = element; }}
      type="button"
      role="radio"
      aria-checked={option.value === value}
      disabled={disabled || option.disabled}
      tabIndex={!disabled && entry?.index === index ? 0 : -1}
      onClick={() => onChange(option.value)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (disabled || enabled.length === 0) return;
        const current = enabled.findIndex((item) => item.index === index);
        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
          : (current + direction + enabled.length) % enabled.length;
        const target = enabled[next];
        if (target) {
          onChange(target.value);
          buttons.current[target.index]?.focus();
        }
      }}
    >{option.label}</button>)}
  </div>;
}
