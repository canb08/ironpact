import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import { formatDate } from '../../core/formatDate.ts';
import { localDateOf } from '../../core/weeks.ts';
import type { BodyweightEntry, Exercise, Profile, Session, SetRow } from '../../core/types.ts';
import type { PrEvent, SessionWithSets, EditNotice } from '../../data/adapter.ts';
import { TrendChart } from '../stats/TrendChart.tsx';
import { bestE1rmPerSession, chartModel, trendWindow, type SessionBest } from '../stats/trend.ts';
import { BigNumber, Button, Sheet, copy, fill } from '../../ui';
import { bestE1rm, formatE1rm } from './e1rmView.ts';
import { parseRest, writeErrorCopy } from './form.ts';
import { HistorySet } from './historySet.tsx';
import { EditNotices } from './notices.tsx';
import { shownNotice } from './notices.ts';
import { formatKgCell, repMaxTable, type RepMaxRow } from './repMax.ts';
import { formatPrKg } from '../prs/label.ts';
import { Field } from './widgets.tsx';
import '../stats/progress.css';
import './progress.css';
import './ExerciseDetailScreen.css';

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
  partners: Profile[];
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
  partners: [],
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [showPartner, setShowPartner] = useState(false);
  const [revision, setRevision] = useState(0);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const data = useLiveQuery(async () => {
    if (!id) return EMPTY;
    const userId = repo.auth.userId();
    const [exercises, history, pref, me, span, prs, crew] = await Promise.all([
      repo.q.exercises(),
      repo.q.exerciseHistory(id, 100),
      repo.q.exercisePref(id),
      repo.q.me(),
      userId ? repo.q.entriesBetween(userId, '0000-01-01', '9999-12-31') : Promise.resolve(null),
      repo.q.prEvents({ exerciseId: id }),
      repo.q.myCrew(),
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
      partners: await repo.q.profiles((crew?.members ?? [])
        .filter((member) => member.left_at === null && member.user_id !== userId)
        .map((member) => member.user_id)).then((partners) => partners.map((partner) => ({ ...partner, display_name: partner.display_name.trim() && partner.display_name.trim() !== copy.x3LegacyName ? partner.display_name.trim() : copy.x3Partner }))),
    };
  }, [repo, id, revision]);

  const activePartner = data?.partners.find((partner) => partner.id === partnerId) ?? data?.partners[0];
  const partnerData = useLiveQuery(async () => {
    if (!showPartner || !activePartner) return null;
    return repo.q.entriesBetween(activePartner.id, '0000-01-01', '9999-12-31');
  }, [repo, activePartner?.id, showPartner, revision]);

  useEffect(() => {
    if (!undoId) return undefined;
    const timer = window.setTimeout(() => setUndoId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoId]);

  if (!id || data === undefined) return <main className="progress"><p>{copy.loading}</p></main>;
  if (!data.exercise) return <main className="progress"><h1>{copy.missingExercise}</h1></main>;

  const exercise = data.exercise;
  const today = localDateOf(new Date().toISOString(), data.me?.tz ?? 'Europe/Amsterdam');
  const liftKind = exercise.kind === 'bw_lift' ? 'bw_lift' : exercise.kind === 'lift' ? 'lift' : null;
  const best = liftKind === null
    ? null
    : data.history.reduce<number | null>((max, item) => {
      const value = sessionBest(exercise, item, data.bodyweight);
      if (value === null) return max;
      return max === null || value > max ? value : max;
    }, null);
  const historyDays = [...new Set(data.history.map((item) => item.session.local_date))]
    .sort((a, b) => b.localeCompare(a));
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
    <main className="progress exercise-detail">
      <h1>{exercise.name}</h1>
      <div className="exercise-detail-heading">
        <Button variant="ghost" aria-label={copy.x5Settings} aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>⋯</Button>
      </div>
      <EditNotices notice={notice} />
      {liftKind && chartWindow ? (
        <section className="exercise-detail-hero" aria-label={copy.x5Estimate}>
          <h2>{copy.x5Estimate}</h2>
          <BigNumber data-testid="best-e1rm" size="xl" value={best === null ? copy.e1rmNone : formatE1rm(best)} unit={copy.kg} />
          <details className="exercise-estimate-help"><summary>{copy.x5Details}</summary><p>{copy.x5EstimateHelp}</p></details>
          {data.partners.length > 1 && <label className="progress-field">{copy.partner}
            <select value={activePartner?.id ?? ''} onChange={(event) => setPartnerId(event.target.value)}>
              {data.partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.display_name}</option>)}
            </select>
          </label>}
          {activePartner && <Button variant="secondary" role="switch" aria-checked={showPartner}
            onClick={() => setShowPartner((value) => !value)}>{fill(copy.progressShowPartner, { partner: activePartner.display_name })}</Button>}
          <E1rmChart points={points} window={chartWindow} partner={showPartner ? activePartner : undefined}
            partnerPoints={showPartner && activePartner && partnerData ? bestE1rmPerSession({
              userId: activePartner.id, exerciseId: exercise.id, exercise,
              from: chartWindow.from, to: chartWindow.to, sessions: partnerData.sessions,
              sets: partnerData.sets, bodyweights: partnerData.bodyweight,
            }) : []} today={today} />
        </section>
      ) : null}
      <PrList events={data.prs} today={today} />
      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title={copy.x5Settings}>
        <div className="exercise-settings">
          <RestEditor initial={data.prefRest ?? fallback} onSave={async (rest) => {
            const result = await repo.w.setExercisePref(exercise.id, { rest_s: rest });
            if (!result.ok) return writeErrorCopy(result.error);
            refresh(); return null;
          }} />
          <BigJumpsToggle saved={data.bigJumps} onSave={async (next) => {
            const result = await repo.w.upsertMyProfile({ big_jumps: next });
            if (!result.ok) return writeErrorCopy(result.error);
            refresh(); return null;
          }} />
        </div>
      </Sheet>
      <section aria-label={copy.historyHeading}>
        <h2>{copy.historyHeading}</h2>
        {data.history.length === 0 ? <p>{copy.noSetsYet}</p> : (
          <ol className="progress-history">
            {historyDays.map((date) => (
              <HistoryDay
                key={date}
                date={date}
                exercise={exercise}
                items={data.history.filter((item) => item.session.local_date === date)}
                bodyweight={data.bodyweight}
                today={today}
                onRefresh={refresh}
                onDelete={(setId) => { void removeSet(setId); }}
                onNotice={publish}
              />
            ))}
          </ol>
        )}
      </section>
      {liftKind ? <details className="exercise-rep-max"><summary>{copy.repMaxHeading}</summary><RepMaxTable rows={rows} today={today} /></details> : null}
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

function E1rmChart({ points, window, partner, partnerPoints, today }: {
  points: readonly SessionBest[];
  window: { from: string; to: string };
  partner?: Profile;
  partnerPoints: readonly SessionBest[];
  today: string;
}) {
  const model = chartModel(points, partnerPoints, partner != null);
  return <>
    {points.length < 2 ? <p className="progress-muted">{copy.x5ChartEmpty}</p> : null}
    {points.length > 0 && <TrendChart model={model} window={window}
      youLabel={copy.progressYou} partnerLabel={partner?.display_name ?? null} partnerHue={200}
      caption={partner ? fill(copy.progressChartPercent, { partner: partner.display_name }) : copy.progressChartKg} />}
    <p className="progress-muted">{fill(copy.x11Range, { from: formatDate(window.from, today, copy, false), to: formatDate(window.to, today, copy, false) })}</p>
    {partner && <p className="progress-muted">{copy.x5Comparison}</p>}
    {partner && partnerPoints.length < 2 && <p className="progress-muted">{fill(copy.progressPartnerQuiet, { partner: partner.display_name })}</p>}
    {points.length > 0 && <table className="progress-sr">
      <caption>{copy.chartTableCaption}</caption>
      <thead><tr><th scope="col">{copy.dateLabel}</th><th scope="col">{copy.chartTableKg}</th>
        {partner && <th scope="col">{partner.display_name}</th>}</tr></thead>
      <tbody>{model.mine.map((point) => <tr key={point.sessionId}>
        <td>{formatDate(point.localDate, today, copy)}</td>
        <td>{partner ? fill(copy.progressPointOwn, { date: formatDate(point.localDate, today, copy), percent: formatE1rm(point.value), kg: formatE1rm(point.raw) }) : formatE1rm(point.raw)}</td>
        {partner && <td />}
      </tr>)}
      {model.partner.map((point) => <tr key={point.sessionId}><td>{formatDate(point.localDate, today, copy)}</td><td />
        <td>{fill(copy.progressPointPartner, { date: formatDate(point.localDate, today, copy), percent: formatE1rm(point.value) })}</td></tr>)}</tbody>
    </table>}
  </>;
}

function RepMaxTable({ rows, today }: { rows: readonly RepMaxRow[]; today: string }) {
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
                <td>{row.date ? formatDate(row.date, today, copy) : copy.e1rmNone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrList({ events, today }: { events: readonly PrEvent[]; today: string }) {
  return (
    <section aria-label={copy.prListHeading}>
      <h2>{copy.prListHeading}</h2>
      {events.length === 0 ? <p>{copy.prListEmpty}</p> : (
        <ul className="progress-history">
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.pr_type === 'rep_max' ? fill(copy.x5PrReps, { reps: event.reps ?? 0 }) : event.pr_type === 'volume' ? copy.x5PrVolume : copy.x5PrEstimate} {formatPrKg(event.value)} {copy.kg}</strong>
              <span>{formatDate(event.local_date, today, copy)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryDay({
  exercise, items, date, bodyweight, today, onRefresh, onDelete, onNotice,
}: {
  exercise: Exercise;
  items: readonly SessionWithSets[];
  date: string;
  today: string;
  bodyweight: readonly BodyweightEntry[];
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onNotice: (notice: EditNotice) => void;
}) {
  const estimates = items.flatMap((item) => {
    const estimate = sessionBest(exercise, item, bodyweight);
    return estimate == null ? [] : [estimate];
  });
  const best = estimates.length > 0 ? Math.max(...estimates) : null;
  const sets = items.flatMap((item) => item.sets);
  return (
    <li>
      <h3>
        <Link to={`/day/${date}`}>{formatDate(date, today, copy)}</Link>
      </h3>
      {best !== null ? <p>{fill(copy.x5SessionBest, { kg: formatE1rm(best) })}</p> : null}
      <p className="progress-muted">{sets.map((set) => fill(copy.x5HistorySet, { reps: set.reps, kg: set.weight_kg })).join(', ')}</p>
      <details><summary>{copy.x5ManageSets}</summary><ol>
        {sets.map((set) => (
          <HistorySet key={set.id} set={set} exercise={exercise} onRefresh={onRefresh} onDelete={onDelete} onNotice={onNotice} />
        ))}
      </ol></details>
      <Link to={`/day/${date}`}>{copy.editDay}</Link>
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
