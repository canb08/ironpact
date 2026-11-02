import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { BodyweightEntry, Exercise } from '../../core/types.ts';
import type { SessionWithSets } from '../../data/adapter.ts';
import { BigNumber, Button, Chip, copy, fill } from '../../ui';
import { bestE1rm, formatE1rm } from './e1rmView.ts';
import { parseRest, writeErrorCopy } from './form.ts';
import { Field } from './widgets.tsx';
import './progress.css';

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
  const data = useLiveQuery(async () => {
    if (!id) return { exercise: undefined, history: [], prefRest: null as number | null, bigJumps: false, bodyweight: [] as BodyweightEntry[] };
    const userId = repo.auth.userId();
    const [exercises, history, pref, me, span] = await Promise.all([
      repo.q.exercises(),
      repo.q.exerciseHistory(id, 100),
      repo.q.exercisePref(id),
      repo.q.me(),
      userId ? repo.q.entriesBetween(userId, '0000-01-01', '9999-12-31') : Promise.resolve(null),
    ]);
    return {
      exercise: exercises.find((exercise) => exercise.id === id),
      history,
      prefRest: pref?.rest_s ?? null,
      bigJumps: me?.big_jumps ?? false,
      bodyweight: span?.bodyweight ?? [],
    };
  }, [repo, id, revision]);

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

  return (
    <main className="progress">
      <h1>{exercise.name}</h1>
      {liftKind ? (
        <p>
          {copy.bestE1rm}{' '}
          <BigNumber data-testid="best-e1rm" size="xl" value={best === null ? copy.e1rmNone : formatE1rm(best)} unit={copy.kg} />
        </p>
      ) : null}
      <RestEditor
        initial={data.prefRest ?? fallback}
        onSave={async (rest) => {
          const result = await repo.w.setExercisePref(exercise.id, { rest_s: rest });
          if (!result.ok) return writeErrorCopy(result.error);
          setRevision((value) => value + 1);
          return null;
        }}
      />
      <BigJumpsToggle
        saved={data.bigJumps}
        onSave={async (next) => {
          const result = await repo.w.upsertMyProfile({ big_jumps: next });
          if (!result.ok) return writeErrorCopy(result.error);
          setRevision((value) => value + 1);
          return null;
        }}
      />
      <section aria-label={copy.historyHeading}>
        <h2>{copy.historyHeading}</h2>
        {data.history.length === 0 ? <p>{copy.noSetsYet}</p> : (
          <ol className="progress-history">
            {data.history.map((item) => (
              <HistorySession key={item.session.id} exercise={exercise} item={item} bodyweight={data.bodyweight} />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function HistorySession({ exercise, item, bodyweight }: { exercise: Exercise; item: SessionWithSets; bodyweight: readonly BodyweightEntry[] }) {
  const best = sessionBest(exercise, item, bodyweight);
  return (
    <li>
      <h3>
        <Link to={`/day/${item.session.local_date}`}>{item.session.local_date}</Link>
      </h3>
      {best !== null ? <p>{copy.sessionE1rm} {formatE1rm(best)} {copy.kg}</p> : null}
      <ol>
        {item.sets.map((set) => (
          <li key={set.id} className="progress-set">
            <span>{fill(copy.setLine, { index: set.set_index, reps: set.reps, kg: set.weight_kg })}</span>
            {set.rpe !== null ? <span>@{set.rpe}</span> : null}
            {set.is_warmup ? <Chip>{copy.sessionWarmup}</Chip> : null}
          </li>
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
