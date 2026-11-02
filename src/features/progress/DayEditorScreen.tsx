import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import { localDateSchema } from '../../core/validate.ts';
import type { DayEntries, EditNotice } from '../../data/adapter.ts';
import { Button, copy } from '../../ui';
import { windowDates } from './dates.ts';
import { GymSession, MartialSession, MinSession, RunSession, WeightCard, type TrashItem } from './editors.tsx';
import { writeErrorCopy } from './form.ts';
import { EditNotices } from './notices.tsx';
import { mergeNotice, shownNotice } from './notices.ts';
import './progress.css';

const EMPTY: DayEntries = { sessions: [], sets: [], cardio: [], martial: [], min: [], bodyweight: [] };

function dotsFor(day: string, span: DayEntries): Array<'gym' | 'run' | 'martial' | 'min' | 'weight'> {
  const dots: Array<'gym' | 'run' | 'martial' | 'min' | 'weight'> = [];
  if (span.sets.some((row) => row.local_date === day) || span.sessions.some((row) => row.local_date === day && row.kind === 'gym')) dots.push('gym');
  if (span.cardio.some((row) => row.local_date === day)) dots.push('run');
  if (span.martial.some((row) => row.local_date === day)) dots.push('martial');
  if (span.min.some((row) => row.local_date === day)) dots.push('min');
  if (span.bodyweight.some((row) => row.local_date === day)) dots.push('weight');
  return dots;
}

export default function DayEditorScreen() {
  const repo = useRepo();
  const navigate = useNavigate();
  const { date = '' } = useParams();
  const valid = localDateSchema.safeParse(date).success;
  const [revision, setRevision] = useState(0);
  const [undo, setUndo] = useState<TrashItem[] | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const days = valid ? windowDates(date) : [];
  const from = days[0] ?? date;
  const to = days[days.length - 1] ?? date;
  const data = useLiveQuery(async () => {
    if (!valid) return null;
    const userId = repo.auth.userId();
    const [day, span, exercises] = await Promise.all([
      repo.q.day(date),
      userId ? repo.q.entriesBetween(userId, from, to) : Promise.resolve(EMPTY),
      repo.q.exercises(),
    ]);
    return { day, span, exercises };
  }, [repo, date, valid, from, to, revision]);

  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  if (!valid) {
    return <main className="progress"><h1>{copy.badDate}</h1></main>;
  }

  function refresh() {
    setRevision((value) => value + 1);
  }

  function moved(next: string) {
    refresh();
    void navigate(`/day/${next}`);
  }

  function publish(next: EditNotice) {
    setNotice(shownNotice(next));
  }

  async function trash(items: TrashItem[]) {
    setTrashError(null);
    const done: TrashItem[] = [];
    let folded: EditNotice = { prsChanged: false, barAdjusted: false };
    for (const item of items) {
      const result = await repo.w.softDelete(item.table, item.id);
      if (!result.ok) {
        setTrashError(writeErrorCopy(result.error));
        setUndo(done.length > 0 ? done : null);
        setNotice(shownNotice(folded));
        refresh();
        return;
      }
      folded = mergeNotice(folded, result.notice);
      done.push(item);
    }
    setNotice(shownNotice(folded));
    setUndo(done);
    refresh();
  }

  async function restore() {
    const items = undo;
    if (!items) return;
    setUndo(null);
    let folded: EditNotice = { prsChanged: false, barAdjusted: false };
    for (const item of [...items].reverse()) {
      const result = await repo.w.restore(item.table, item.id);
      if (!result.ok) {
        setTrashError(writeErrorCopy(result.error));
        setNotice(shownNotice(folded));
        refresh();
        return;
      }
      folded = mergeNotice(folded, result.notice);
    }
    setNotice(shownNotice(folded));
    refresh();
  }

  const day = data?.day ?? EMPTY;
  const span = data?.span ?? EMPTY;
  const exercises = data?.exercises ?? [];
  const hasEntries = day.sets.length + day.cardio.length + day.martial.length + day.min.length + day.bodyweight.length > 0;

  return (
    <main className="progress">
      <h1>{date}</h1>
      <EditNotices notice={notice} />
      <nav className="progress-days" aria-label={copy.recentDays}>
        {days.map((dayKey) => {
          const dots = dotsFor(dayKey, span);
          const mark = <DayDots dots={dots} />;
          if (dayKey === date) {
            return (
              <span key={dayKey} className="progress-day is-current" aria-current="date">
                <span className="progress-sr">{dayKey}</span>
                <span aria-hidden="true">{dayKey.slice(-2)}</span>
                {mark}
              </span>
            );
          }
          return (
            <Link key={dayKey} className="progress-day" to={`/day/${dayKey}`} aria-label={dayKey}>
              <span aria-hidden="true">{dayKey.slice(-2)}</span>
              {mark}
            </Link>
          );
        })}
      </nav>
      {data === undefined ? <p>{copy.loading}</p> : null}
      {day.sessions.map((session) => {
        const sets = day.sets.filter((row) => row.session_id === session.id);
        const cardio = day.cardio.filter((row) => row.session_id === session.id);
        const martial = day.martial.filter((row) => row.session_id === session.id);
        const min = day.min.filter((row) => row.session_id === session.id);
        const stamp = `${session.client_updated_at}:${sets.map((row) => row.client_updated_at).join()}`;
        if (session.kind === 'run' && cardio.length > 0) {
          return <RunSession key={stamp} session={session} rows={cardio} routeDate={date} onMoved={moved} onRefresh={refresh} onTrash={(items) => { void trash(items); }} onNotice={publish} />;
        }
        if (session.kind === 'martial' && martial.length > 0) {
          return <MartialSession key={stamp} session={session} rows={martial} routeDate={date} onMoved={moved} onRefresh={refresh} onTrash={(items) => { void trash(items); }} onNotice={publish} />;
        }
        if (session.kind === 'min' && min.length > 0) {
          return <MinSession key={stamp} session={session} rows={min} routeDate={date} onMoved={moved} onRefresh={refresh} onTrash={(items) => { void trash(items); }} onNotice={publish} />;
        }
        const label = session.kind === 'gym' ? copy.gym : session.kind === 'run' ? copy.run : session.kind === 'martial' ? copy.martialArts : copy.min;
        return (
          <GymSession
            key={stamp}
            label={label}
            session={session}
            sets={sets}
            exercises={exercises}
            routeDate={date}
            onMoved={moved}
            onRefresh={refresh}
            onTrash={(items) => { void trash(items); }}
            onNotice={publish}
          />
        );
      })}
      {day.bodyweight.map((row) => (
        <WeightCard key={`${row.id}:${row.client_updated_at}`} row={row} routeDate={date} onMoved={moved} onRefresh={refresh} onTrash={(items) => { void trash(items); }} onNotice={publish} />
      ))}
      {data !== undefined && !hasEntries && day.sessions.length === 0 ? <p>{copy.emptyDay}</p> : null}
      {trashError ? <p className="progress-error" role="alert">{trashError}</p> : null}
      {undo ? (
        <p className="progress-inline" role="status">
          {copy.undone}
          <Button onClick={() => { void restore(); }}>{copy.restore}</Button>
        </p>
      ) : null}
    </main>
  );
}

function DayDots({ dots }: { dots: Array<'gym' | 'run' | 'martial' | 'min' | 'weight'> }) {
  return (
    <span className="progress-dots" aria-hidden="true">
      {dots.map((dot) => <span key={dot} className={`progress-dot progress-dot--${dot}`} />)}
    </span>
  );
}
