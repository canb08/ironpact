import { useId, useRef, useState } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { Exercise, Session, SetRow } from '../../core/types.ts';
import { uiSchemas } from '../../core/validate.ts';
import { Button, HoldButton, Sheet, Stepper, copy, fill } from '../../ui';
import { SetList } from './SetList.tsx';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

interface LoggingCardProps {
  session: Session;
  exercise: Exercise;
  sets: SetRow[];
  previousSets: SetRow[];
  pending: Map<string, boolean>;
  onNext: () => void;
  onFinish: () => void;
}

export function LoggingCard({ session, exercise, sets, previousSets, pending, onNext, onFinish }: LoggingCardProps) {
  const repo = useRepo();
  const write = useSessionWrite();
  const id = useId();
  const prefill = previousSets[sets.length] ?? previousSets.at(-1) ?? sets.at(-1);
  const [kg, setKg] = useState(prefill?.weight_kg ?? 0);
  const [reps, setReps] = useState(prefill?.reps ?? exercise.rep_target);
  const [rpe, setRpe] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [rpeOpen, setRpeOpen] = useState(false);
  const count = useRef(sets.length);
  const weightLabel = exercise.kind === 'bw_lift' ? copy.sessionAddedKg : copy.kg;
  const valid = (exercise.kind === 'bw_lift' ? uiSchemas.added_kg : uiSchemas.lift_kg).safeParse(kg).success
    && uiSchemas.reps.safeParse(reps).success && (rpe === null || uiSchemas.rpe.safeParse(rpe).success);
  const rpePills = <div className="session-rpe-pills" role="group" aria-label={copy.sessionRpe}>
    <Button size="xl" variant="secondary" disabled={write.busy} aria-pressed={rpe === null} onClick={() => setRpe(null)}>{copy.sessionNoRpe}</Button>
    {Array.from({ length: 9 }, (_, index) => 6 + index / 2).map((value) => <Button key={value} size="xl"
      variant="secondary" disabled={write.busy} aria-label={fill(copy.sessionRpeValue, { value })} aria-pressed={rpe === value}
      onClick={() => setRpe(rpe === value ? null : value)}>{value}</Button>)}
  </div>;

  return <>
    <SetList sets={sets} pending={pending} />
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
        count.current += 1;
        const next = previousSets[count.current] ?? previousSets.at(-1) ?? row;
        setKg(next.weight_kg);
        setReps(next.reps);
        setRpe(null);
        setWarmup(false);
      });
    }}>
      <div className="session-steppers">
        <Stepper label={weightLabel} value={kg} step={2.5} onChange={setKg} disabled={write.busy} />
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
      <div className="session-actions">
        <Button size="xl" variant="secondary" disabled={write.busy} onClick={onNext}>{copy.nextExercise}</Button>
        <HoldButton size="xl" variant="secondary" holdMs={600} disabled={write.busy} aria-label={copy.finish}
          onHoldComplete={() => { void write.run(() => repo.w.finishSession(session.id), onFinish); }}>
          {copy.finish}
        </HoldButton>
      </div>
      <Button className="session-log" type="submit" size="xl" disabled={write.busy} aria-describedby={`${id}-error`}>
        {copy.logSet}
      </Button>
    </form>
    <Sheet open={rpeOpen} onClose={() => setRpeOpen(false)} title={copy.sessionRpe}>{rpePills}</Sheet>
  </>;
}
