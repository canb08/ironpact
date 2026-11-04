import { useState } from 'react';
import { ScrubDial } from '../../ui/ScrubDial.tsx';
import { Button, Sheet, copy } from '../../ui';

/** The keyboard is an explicit fallback; the default control is a thumb dial. */
export function DockDial({ label, value, step, min, max, disabled, onChange }: {
  label: string; value: number; step: number; min: number; max: number;
  disabled: boolean; onChange: (value: number) => void;
}) {
  const [typing, setTyping] = useState(false);
  return <div className="session-dial">
    <ScrubDial label={label} value={value} format={String} step={step} min={min} max={max}
      disabled={disabled} onChange={onChange} onTapNumber={() => setTyping(true)} />
    <button className="session-type" type="button" disabled={disabled} onClick={() => setTyping(true)}
      aria-label={`${copy.y3TypeValue}: ${label}`}>{copy.y3TypeValue}</button>
    <Sheet open={typing} title={`${copy.y3TypeValue}: ${label}`} onClose={() => setTyping(false)}>
      <div className="session-keyboard">
        <label>{label}<input type="number" inputMode="decimal" value={Number.isNaN(value) ? '' : value}
          step={step} onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))} /></label>
        <Button onClick={() => setTyping(false)}>{copy.y3UseValue}</Button>
      </div>
    </Sheet>
  </div>;
}
