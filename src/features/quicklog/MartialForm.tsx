import { useState, type FormEvent } from 'react';
import { disciplineSchema, martialEntrySchema, uiSchemas } from '../../core/validate.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button, copy, fill } from '../../ui';
import { parseInteger } from './time.ts';

const PRESETS = [copy.bjj, copy.muayThai, copy.boxing, copy.kickboxing, copy.judo, copy.wrestling, copy.mma, copy.karate] as const;
const RPE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export function MartialForm() {
  const repo = useRepo();
  const [selected, setSelected] = useState<string>(copy.bjj);
  const [otherText, setOtherText] = useState('');
  const [minutesText, setMinutesText] = useState('');
  const [roundsText, setRoundsText] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const discipline = selected === copy.other ? otherText.trim() : selected;
  const minutes = parseInteger(minutesText);
  const rounds = roundsText.trim() === '' ? null : parseInteger(roundsText);
  const disciplineParsed = disciplineSchema.safeParse(discipline);
  const disciplineError = disciplineParsed.success
    ? null
    : Array.from(discipline).length < 1 || Array.from(discipline).length > 16
      ? copy.keepTo16
      : copy.outOfRange;
  const minutesError = minutes !== null && uiSchemas.duration_min.safeParse(minutes).success ? null : copy.outOfRange;
  const roundsError = rounds === null
    ? (roundsText.trim() === '' ? null : copy.outOfRange)
    : martialEntrySchema.shape.rounds.safeParse(rounds).success ? null : copy.outOfRange;
  const noteSaved = note.trim();
  const noteOk = martialEntrySchema.shape.note.safeParse(noteSaved === '' ? null : noteSaved).success;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (disciplineError || minutesError || roundsError || !noteOk || minutes === null) return;
    setSaving(true);
    try {
      const result = await repo.w.logMartial({
        discipline,
        duration_min: minutes,
        rounds,
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
      <div>
        <p className="ql-unit" id="discipline-label">{copy.discipline}</p>
        <div className="ql-chips" role="group" aria-labelledby="discipline-label">
          {PRESETS.map((name) => (
            <Button key={name} variant={selected === name ? 'primary' : 'secondary'} aria-pressed={selected === name} onClick={() => setSelected(name)}>
              {name}
            </Button>
          ))}
          <Button variant={selected === copy.other ? 'primary' : 'secondary'} aria-pressed={selected === copy.other} onClick={() => setSelected(copy.other)}>
            {copy.other}
          </Button>
        </div>
      </div>
      {selected === copy.other ? (
        <div className="ql-field">
          <label htmlFor="martial-other">{copy.other}</label>
          <input id="martial-other" autoComplete="off" value={otherText} aria-invalid={attempted && disciplineError !== null} onChange={(event) => setOtherText(event.currentTarget.value)} />
        </div>
      ) : null}
      {attempted && disciplineError ? <p className="ql-error" role="alert" data-testid="error-discipline">{disciplineError}</p> : null}
      <div className="ql-field">
        <label htmlFor="martial-minutes">{copy.minutes}</label>
        <input id="martial-minutes" inputMode="numeric" autoComplete="off" value={minutesText} aria-invalid={attempted && minutesError !== null} onChange={(event) => setMinutesText(event.currentTarget.value)} />
        {attempted && minutesError ? <p className="ql-error" role="alert" data-testid="error-minutes">{minutesError}</p> : null}
      </div>
      <div className="ql-field">
        <label htmlFor="martial-rounds">{copy.rounds}</label>
        <input id="martial-rounds" inputMode="numeric" autoComplete="off" value={roundsText} aria-invalid={attempted && roundsError !== null} onChange={(event) => setRoundsText(event.currentTarget.value)} />
        {attempted && roundsError ? <p className="ql-error" role="alert" data-testid="error-rounds">{roundsError}</p> : null}
      </div>
      <div>
        <p className="ql-unit" id="martial-rpe">{copy.rpe}</p>
        <div className="ql-rpe" role="group" aria-labelledby="martial-rpe">
          {RPE.map((value) => (
            <Button key={value} variant={rpe === value ? 'primary' : 'secondary'} aria-pressed={rpe === value} onClick={() => setRpe((current) => current === value ? null : value)}>
              {value}
            </Button>
          ))}
        </div>
      </div>
      <div className="ql-field">
        <label htmlFor="martial-note">{copy.note}</label>
        <textarea id="martial-note" value={note} aria-invalid={!noteOk} onChange={(event) => setNote(event.currentTarget.value)} />
        <p className={noteOk ? 'ql-count' : 'ql-error'}>{fill(copy.noteCount, { count: Array.from(noteSaved).length })}</p>
      </div>
      {serverError ? <p className="ql-error" role="alert">{serverError}</p> : null}
      <Button type="submit" size="xl" className="ql-save" disabled={saving}>{copy.save}</Button>
    </form>
  );
}
