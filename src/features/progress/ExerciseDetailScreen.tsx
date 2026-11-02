import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import { localDateOf } from '../../core/weeks.ts';
import type { BodyweightEntry, Exercise, Profile, Session, SetRow } from '../../core/types.ts';
import type { PrEvent, SessionWithSets, EditNotice } from '../../data/adapter.ts';
import { TrendChart } from '../stats/TrendChart.tsx';
import { bestE1rmPerSession, chartModel, trendWindow, type SessionBest } from '../stats/trend.ts';
import { BigNumber, Button, copy } from '../../ui';
import { bestE1rm, formatE1rm } from './e1rmView.ts';
import { parseRest, writeErrorCopy } from './form.ts';
import { HistorySet } from './historySet.tsx';
import { EditNotices } from './notices.tsx';
import { shownNotice } from './notices.ts';
import { formatKgCell, repMaxTable, type RepMaxRow } from './repMax.ts';
import { formatPrKg, prEyebrow } from '../prs/label.ts';
import { Field } from './widgets.tsx';
import './progress.css';

interface DetailData {
  exercise: Exercise | undefined;
  history: SessionWithSets[];
  prefRest: number | null;
  bigJumps: boolean;
  bodyweight: BodyweightEntry[];
  me: Profile | undefined;
  sessions: Session[];
  sets: SetRow[];
  prs: PrEvent[];
}

const EMPTY: DetailData = {
  exercise: undefined,
  history: [],
  prefRest: null,
  bigJumps: false,
  bodyweight: [],
  me: undefined,
  sessions: [],
  sets: [],
  prs: [],
};

function bodyweightOn(rows: readonly BodyweightEntry[], date: string): number | null {
  const prior = rows.filter((row) => row.local_date <= date).sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  return prior[0]?.weight_kg ?? null;
}

function sessionBest(exercise: Exercise, item: SessionWithSets, bodyweight: readonly BodyweightEntry[]): number | null {
  if (exercise.kind !== 'lift' && exercise.kind !== 'bw_lift') return null;
  const kg = exercise.kind === 'bw_lift' ? bodyweightOn(bodyweight, item.session.local_date) : null;
  return bestE1rm(item.sets, exercise.kind, kg);
}

export default function ExerciseDetailScreen() {
  const repo = useRepo();
  const { id } = useParams();
  const [revision, setRevision] = useState(0);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const data = useLiveQuery(async () => {
    if (!id) return EMPTY;
    const userId = repo.auth.userId();
    const [exercises, history, pref, me, span, prs] = await Promise.all([
      repo.q.exercises(),
      repo.q.exerciseHistory(id, 100),
      repo.q.exercisePref(id),
      repo.q.me(),
      userId ? repo.q.entriesBetween(userId, '0000-01-01', '9999-12-31') : Promise.resolve(null),
      repo.q.prEvents({ exerciseId: id }),
    ]);
    return {
      exercise: exercises.find((exercise) => exercise.id === id),
      history,
      prefRest: pref?.rest_s ?? null,
      bigJumps: me?.big_jumps ?? false,
      bodyweight: span?.bodyweight ?? [],
      me,
      sessions: span?.sessions ?? [],
      sets: span?.sets ?? [],
      prs,
    };
  }, [repo, id, revision]);

  useEffect(() => {
    if (!undoId) return undefined;
    const timer = window.setTimeout(() => setUndoId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoId]);

  if (!id || data === undefined) return <main className="progress"><p>{copy.loading}</p></main>;
  if (!data.exercise) return <main className="progress"><h1>{copy.missingExercise}</h1></main>;

  const exercise = data.exercise;
  const liftKind = exercise.kind === 'bw_lift' ? 'bw_lift' : exercise.kind === 'lift' ? 'lift' : null;
  const best = liftKind === null
    ? null
    : data.history.reduce<number | null>((max, item) => {
      const value = sessionBest(exercise, item, data.bodyweight);
      if (value === null) return max;
      return max === null || value > max ? value : max;
    }, null);
  const fallback = exercise.category === 'isolation' ? 90 : 120;
  const rows = liftKind === null
    ? []
    : repMaxTable(
      data.history.map((item) => ({ localDate: item.session.local_date, sets: item.sets })),
      liftKind,
      (date) => bodyweightOn(data.bodyweight, date),
    );
  const chartWindow = data.me == null ? null : trendWindow(localDateOf(new Date().toISOString(), data.me.tz));
  const points = liftKind === null || data.me == null || chartWindow == null
    ? []
    : bestE1rmPerSession({
      userId: data.me.id,
      exerciseId: exercise.id,
      from: chartWindow.from,
      to: chartWindow.to,
      exercise,
      sessions: data.sessions,
      sets: data.sets,
      bodyweights: data.bodyweight,
    });

  function refresh() {
    setRevision((value) => value + 1);
  }

  function publish(next: EditNotice | undefined) {
    setNotice(shownNotice(next));
  }

  async function removeSet(setId: string) {
    setTrashError(null);
    const result = await repo.w.softDelete('sets', setId);
    if (!result.ok) {
      setTrashError(writeErrorCopy(result.error));
      return;
    }
    setUndoId(setId);
    publish(result.notice);
    refresh();
  }

  async function restoreSet() {
    const setId = undoId;
    if (!setId) return;
    setUndoId(null);
    const result = await repo.w.restore('sets', setId);
    if (!result.ok) {
      setTrashError(writeErrorCopy(result.error));
      refresh();
      return;
    }
    publish(result.notice);
    refresh();
  }

  return (
    <main className="progress">
      <h1>{exercise.name}</h1>
      <EditNotices notice={notice} />
      {liftKind ? (
        <p>
          {copy.bestE1rm}{' '}
          <BigNumber data-testid="best-e1rm" size="xl" value={best === null ? copy.e1rmNone : formatE1rm(best)} unit={copy.kg} />
        </p>
      ) : null}
      {liftKind && chartWindow ? (
        <E1rmChart points={points} window={chartWindow} />
      ) : null}
      {liftKind ? <RepMaxTable rows={rows} /> : null}
      <PrList events={data.prs} />
      <RestEditor
        initial={data.prefRest ?? fallback}
        onSave={async (rest) => {
          const result = await repo.w.setExercisePref(exercise.id, { rest_s: rest });
          if (!result.ok) return writeErrorCopy(result.error);
          refresh();
          return null;
        }}
      />
      <BigJumpsToggle
        saved={data.bigJumps}
        onSave={async (next) => {
          const result = await repo.w.upsertMyProfile({ big_jumps: next });
          if (!result.ok) return writeErrorCopy(result.error);
          refresh();
          return null;
        }}
      />
      <section aria-label={copy.historyHeading}>
        <h2>{copy.historyHeading}</h2>
        {data.history.length === 0 ? <p>{copy.noSetsYet}</p> : (
          <ol className="progress-history">
            {data.history.map((item) => (
              <HistorySession
                key={item.session.id}
                exercise={exercise}
                item={item}
                bodyweight={data.bodyweight}
                onRefresh={refresh}
                onDelete={(setId) => { void removeSet(setId); }}
                onNotice={publish}
              />
            ))}
          </ol>
        )}
      </section>
      {trashError ? <p className="progress-error" role="alert">{trashError}</p> : null}
      {undoId ? (
        <p className="progress-inline" role="status">
          {copy.undone}
          <Button onClick={() => { void restoreSet(); }}>{copy.restore}</Button>
        </p>
      ) : null}
    </main>
  );
}

function E1rmChart({
  points, window,
}: {
  points: readonly SessionBest[];
  window: { from: string; to: string };
}) {
  const model = chartModel(points, [], false);
  return (
    <section aria-label={copy.bestE1rm}>
      <h2>{copy.bestE1rm}</h2>
      {points.length < 2 ? <p>{copy.emptyProgress}</p> : (
        <TrendChart
          model={model}
          window={window}
          youLabel={copy.progressYou}
          partnerLabel={null}
          partnerHue={200}
          caption={copy.progressChartKg}
        />
      )}
      {points.length > 0 ? (
        <table className="progress-sr">
          <caption>{copy.chartTableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.dateLabel}</th>
              <th scope="col">{copy.chartTableKg}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.sessionId}>
                <td>{point.localDate}</td>
                <td>{formatE1rm(point.e1rm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function RepMaxTable({ rows }: { rows: readonly RepMaxRow[] }) {
  return (
    <section aria-label={copy.repMaxHeading}>
      <h2>{copy.repMaxHeading}</h2>
      <p className="progress-muted">{copy.repMaxCaption}</p>
      <div className="progress-table-wrap">
        <table className="progress-reps">
          <thead>
            <tr>
              <th scope="col">{copy.reps}</th>
              <th scope="col">{copy.repMaxActual}</th>
              <th scope="col">{copy.repMaxDerived}</th>
              <th scope="col">{copy.dateLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reps}>
                <th scope="row">{row.reps}</th>
                <td>{row.actualKg == null ? copy.e1rmNone : formatKgCell(row.actualKg)}</td>
                <td>{row.derivedKg == null ? copy.e1rmNone : formatKgCell(row.derivedKg)}</td>
                <td>{row.date ?? copy.e1rmNone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrList({ events }: { events: readonly PrEvent[] }) {
  return (
    <section aria-label={copy.prListHeading}>
      <h2>{copy.prListHeading}</h2>
      {events.length === 0 ? <p>{copy.prListEmpty}</p> : (
        <ul className="progress-history">
          {events.map((event) => (
            <li key={event.id}>
              {prEyebrow(event)}
              {' · '}
              {formatPrKg(event.value)}
              {' · '}
              {event.local_date}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistorySession({
  exercise, item, bodyweight, onRefresh, onDelete, onNotice,
}: {
  exercise: Exercise;
  item: SessionWithSets;
  bodyweight: readonly BodyweightEntry[];
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onNotice: (notice: EditNotice) => void;
}) {
  const best = sessionBest(exercise, item, bodyweight);
  return (
    <li>
      <h3>
        <Link to={`/day/${item.session.local_date}`}>{item.session.local_date}</Link>
      </h3>
      {best !== null ? <p>{copy.sessionE1rm} {formatE1rm(best)} {copy.kg}</p> : null}
      <ol>
        {item.sets.map((set) => (
          <HistorySet key={set.id} set={set} exercise={exercise} onRefresh={onRefresh} onDelete={onDelete} onNotice={onNotice} />
        ))}
      </ol>
      <Link to={`/day/${item.session.local_date}`}>{copy.editDay}</Link>
    </li>
  );
}

function RestEditor({ initial, onSave }: { initial: number; onSave: (rest: number) => Promise<string | null> }) {
  const [seen, setSeen] = useState(initial);
  const [text, setText] = useState(String(initial));
  const [attempted, setAttempted] = useState(false);
  const [server, setServer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (initial !== seen) {
    setSeen(initial);
    setText(String(initial));
    setAttempted(false);
    setServer(null);
  }
  const parsed = parseRest(text);
  return (
    <form className="progress-form" onSubmit={(event) => {
      event.preventDefault();
      setAttempted(true);
      setServer(null);
      if (parsed.rest === null) return;
      setSaving(true);
      void onSave(parsed.rest).then((message) => {
        setServer(message);
        setSaving(false);
      });
    }}>
      <Field id="rest-seconds" label={copy.restSeconds} value={text} onChange={setText} error={parsed.error} show={attempted} testId="error-rest" inputMode="numeric" />
      {server ? <p className="progress-error" role="alert">{server}</p> : null}
      <Button type="submit" disabled={saving}>{copy.saveRest}</Button>
    </form>
  );
}

function BigJumpsToggle({ saved, onSave }: { saved: boolean; onSave: (next: boolean) => Promise<string | null> }) {
  const [seen, setSeen] = useState(saved);
  const [checked, setChecked] = useState(saved);
  const [server, setServer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (saved !== seen) {
    setSeen(saved);
    setChecked(saved);
  }
  return (
    <div className="progress-field">
      <label className="progress-toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={saving}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setChecked(next);
            setSaving(true);
            setServer(null);
            void onSave(next).then((message) => {
              if (message) setChecked(!next);
              setServer(message);
              setSaving(false);
            });
          }}
        />
        {copy.bigJumps}
      </label>
      <p className="progress-muted">{copy.bigJumpsHint}</p>
      {server ? <p className="progress-error" role="alert">{server}</p> : null}
    </div>
  );
}
