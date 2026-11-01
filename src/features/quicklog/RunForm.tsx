import { useState, type FormEvent } from 'react';
import { cardioEntrySchema, uiSchemas } from '../../core/validate.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button, copy, fill } from '../../ui';
import { formatPace, parseDecimal, parseDuration } from './time.ts';

const RPE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export function RunForm() {
  const repo = useRepo();
  const [kmText, setKmText] = useState('');
  const [durationText, setDurationText] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const km = parseDecimal(kmText);
  const seconds = parseDuration(durationText);
  const distanceError = km !== null && uiSchemas.run_km.safeParse(km).success ? null : copy.outOfRange;
  const durationError = seconds !== null && uiSchemas.duration_s.safeParse(seconds).success ? null : copy.outOfRange;
  const noteSaved = note.trim();
  const noteOk = cardioEntrySchema.shape.note.safeParse(noteSaved === '' ? null : noteSaved).success;
  const pace = distanceError === null && durationError === null && km !== null && seconds !== null && km > 0
    ? formatPace(seconds, km)
    : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (distanceError || durationError || !noteOk || km === null || seconds === null) return;
    setSaving(true);
    try {
      const result = await repo.w.logRun({
        distance_m: Math.round(km * 1000),
        duration_s: seconds,
        rpe,
        note: noteSaved === '' ? null : noteSaved,
      });
      if (!result.ok) setServerError(result.error === 'storage_full' ? copy.storageFull : copy.outOfRange);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ql-form" onSubmit={(event) => { void onSubmit(event); }}>
      <div className="ql-field">
        <label htmlFor="run-km">{copy.distance}</label>
        <input id="run-km" inputMode="decimal" autoComplete="off" value={kmText} aria-invalid={attempted && distanceError !== null} onChange={(event) => setKmText(event.currentTarget.value)} />
        <span>{copy.km}</span>
        {attempted && distanceError ? <p className="ql-error" role="alert" data-testid="error-distance">{distanceError}</p> : null}
      </div>
      <div className="ql-field">
        <label htmlFor="run-duration">{copy.duration}</label>
        <input id="run-duration" inputMode="numeric" autoComplete="off" placeholder={copy.durationHint} value={durationText} aria-invalid={attempted && durationError !== null} onChange={(event) => setDurationText(event.currentTarget.value)} />
        {attempted && durationError ? <p className="ql-error" role="alert" data-testid="error-duration">{durationError}</p> : null}
      </div>
      {pace ? <p className="ql-pace" data-testid="pace">{fill(copy.paceLine, { time: pace })}</p> : null}
      <div>
        <p className="ql-unit" id="run-rpe">{copy.rpe}</p>
        <div className="ql-rpe" role="group" aria-labelledby="run-rpe">
          {RPE.map((value) => (
            <Button key={value} variant={rpe === value ? 'primary' : 'secondary'} aria-pressed={rpe === value} onClick={() => setRpe((current) => current === value ? null : value)}>
              {value}
            </Button>
          ))}
        </div>
      </div>
      <div className="ql-field">
        <label htmlFor="run-note">{copy.note}</label>
        <textarea id="run-note" value={note} aria-invalid={!noteOk} onChange={(event) => setNote(event.currentTarget.value)} />
        <p className={noteOk ? 'ql-count' : 'ql-error'}>{fill(copy.noteCount, { count: Array.from(noteSaved).length })}</p>
      </div>
      {serverError ? <p className="ql-error" role="alert">{serverError}</p> : null}
      <Button type="submit" size="xl" className="ql-save" disabled={saving}>{copy.save}</Button>
    </form>
  );
}
