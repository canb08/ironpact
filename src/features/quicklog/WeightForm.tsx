import { useState, type FormEvent } from 'react';
import { localDateOf } from '../../core/weeks.ts';
import { uiSchemas } from '../../core/validate.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button, copy, fill } from '../../ui';
import { useRepoQuery } from '../floor/useRepoQuery.ts';
import { parseDecimal } from './time.ts';

export function WeightForm() {
  const repo = useRepo();
  const [kgText, setKgText] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const today = useRepoQuery(async () => {
    const profile = await repo.q.me();
    if (!profile) return null;
    const date = localDateOf(new Date().toISOString(), profile.tz);
    const entries = await repo.q.entriesBetween(profile.id, date, date);
    return entries.bodyweight[0] ?? null;
  }, [repo, tick]);

  const kg = parseDecimal(kgText);
  const weightError = kg !== null && uiSchemas.bodyweight_kg.safeParse(kg).success ? null : copy.outOfRange;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (weightError || kg === null) return;
    setSaving(true);
    try {
      const result = await repo.w.logBodyweight(kg);
      if (!result.ok) {
        setServerError(result.error === 'storage_full' ? copy.storageFull : copy.outOfRange);
        return;
      }
      setTick((value) => value + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ql-form" onSubmit={(event) => { void onSubmit(event); }}>
      <div className="ql-field">
        <label htmlFor="bodyweight">{copy.weight}</label>
        <input id="bodyweight" inputMode="decimal" autoComplete="off" value={kgText} aria-invalid={attempted && weightError !== null} onChange={(event) => setKgText(event.currentTarget.value)} />
        <span>{copy.kg}</span>
        {today ? <p>{fill(copy.replacesToday, { kg: today.weight_kg.toFixed(1) })}</p> : null}
        {attempted && weightError ? <p className="ql-error" role="alert" data-testid="error-weight">{weightError}</p> : null}
      </div>
      {serverError ? <p className="ql-error" role="alert">{serverError}</p> : null}
      <Button type="submit" size="xl" className="ql-save" disabled={saving}>{copy.save}</Button>
    </form>
  );
}
