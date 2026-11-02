import { useId } from 'react';
import { Stepper } from '../../ui/Stepper.tsx';
import { copy } from '../../ui/copy.ts';
import { BLUE_HUE, RED_HUE } from './hues.ts';

export function ProfileFields({ name, setName, hue, setHue, target, setTarget, disabled = false }: {
  name: string; setName: (name: string) => void;
  hue: number; setHue: (hue: number) => void;
  target: number; setTarget: (target: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return <fieldset className="onboarding-fields" disabled={disabled}>
    <label htmlFor={`${id}-name`}>{copy.x9Name}</label>
    <input id={`${id}-name`} value={name} autoComplete="nickname" aria-describedby={`${id}-hint ${id}-length`}
      aria-invalid={name.trim().length > 16} onChange={(event) => setName(event.target.value)} />
    <p id={`${id}-hint`} className="onboarding-hint">{copy.x9NameHint}</p>
    <p id={`${id}-length`} role="alert">{name.trim().length > 16 ? copy.nameLength : null}</p>
    <fieldset className="onboarding-colours">
      <legend>{copy.x9Colour}</legend>
      {[[RED_HUE, copy.x9Red], [BLUE_HUE, copy.x9Blue]].map(([value, label]) => <button key={value} type="button"
        aria-pressed={hue === value} className="onboarding-swatch" onClick={() => setHue(Number(value))}>
        <span aria-hidden="true" style={{ background: value === RED_HUE ? 'var(--plate-red)' : 'var(--plate-blue)' }} />
        {label}
        <span aria-hidden="true">{hue === value ? '✓' : ''}</span>
      </button>)}
    </fieldset>
    <Stepper label={copy.x9Target} value={target} min={1} max={7} step={1} onChange={(value) => setTarget(Math.round(value))} disabled={disabled} />
    <p className="onboarding-hint">{copy.x9TargetHint}</p>
  </fieldset>;
}
