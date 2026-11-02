import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Session } from '../../core/types.ts';
import { Button, copy, fill } from '../../ui';
import { prEyebrow } from '../prs/label.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';
import { formatSessionClock, sessionSeconds, workingTonnes } from './sessionModel.ts';

export function SessionSummary({ session, onDone }: { session: Session; onDone: () => void }) {
  const repo = useRepo();
  const write = useSessionWrite();
  const [note, setNote] = useState(session.note ?? '');
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
  const shown = data.prs.slice(0, 3);
  const extra = data.prs.length - shown.length;
  const tonnes = workingTonnes(data.sets, data.exercises, data.bodyweight);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  return <section className="session-summary" aria-label={copy.summaryTitle}>
    {working.length === 0 ? <p>{copy.summaryDropped}</p> : <>
      <dl>
        <dt>{copy.summaryDuration}</dt>
        <dd>{formatSessionClock(sessionSeconds(session.started_at, session.ended_at))}</dd>
        <dt>{copy.summaryTonnes}</dt>
        <dd>{tonnes.toFixed(1)}</dd>
        <dt>{copy.summarySets}</dt>
        <dd>{working.length}</dd>
      </dl>
      {data.prs.length > 0 && <div>
        <h2>{copy.summaryPrs}</h2>
        <ul>{shown.map((event) => <li key={event.id}>{prEyebrow(event)}</li>)}</ul>
        {extra > 0 && <p>{fill(copy.summaryMore, { count: extra })}</p>}
      </div>}
      <label htmlFor="session-note">{copy.note}</label>
      <textarea id="session-note" className="session-note" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
    </>}
    {offline && <p>{copy.summarySaved}</p>}
    <WriteFeedback error={write.error} retry={write.retry} />
    <Button size="xl" disabled={write.busy} onClick={() => {
      const next = note.trim();
      if (working.length === 0 || next === (session.note ?? '')) { onDone(); return; }
      void write.run(() => repo.w.updateSession(session.id, { note: next }), onDone);
    }}>{copy.summaryDone}</Button>
  </section>;
}
