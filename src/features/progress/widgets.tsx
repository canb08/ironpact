import type { ReactNode } from 'react';
import { Button, copy } from '../../ui';
import { noteCountLabel } from './form.ts';

const RPE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export function Field({
  id, label, value, onChange, error, show, testId, inputMode, type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  show: boolean;
  testId: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  type?: 'text' | 'date';
}) {
  return (
    <div className="progress-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        aria-invalid={show && error !== null}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {show && error ? <p className="progress-error" role="alert" data-testid={testId}>{error}</p> : null}
    </div>
  );
}

export function RpePicker({ value, onChange, labelId }: { value: number | null; onChange: (value: number | null) => void; labelId: string }) {
  return (
    <div className="progress-field">
      <p id={labelId}>{copy.rpe}</p>
      <div className="progress-rpe" role="group" aria-labelledby={labelId}>
        {RPE.map((rpe) => (
          <Button key={rpe} variant={value === rpe ? 'primary' : 'secondary'} aria-pressed={value === rpe} onClick={() => onChange(value === rpe ? null : rpe)}>
            {rpe}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function NoteField({
  id, label, value, onChange, over, show, max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  over: boolean;
  show: boolean;
  max: 120 | 200;
}) {
  const count = Array.from(value.trim()).length;
  return (
    <div className="progress-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} aria-invalid={show && over} onChange={(event) => onChange(event.currentTarget.value)} />
      <p className={show && over ? 'progress-error' : 'progress-muted'}>{noteCountLabel(count, max)}</p>
    </div>
  );
}

export function SaveRow({ saving, children }: { saving: boolean; children?: ReactNode }) {
  return (
    <div className="progress-actions">
      <Button type="submit" size="xl" disabled={saving}>{copy.save}</Button>
      {children}
    </div>
  );
}
