import { useEffect, useId, useState } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { Nudge } from '../../core/progression.ts';
import { formatNudgeChip, nudgeCopyKey } from '../../core/progression.ts';
import type { Exercise, Result, Session, SetRow } from '../../core/types.ts';
import { uiSchemas } from '../../core/validate.ts';
import type { WriteError } from '../../data/adapter.ts';
import { haptic } from '../../platform/haptics.ts';
import { Button, HoldButton, Sheet, Stepper, copy, fill } from '../../ui';
import { RestTimerOverlay } from '../timer/RestTimerOverlay.tsx';
import { skipRest, startRest, useRestTimer } from '../timer/useRestTimer.ts';
import { SetList } from './SetList.tsx';
import { FRESH_UNDO_MS, prefillAt, roundKg } from './sessionModel.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

interface LoggingCardProps {
  session: Session;
  exercise: Exercise;
  sets: SetRow[];
  prefillSets: readonly { weight_kg: number; reps: number }[];
  pending: Map<string, boolean>;
  restSeconds: number;
  nudge: Nudge | null;
  onNext: () => void;
  onFinish: (session: Session) => void;
  onLogged: (row: SetRow) => void;
  onRack: () => Promise<Result<Session, WriteError | 'label_taken'>>;
}

function nudgeSentence(nudge: Nudge): string {
  const key = nudgeCopyKey(nudge);
  if (key === 'progressionAdd' || key === 'progressionAddNoRpe') return fill(copy[key], { increment: nudge.incrementKg });
  return copy[key];
}

export function LoggingCard({ session, exercise, sets, prefillSets, pending, restSeconds, nudge, onNext, onFinish, onLogged, onRack }: LoggingCardProps) {
  const repo = useRepo();
  const write = useSessionWrite();
  const rest = useRestTimer();
  const id = useId();
  const workingLogged = sets.filter((set) => !set.is_warmup).length;
  const opening = prefillAt(prefillSets, workingLogged);
  const fallback = sets.at(-1);
  const [kg, setKg] = useState(opening?.weight_kg ?? fallback?.weight_kg ?? 0);
  const [reps, setReps] = useState(opening?.reps ?? fallback?.reps ?? exercise.rep_target);
  const [rpe, setRpe] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [rpeOpen, setRpeOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [bump, setBump] = useState(0);
  const [freshId, setFreshId] = useState<string | null>(null);
  const weightLabel = exercise.kind === 'bw_lift' ? copy.sessionAddedKg : copy.kg;
  const step = exercise.increment_kg > 0 ? exercise.increment_kg : 2.5;
  const resting = rest.state.phase !== 'idle';
  const valid = (exercise.kind === 'bw_lift' ? uiSchemas.added_kg : uiSchemas.lift_kg).safeParse(kg).success
    && uiSchemas.reps.safeParse(reps).success && (rpe === null || uiSchemas.rpe.safeParse(rpe).success);
  const rack = () => { void write.run(onRack, onFinish); };
  const rpePills = <div className="session-rpe-pills" role="group" aria-label={copy.sessionRpe}>
    <Button size="xl" variant="secondary" disabled={write.busy} aria-pressed={rpe === null} onClick={() => setRpe(null)}>{copy.sessionNoRpe}</Button>
    {Array.from({ length: 9 }, (_, index) => 6 + index / 2).map((value) => <Button key={value} size="xl"
      variant="secondary" disabled={write.busy} aria-label={fill(copy.sessionRpeValue, { value })} aria-pressed={rpe === value}
      onClick={() => setRpe(rpe === value ? null : value)}>{value}</Button>)}
  </div>;

  useEffect(() => {
    if (!freshId) return;
    const timer = window.setTimeout(() => setFreshId(null), FRESH_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [freshId]);

  useEffect(() => {
    if (rest.state.exerciseId !== exercise.id || rest.state.startedAt == null || rest.state.endsAt == null) return;
    const seconds = Math.round((rest.state.endsAt - rest.state.startedAt) / 1000);
    if (seconds === restSeconds || seconds < 15 || seconds > 600) return;
    void repo.w.setExercisePref(exercise.id, { rest_s: seconds });
  }, [rest.state.endsAt, rest.state.startedAt, rest.state.exerciseId, exercise.id, restSeconds, repo]);

  return <>
    {nudge && !applied && !resting && <div className="session-nudge">
      <Button size="xl" variant="secondary" disabled={write.busy} onClick={() => {
        setApplied(true);
        setBump(nudge.incrementKg);
        setKg((current) => roundKg(current + nudge.incrementKg));
      }}>{formatNudgeChip(nudge)}</Button>
      <p>{nudgeSentence(nudge)}</p>
    </div>}
    <SetList sets={sets} pending={pending} freshId={freshId} onDeleted={(row) => {
      if (row.id === freshId || row.id === sets.at(-1)?.id) skipRest();
      if (row.id === freshId) setFreshId(null);
    }} />
    <div id={`${id}-error`} className="session-feedback">
      {invalid && !valid && <p role="alert" className="session-error">{copy.outOfRange}</p>}
      <WriteFeedback error={write.error} retry={write.retry} />
    </div>
    <form className="session-controls" noValidate aria-label={exercise.name} onSubmit={(event) => {
      event.preventDefault();
      setInvalid(!valid);
      if (!valid) return;
      void write.run(() => repo.w.logSet({ session_id: session.id, exercise_id: exercise.id,
        weight_kg: kg, reps, rpe, is_warmup: warmup }), (row) => {
        const next = prefillAt(prefillSets, workingLogged + (warmup ? 0 : 1));
        setKg(next ? roundKg(next.weight_kg + bump) : row.weight_kg);
        setReps(next?.reps ?? row.reps);
        setRpe(null);
        setWarmup(false);
        setFreshId(row.id);
        haptic('setLogged');
        startRest(exercise.id, restSeconds);
        onLogged(row);
      });
    }}>
      <div className="session-steppers">
        <Stepper label={weightLabel} value={kg} step={step} onChange={setKg} disabled={write.busy} />
        <Stepper label={copy.reps} value={reps} step={1} onChange={setReps} disabled={write.busy} />
      </div>
      <div className="session-options">
        <Button className="session-rpe-trigger" size="xl" variant="secondary" disabled={write.busy} onClick={() => setRpeOpen(true)}>
          {rpe === null ? copy.sessionRpe : fill(copy.sessionRpeValue, { value: rpe })}
        </Button>
        <div className="session-rpe-inline">{rpePills}</div>
        <Button size="xl" variant="secondary" aria-pressed={warmup} disabled={write.busy}
          onClick={() => setWarmup(!warmup)}>{copy.sessionWarmup}</Button>
      </div>
      {resting ? <RestTimerOverlay part="controls" onSkipHold={rack} /> : <div className="session-actions">
        <Button size="xl" variant="secondary" disabled={write.busy} onClick={onNext}>{copy.nextExercise}</Button>
        <HoldButton size="xl" variant="secondary" holdMs={600} disabled={write.busy} aria-label={copy.finish} onHoldComplete={rack}>
          {copy.rackIt}
          <span className="session-hold-hint">{copy.finish}</span>
        </HoldButton>
      </div>}
      <Button className="session-log" type="submit" size="xl" disabled={write.busy} aria-describedby={`${id}-error`}>
        {copy.logSet}
      </Button>
    </form>
    <Sheet open={rpeOpen} onClose={() => setRpeOpen(false)} title={copy.sessionRpe}>{rpePills}</Sheet>
  </>;
}
