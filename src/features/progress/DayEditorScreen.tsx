import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import { formatDate } from '../../core/formatDate.ts';
import { localDateOf, weekDates } from '../../core/weeks.ts';
import type { Exercise, Session, SetRow } from '../../core/types.ts';
import { localDateSchema } from '../../core/validate.ts';
import type { DayEntries, EditNotice } from '../../data/adapter.ts';
import { Button, HoldButton, Sheet, Stepper, copy, fill } from '../../ui';
import { shiftDate } from './dates.ts';
import { GymSession, MartialSession, MinSession, RunSession, WeightCard, type TrashItem } from './editors.tsx';
import { parseSet, writeErrorCopy, type SetDraft } from './form.ts';
import { NoteField, RpePicker, SaveRow } from './widgets.tsx';
import { EditNotices } from './notices.tsx';
import { mergeNotice, shownNotice } from './notices.ts';
import './progress.css';
import './DayEditorScreen.css';

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
  const mutating = useRef(false);
  const days = valid ? weekDates(date) : [];
  const swipeStart = useRef<number | null>(null);
  const from = days[0] ?? date;
  const to = days[days.length - 1] ?? date;
  const data = useLiveQuery(async () => {
    if (!valid) return null;
    const userId = repo.auth.userId();
    const [day, span, exercises, me] = await Promise.all([
      repo.q.day(date),
      userId ? repo.q.entriesBetween(userId, from, to) : Promise.resolve(EMPTY),
      repo.q.exercises(),
      repo.q.me(),
    ]);
    return { day, span, exercises, me };
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
    if (mutating.current) return;
    mutating.current = true;
    try {
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
    } finally {
      mutating.current = false;
    }
  }

  async function restore() {
    const items = undo;
    if (!items || mutating.current) return;
    mutating.current = true;
    try {
      setTrashError(null);
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
    } finally {
      mutating.current = false;
    }
  }

  const day = data?.day ?? EMPTY;
  const span = data?.span ?? EMPTY;
  const exercises = data?.exercises ?? [];
  const today = localDateOf(new Date().toISOString(), data?.me?.tz ?? 'Europe/Amsterdam');
  const hasEntries = day.sets.length + day.cardio.length + day.martial.length + day.min.length + day.bodyweight.length > 0;

  return (
    <main className="progress day-editor">
      <h1>{formatDate(date, today, copy)}</h1>
      <EditNotices notice={notice} />
      <nav className="day-week" aria-label={copy.x6Week}
        onTouchCancel={() => { swipeStart.current = null; }}
        onTouchStart={(event) => { swipeStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (start !== null && end !== undefined && Math.abs(end - start) > 50) moved(shiftDate(date, end < start ? 7 : -7));
        }}>
        <div className="day-week-heading">
          <Button variant="quiet" aria-label={copy.x6PreviousWeek} onClick={() => moved(shiftDate(date, -7))}>‹</Button>
          <span>{fill(copy.x5Range, { from: formatDate(from, today, copy), to: formatDate(to, today, copy) })}</span>
          <Button variant="quiet" aria-label={copy.x6NextWeek} onClick={() => moved(shiftDate(date, 7))}>›</Button>
        </div>
        <div className="day-week-chips">
          {days.map((dayKey, index) => (
            <Link key={dayKey} className={`day-chip${dayKey === date ? ' is-current' : ''}`}
              to={`/day/${dayKey}`} aria-current={dayKey === date ? 'date' : undefined}>
              <span>{[copy.x6Mon, copy.x6Tue, copy.x6Wed, copy.x6Thu, copy.x6Fri, copy.x6Sat, copy.x6Sun][index]}</span>{' '}
              <strong>{Number(dayKey.slice(-2))}</strong>{' '}
              <span className="progress-sr">{new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${dayKey}T00:00:00Z`))}</span>
              <DayDots dots={dotsFor(dayKey, span)} />
            </Link>
          ))}
        </div>
      </nav>
      {data === undefined ? <p>{copy.loading}</p> : null}
      {day.sessions.map((session) => (
        <Workout key={`${date}:${session.id}`} session={session} day={day} exercises={exercises}
          onMoved={moved} onRefresh={refresh} onTrash={(items) => { void trash(items); }} onNotice={publish} />
      ))}
      {day.bodyweight.map((row) => (
        <WeighIn key={`${date}:${row.id}`} row={row} onMoved={moved} onRefresh={refresh}
          onTrash={(items) => { void trash(items); }} onNotice={publish} />
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

interface EditActions {
  onMoved: (date: string) => void;
  onRefresh: () => void;
  onTrash: (items: TrashItem[]) => void;
  onNotice: (notice: EditNotice) => void;
}

function sessionType(session: Session): string {
  return session.kind === 'gym' ? copy.x6Workout : session.kind === 'run' ? copy.run : session.kind === 'martial' ? copy.x6Fight : copy.min;
}

function timeLabel(instant: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(instant));
}

function Workout({ session, day, exercises, ...actions }: EditActions & {
  session: Session;
  day: DayEntries;
  exercises: readonly Exercise[];
}) {
  const [editing, setEditing] = useState(false);
  const [selectedSet, setSelectedSet] = useState<SetRow | null>(null);
  const sets = day.sets.filter((row) => row.session_id === session.id);
  const cardio = day.cardio.filter((row) => row.session_id === session.id);
  const martial = day.martial.filter((row) => row.session_id === session.id);
  const min = day.min.filter((row) => row.session_id === session.id);
  const type = sessionType(session);
  const title = fill(copy.x6EditWorkout, { type: session.kind === 'min' ? type : type.toLowerCase() });
  const sheetActions = {
    ...actions,
    onRefresh: () => { setEditing(false); actions.onRefresh(); },
    onMoved: (date: string) => { setEditing(false); actions.onMoved(date); },
    onTrash: (items: TrashItem[]) => { setEditing(false); actions.onTrash(items); },
  };
  const items: TrashItem[] = [
    ...sets.map((row) => ({ table: 'sets' as const, id: row.id })),
    ...cardio.map((row) => ({ table: 'cardio_entries' as const, id: row.id })),
    ...martial.map((row) => ({ table: 'martial_entries' as const, id: row.id })),
    ...min.map((row) => ({ table: 'min_entries' as const, id: row.id })),
    { table: 'sessions', id: session.id },
  ];
  const groups = [...new Set(sets.map((row) => row.exercise_id))];
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedSet?.exercise_id);

  return (
    <section className="day-workout" aria-label={type}>
      <Button variant="secondary" className="day-session-header" aria-label={title} aria-haspopup="dialog"
        aria-describedby={`workout-time-${session.id}${session.note ? ` workout-note-${session.id}` : ''}`} onClick={() => setEditing(true)}>
        <span className="day-session-title">{type}<span aria-hidden="true">›</span></span>
        <span id={`workout-time-${session.id}`} className="day-session-time">{timeLabel(session.started_at)} – {session.ended_at ? timeLabel(session.ended_at) : copy.x6InProgress}</span>
        {session.note ? <span id={`workout-note-${session.id}`} className="day-session-note">{session.note}</span> : null}
        {cardio.map((row) => <span key={row.id}>{row.distance_m / 1000} {copy.km}</span>)}
        {martial.map((row) => <span key={row.id}>{row.discipline} {row.duration_min} {copy.x5MinutesUnit}</span>)}
        {min.map((row) => <span key={row.id}>{row.description}</span>)}
      </Button>
      {groups.map((exerciseId) => {
        const exercise = exercises.find((row) => row.id === exerciseId);
        return (
          <section key={exerciseId} className="day-exercise" aria-label={exercise?.name ?? copy.missingExercise}>
            <h2>{exercise?.name ?? copy.missingExercise}</h2>
            <ol>
              {sets.filter((row) => row.exercise_id === exerciseId).sort((a, b) => a.set_index - b.set_index).map((set) => (
                <li key={set.id}>
                  <Button variant="quiet" className="day-set-row" aria-haspopup="dialog"
                    aria-label={fill(copy.x6EditSet, { exercise: exercise?.name ?? copy.missingExercise, index: set.set_index })}
                    aria-describedby={`set-values-${set.id} set-meta-${set.id}`}
                    onClick={() => setSelectedSet(set)}>
                    <span className="day-set-index">{set.set_index}</span>
                    <span id={`set-values-${set.id}`} className="day-set-numbers">{fill(copy.x6SetRow, { reps: set.reps, kg: set.weight_kg })}</span>
                    <span id={`set-meta-${set.id}`} className="day-set-meta">{set.is_warmup ? copy.x6Warmup : set.rpe !== null ? fill(copy.x6Rpe, { rpe: set.rpe }) : null}</span>
                    <span aria-hidden="true">›</span>
                  </Button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      <HoldButton className="day-delete-workout" aria-label={copy.x6DeleteWorkout} holdMs={600} onHoldComplete={() => actions.onTrash(items)}>{copy.x6DeleteWorkout}</HoldButton>
      <Sheet open={editing} title={title} onClose={() => setEditing(false)}>
        <div className="progress day-sheet day-session-sheet">
          {session.kind === 'run' && cardio.length > 0 ? (
            <RunSession session={session} rows={cardio} routeDate={session.local_date} {...sheetActions} />
          ) : session.kind === 'martial' && martial.length > 0 ? (
            <MartialSession session={session} rows={martial} routeDate={session.local_date} {...sheetActions} />
          ) : session.kind === 'min' && min.length > 0 ? (
            <MinSession session={session} rows={min} routeDate={session.local_date} {...sheetActions} />
          ) : (
            <GymSession session={session} sets={[]} exercises={exercises} label={type} routeDate={session.local_date} {...sheetActions} />
          )}
        </div>
      </Sheet>
      <Sheet open={selectedSet !== null} title={fill(copy.x6EditSet, { exercise: selectedExercise?.name ?? copy.missingExercise, index: selectedSet?.set_index ?? 0 })} onClose={() => setSelectedSet(null)}>
        {selectedSet ? <SetSheet key={selectedSet.id} set={selectedSet} exercise={selectedExercise}
          onSaved={(notice) => { setSelectedSet(null); actions.onNotice(notice); actions.onRefresh(); }}
          onDelete={() => { setSelectedSet(null); actions.onTrash([{ table: 'sets', id: selectedSet.id }]); }} /> : null}
      </Sheet>
    </section>
  );
}

function SetSheet({ set, exercise, onSaved, onDelete }: {
  set: SetRow;
  exercise: Exercise | undefined;
  onSaved: (notice: EditNotice) => void;
  onDelete: () => void;
}) {
  const repo = useRepo();
  const rpeId = useId();
  const kind = exercise?.kind === 'bw_lift' ? 'bw_lift' : 'lift';
  const [draft, setDraft] = useState<SetDraft>({ kg: String(set.weight_kg), reps: String(set.reps), rpe: set.rpe, warmup: set.is_warmup, note: set.note ?? '' });
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseSet(draft, kind);

  async function save(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setError(null);
    if (!parsed.value || saving) return;
    setSaving(true);
    try {
      const result = await repo.w.updateSet(set.id, parsed.value);
      if (!result.ok) setError(writeErrorCopy(result.error));
      else onSaved(result.notice ?? { prsChanged: false, barAdjusted: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="progress day-sheet day-set-form" noValidate onSubmit={(event) => { void save(event); }}>
      <fieldset disabled={saving}>
        <Stepper label={kind === 'bw_lift' ? copy.sessionAddedKg : copy.kg} unit={copy.kg} value={Number(draft.kg)}
          step={2.5} min={kind === 'bw_lift' ? -100 : 0} max={kind === 'bw_lift' ? 200 : 500} onChange={(kg) => setDraft({ ...draft, kg: String(kg) })} />
        {attempted && parsed.errors.kg ? <p className="progress-error" role="alert" data-testid="error-kg">{parsed.errors.kg}</p> : null}
        <Stepper label={copy.reps} value={Number(draft.reps)} min={1} max={100} onChange={(reps) => setDraft({ ...draft, reps: String(reps) })} />
        {attempted && parsed.errors.reps ? <p className="progress-error" role="alert" data-testid="error-reps">{parsed.errors.reps}</p> : null}
        <RpePicker labelId={rpeId} value={draft.rpe} onChange={(rpe) => setDraft({ ...draft, rpe })} />
        <Button variant="secondary" aria-pressed={draft.warmup} onClick={() => setDraft({ ...draft, warmup: !draft.warmup })}>{copy.x6Warmup}</Button>
        <NoteField id={`set-note-${set.id}`} label={copy.note} value={draft.note} onChange={(note) => setDraft({ ...draft, note })} over={parsed.noteOver} show={attempted} max={120} />
        {error ? <p className="progress-error" role="alert">{error}</p> : null}
        <SaveRow saving={saving} />
        <Button variant="secondary" className="progress-danger" onClick={onDelete}>{copy.x6DeleteSet}</Button>
      </fieldset>
    </form>
  );
}

function WeighIn({ row, ...actions }: EditActions & { row: DayEntries['bodyweight'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className="day-session-header" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span>{copy.x6WeighIn}</span><span>{row.weight_kg} {copy.kg}</span>
      </Button>
      <Sheet open={open} title={copy.x6WeighIn} onClose={() => setOpen(false)}>
        <div className="progress day-sheet">
          <WeightCard row={row} routeDate={row.local_date} {...actions}
            onRefresh={() => { setOpen(false); actions.onRefresh(); }}
            onMoved={(date) => { setOpen(false); actions.onMoved(date); }}
            onTrash={(items) => { setOpen(false); actions.onTrash(items); }} />
        </div>
      </Sheet>
    </>
  );
}
