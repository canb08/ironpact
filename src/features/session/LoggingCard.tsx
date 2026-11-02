import { useEffect, useId, useRef, useState } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { Nudge } from '../../core/progression.ts';
import { formatNudgeChip, nudgeCopyKey } from '../../core/progression.ts';
import type { Exercise, Session, SetRow } from '../../core/types.ts';
import { uiSchemas } from '../../core/validate.ts';
import { haptic } from '../../platform/haptics.ts';
import { Button, Stepper, copy, fill } from '../../ui';
import { RestTimerOverlay } from '../timer/RestTimerOverlay.tsx';
import { skipRest, startRest, useRestTimer } from '../timer/useRestTimer.ts';
import { SetList } from './SetList.tsx';
import { FRESH_UNDO_MS, prefillAt, roundKg } from './sessionModel.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { SetLoggedPlayer } from '../../ui/motion/SetLogged.tsx';
import { useSetLoggedMicro } from './useSetLoggedMicro.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

interface LoggingCardProps {
  session: Session;
  exercise: Exercise;
  sets: SetRow[];
  prefillSets: readonly { weight_kg: number; reps: number }[];
  pending: Map<string, boolean>;
  allSets: SetRow[];
  exercises: Exercise[];
  bigJumps: boolean;
  finishing: boolean;
  reduceMotion?: boolean | undefined;
  onBusyChange: (busy: boolean) => void;
  restSeconds: number;
  nudge: Nudge | null;
  onNext: () => void;
  onLogged: (row: SetRow) => void;
}

function nudgeSentence(nudge: Nudge): string {
  const key = nudgeCopyKey(nudge);
  if (key === 'progressionAdd' || key === 'progressionAddNoRpe') return fill(copy[key], { increment: nudge.incrementKg });
  return copy[key];
}

export function LoggingCard({ session, exercise, sets, allSets, exercises, bigJumps, finishing, reduceMotion, onBusyChange, prefillSets, pending, restSeconds, nudge, onNext, onLogged }: LoggingCardProps) {
  const repo = useRepo();
  const write = useSessionWrite();
  const logged = useSetLoggedMicro();
  const busy = write.busy || finishing;
  useEffect(() => { onBusyChange(write.busy); }, [write.busy, onBusyChange]);
  const rest = useRestTimer();
  const id = useId();
  const dock = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const element = dock.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      element.closest('main')?.style.setProperty('--session-dock-height', `${element.offsetHeight + 24}px`);
      element.classList.toggle('session-controls--flow', element.getBoundingClientRect().height > window.innerHeight * .55);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const workingLogged = sets.filter((set) => !set.is_warmup).length;
  const opening = prefillAt(prefillSets, workingLogged);
  const fallback = sets.at(-1);
  const [kg, setKg] = useState(fallback?.weight_kg ?? opening?.weight_kg ?? 0);
  const [reps, setReps] = useState(fallback?.reps ?? opening?.reps ?? exercise.rep_target);
  const [rpe, setRpe] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [rpeOpen, setRpeOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [bump, setBump] = useState(0);
  const [freshId, setFreshId] = useState<string | null>(null);
  const weightLabel = exercise.kind === 'bw_lift' ? copy.sessionAddedKg : copy.kg;
  const step = bigJumps && exercise.lower_body && exercise.category === 'compound' ? 5 : exercise.increment_kg > 0 ? exercise.increment_kg : 2.5;
  const resting = rest.state.phase !== 'idle';
  const valid = (exercise.kind === 'bw_lift' ? uiSchemas.added_kg : uiSchemas.lift_kg).safeParse(kg).success
    && uiSchemas.reps.safeParse(reps).success && (rpe === null || uiSchemas.rpe.safeParse(rpe).success);
  const rpePills = <div className="session-rpe-pills" role="group" aria-label={copy.sessionRpe}>
    <Button variant="secondary" disabled={busy} aria-pressed={rpe === null} onClick={() => setRpe(null)}>{copy.sessionNoRpe}</Button>
    {Array.from({ length: 9 }, (_, index) => 6 + index / 2).map((value) => <Button key={value}
      variant="secondary" disabled={busy} aria-label={fill(copy.sessionRpeValue, { value })} aria-pressed={rpe === value}
      onClick={() => { setRpe(rpe === value ? null : value); setRpeOpen(false); }}>{value}</Button>)}
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
    <SetList sets={allSets} exercises={exercises} pending={pending} freshId={freshId} onDeleted={(row) => {
      if (row.id === freshId || row.id === sets.at(-1)?.id) skipRest();
      if (row.id === freshId) setFreshId(null);
    }} />
    <div id={`${id}-error`} className="session-feedback">
      {invalid && !valid && <p role="alert" className="session-error">{copy.outOfRange}</p>}
      <WriteFeedback error={write.error} retry={write.retry} />
    </div>
    <form ref={dock} data-session-dock className="session-controls" noValidate aria-label={exercise.name} onSubmit={(event) => {
      event.preventDefault();
      if (finishing) return;
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
        logged.play();
        startRest(exercise.id, restSeconds);
        onLogged(row);
      });
    }}>
      <RestTimerOverlay reduceMotion={reduceMotion} />
      {nudge && !applied && !resting && <div className="session-nudge">
        <Button variant="secondary" disabled={busy} onClick={() => {
          setApplied(true); setBump(nudge.incrementKg);
          setKg((current) => roundKg(current + nudge.incrementKg));
        }}>{formatNudgeChip(nudge)}</Button>
        <p>{nudgeSentence(nudge)}</p>
      </div>}
      <SetLoggedPlayer playKey={logged.playKey} reduced={logged.reduced} />
      <div className="session-steppers">
        <div data-set-logged-weight="">
          <Stepper label={weightLabel} value={kg} step={step} unit={copy.kg} onChange={setKg} disabled={busy} />
        </div>
        <Stepper label={copy.reps} value={reps} step={1} onChange={setReps} disabled={busy} />
      </div>
      <div className="session-options">
        <Button variant="ghost" disabled={busy} aria-expanded={rpeOpen} onClick={() => setRpeOpen(!rpeOpen)}>
          {rpe === null ? copy.x4AddRpe : fill(copy.sessionRpeValue, { value: rpe })}
        </Button>
        <Button variant="ghost" aria-pressed={warmup} disabled={busy}
          onClick={() => setWarmup(!warmup)}>{copy.sessionWarmup}</Button>
        <Button variant="ghost" disabled={busy} onClick={onNext}>{copy.nextExercise}</Button>
      </div>
      {rpeOpen && rpePills}
      <Button className="session-log" type="submit" size="xl" disabled={busy} aria-describedby={`${id}-error`}>
        {copy.x4Log}
      </Button>
      {logged.visible && <p role="status">{copy.x4Saved}</p>}
    </form>
  </>;
}
