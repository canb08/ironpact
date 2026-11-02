import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Readiness, Session } from '../../core/types.ts';
import { Button, copy, fill } from '../../ui';
import { prEyebrow } from '../prs/label.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';
import { formatSessionClock, sessionSeconds, workingKg } from './sessionModel.ts';

export function SessionSummary({ session, onDone }: { session: Session; onDone: () => void }) {
  const repo = useRepo();
  const write = useSessionWrite();
  const [note, setNote] = useState(session.note ?? '');
  const [readiness, setReadiness] = useState<Partial<Readiness>>(session.readiness ?? {});
  const data = useLiveQuery(async () => {
    const [sets, exercises, prs, day] = await Promise.all([
      repo.q.setsOfSession(session.id),
      repo.q.exercises(),
      repo.q.prEvents({ sessionId: session.id }),
      repo.q.entriesBetween(session.user_id, session.local_date, session.local_date),
    ]);
    const weigh = day.bodyweight.filter((row) => row.weight_kg > 0)
      .sort((a, b) => b.measured_at.localeCompare(a.measured_at) || b.id.localeCompare(a.id))[0];
    return { sets, exercises, prs, bodyweight: weigh?.weight_kg ?? null };
  }, [repo, session.id, session.user_id, session.local_date]);

  if (!data) return <section className="session-summary" aria-label={copy.summaryTitle}><p role="status">{copy.sessionLoading}</p></section>;
  const working = data.sets.filter((set) => !set.is_warmup);
  const kg = workingKg(data.sets, data.exercises, data.bodyweight);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  return <section className="session-summary" aria-label={copy.summaryTitle}>
    <h2>{copy.x4Summary}</h2>
    {working.length === 0 ? <p>{copy.summaryDropped}</p> : <>
      <dl>
        <dt>{copy.summaryDuration}</dt>
        <dd>{formatSessionClock(sessionSeconds(session.started_at, session.ended_at))}</dd>
        <dt>{copy.x4Volume}</dt>
        <dd>{fill(copy.x4KgMoved, { kg })}</dd>
        <dt>{copy.summarySets}</dt>
        <dd>{working.length}</dd>
      </dl>
      <ul className="session-summary-exercises">{[...new Set(data.sets.map((row) => row.exercise_id))].map((exerciseId) => {
        const sets = data.sets.filter((row) => row.exercise_id === exerciseId);
        const work = sets.filter((row) => !row.is_warmup);
        const best = [...work].sort((a, b) => b.weight_kg * (1 + b.reps / 30) - a.weight_kg * (1 + a.reps / 30))[0];
        const prs = data.prs.filter((event) => event.exercise_id === exerciseId);
        return <li key={exerciseId}>
          <h3>{data.exercises.find((row) => row.id === exerciseId)?.name}</h3>
          <p>{sets.length === 1 ? copy.x4SetOne : fill(copy.x4SetCount, { count: sets.length })}</p>
          {best && <p>{fill(copy.x4Best, { kg: best.weight_kg, reps: best.reps })}</p>}
          {prs.map((event) => <p className="session-pr" key={event.id}>{prEyebrow(event)}</p>)}
        </li>;
      })}</ul>
      <label htmlFor="session-note">{copy.x4Note}</label>
      <textarea id="session-note" className="session-note" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
    </>}
    <details className="session-readiness">
      <summary>{copy.x4Readiness} <span>{copy.x4Optional}</span></summary>
      {(['sleep', 'soreness', 'energy'] as const).map((key) => <label key={key}>
        {{ sleep: copy.readinessSleep, soreness: copy.readinessSoreness, energy: copy.readinessEnergy }[key]}
        <select value={readiness[key] ?? ''} onChange={(event) => setReadiness({ ...readiness, [key]: event.target.value === '' ? undefined : Number(event.target.value) as 1 | 2 | 3 })}>
          <option value="">{copy.x4Optional}</option>
          {[copy.readinessLow, copy.readinessMid, copy.readinessHigh].map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
        </select>
      </label>)}
    </details>
    {offline && <p>{copy.summarySaved}</p>}
    <WriteFeedback error={write.error} retry={write.retry} />
    <Button size="xl" disabled={write.busy} onClick={() => {
      const next = note.trim();
      const complete = readiness.sleep && readiness.soreness && readiness.energy
        ? { sleep: readiness.sleep, soreness: readiness.soreness, energy: readiness.energy } : null;
      if (working.length === 0 || (next === (session.note ?? '') && complete === null)) { onDone(); return; }
      void write.run(() => repo.w.updateSession(session.id, { note: next, ...(complete ? { readiness: complete } : {}) }), onDone);
    }}>{copy.summaryDone}</Button>
  </section>;
}
