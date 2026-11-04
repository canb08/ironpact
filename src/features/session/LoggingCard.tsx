import { useEffect, useId, useRef, useState } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { Nudge } from '../../core/progression.ts';
import { formatNudgeChip, nudgeCopyKey } from '../../core/progression.ts';
import type { Exercise, Session, SetRow } from '../../core/types.ts';
import { uiSchemas } from '../../core/validate.ts';
import { feel } from '../../ui/feel/feel.ts';
import { useReducedMotion } from '../../ui/motion/reduced.ts';
import { Button, copy, fill, useToast } from '../../ui';
import { RestTimerOverlay } from '../timer/RestTimerOverlay.tsx';
import { skipRest, startRest, useRestTimer } from '../timer/useRestTimer.ts';
import { revealLatestSet } from './sessionViewport.ts';
import { SetList } from './SetList.tsx';
import { FRESH_UNDO_MS, prefillAt, roundKg } from './sessionModel.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { DockDial } from './DockDial.tsx';
import { PlateLoader } from './PlateLoader.tsx';
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
  barKg: number;
  platesKg: readonly number[];
  finishing: boolean;
  reduceMotion?: boolean | undefined;
  onBusyChange: (busy: boolean) => void;
  restSeconds: number;
  nudge: Nudge | null;
  onNext: () => void;
  onChangeExercise: () => void;
  onLogged: (row: SetRow) => void;
}

function nudgeSentence(nudge: Nudge): string {
  const key = nudgeCopyKey(nudge);
  if (key === 'progressionAdd' || key === 'progressionAddNoRpe') return fill(copy[key], { increment: nudge.incrementKg });
  return copy[key];
}

export function LoggingCard({ session, exercise, sets, allSets, exercises, bigJumps, barKg, platesKg, finishing, reduceMotion, onBusyChange, prefillSets, pending, restSeconds, nudge, onNext, onChangeExercise, onLogged }: LoggingCardProps) {
  const repo = useRepo();
  const write = useSessionWrite();
  const logged = useSetLoggedMicro();
  const { showToast } = useToast();
  const busy = write.busy || finishing;
  useEffect(() => { onBusyChange(write.busy); }, [write.busy, onBusyChange]);
  const rest = useRestTimer();
  const id = useId();
  const dock = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const element = dock.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const main = element.closest('main');
      main?.style.setProperty('--session-dock-height', `${element.offsetHeight}px`);
      const previous = element.dataset.height;
      // The Y4 rest bar has 56 px targets; retain the fixed dock while they fit.
      const dockLimit = element.querySelector('.rest-timer__bar') ? .6 : .55;
      element.classList.toggle('session-controls--flow', element.getBoundingClientRect().height > window.innerHeight * dockLimit);
      element.dataset.height = String(element.offsetHeight);
      if (main && (previous === undefined || element.offsetHeight > Number(previous))) revealLatestSet(main);
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
  const [removing, setRemoving] = useState(false);
  const reduced = useReducedMotion(reduceMotion || logged.reduced);
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

  const saveSet = (draft: { exercise_id: string; weight_kg: number; reps: number; rpe: number | null; is_warmup: boolean }) => {
    if (busy) return;
    void write.run(() => repo.w.logSet({ session_id: session.id, ...draft }), (row) => {
      const next = prefillAt(prefillSets, workingLogged + (row.is_warmup ? 0 : 1));
      // An adjusted straight set stays adjusted. Matching historical sets still advance.
      const matchesPlan = opening && kg === opening.weight_kg && reps === opening.reps;
      if (row.exercise_id === exercise.id) {
        setKg(matchesPlan && next ? next.weight_kg : row.weight_kg);
        setReps(matchesPlan && next ? next.reps : row.reps);
        setRpe(null);
        setWarmup(false);
      }
      setFreshId(row.id);
      feel('set', { weightKg: row.weight_kg, reducedMotion: reduced });
      logged.play();
      startRest(row.exercise_id, restSeconds);
      onLogged(row);
    });
  };

  return <>
    <SetList ghost={{ weight_kg: kg, reps }} freshId={freshId} reduced={reduced} busy={busy}
      onRepeat={(row) => saveSet({ exercise_id: row.exercise_id, weight_kg: row.weight_kg, reps: row.reps, rpe: null, is_warmup: row.is_warmup })} sets={allSets} exercises={exercises} currentExerciseId={exercise.id} onChangeExercise={onChangeExercise} pending={pending} onDeleted={(row) => {
      if (row.id === freshId || row.id === sets.at(-1)?.id) skipRest();
      if (row.id === freshId) setFreshId(null);
    }} />
    <div id={`${id}-error`} className="session-feedback">
      {invalid && !valid && <p role="alert" className="session-error">{copy.outOfRange}</p>}
      <WriteFeedback error={write.error} retry={write.retry} />
    </div>
    <form ref={dock} data-session-dock className={`session-controls${reduced ? ' session-controls--instant' : ''}`} data-land={logged.playKey ? logged.playKey % 2 : undefined} noValidate aria-label={exercise.name} onSubmit={(event) => {
      event.preventDefault();
      if (finishing) return;
      setInvalid(!valid);
      if (!valid) return;
      saveSet({ exercise_id: exercise.id, weight_kg: kg, reps, rpe, is_warmup: warmup });
    }}>
      <RestTimerOverlay reduceMotion={reduceMotion} nextSet={{ exercise: exercise.name, weightKg: kg, reps, bodyweight: exercise.kind === 'bw_lift' }} />
      {nudge && !applied && !resting && <div className="session-nudge">
        <Button variant="secondary" disabled={busy} onClick={() => {
          setApplied(true);
          setKg((current) => roundKg(current + nudge.incrementKg));
        }}>{formatNudgeChip(nudge)}</Button>
        <p>{nudgeSentence(nudge)}</p>
      </div>}
      <div className="session-options">
        <Button variant="ghost" disabled={busy} aria-expanded={rpeOpen} onClick={() => setRpeOpen(!rpeOpen)}>
          {rpe === null ? copy.x4AddRpe : fill(copy.sessionRpeValue, { value: rpe })}
        </Button>
        <Button variant="ghost" aria-pressed={warmup} disabled={busy}
          onClick={() => setWarmup(!warmup)}>{copy.sessionWarmup}</Button>
        <Button variant="ghost" disabled={busy} aria-pressed={removing} onClick={() => setRemoving(!removing)}>{copy.y3RemovePlates}</Button>
        <Button variant="ghost" disabled={busy} onClick={onNext}>{copy.nextExercise}</Button>
      </div>
      {rpeOpen && rpePills}
      {freshId && allSets.some((row) => row.id === freshId) && <div className="session-fresh">
        <p role="status">{copy.x4Saved}</p>
        <Button size="xl" variant="secondary" disabled={busy} onClick={() => {
          const id = freshId;
          void write.run(() => repo.w.softDelete('sets', id), () => {
            setFreshId(null); skipRest();
            showToast({ message: copy.undone, timeoutMs: 5000, action: { label: copy.undo, onClick: () => {
              void write.run(() => repo.w.restore('sets', id), () => {});
            } } });
          });
        }}>{copy.undo}</Button>
      </div>}
      <div className="session-dials">
        <DockDial label={weightLabel} value={kg} step={step} min={exercise.kind === 'bw_lift' ? -100 : 0}
          max={500} onChange={setKg} disabled={busy} />
        <DockDial label={copy.reps} value={reps} step={1} min={1} max={100} onChange={setReps} disabled={busy} />
      </div>
      {exercise.kind !== 'bw_lift' && <PlateLoader kg={kg} barKg={barKg} available={platesKg} disabled={busy}
        removing={removing} onChange={setKg} />}
      <Button className="session-log" type="submit" size="xl" disabled={busy} aria-describedby={`${id}-error`}>
        {copy.x4Log}
      </Button>
    </form>
  </>;
}
