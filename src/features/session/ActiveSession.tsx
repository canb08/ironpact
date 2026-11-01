import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Exercise, Session } from '../../core/types.ts';
import { Button, HoldButton, copy, fill } from '../../ui';
import { ExercisePicker } from './ExercisePicker.tsx';
import { LoggingCard } from './LoggingCard.tsx';
import { SessionClock } from './SessionClock.tsx';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

export function ActiveSession({ session, onFinish }: { session: Session; onFinish: () => void }) {
  const repo = useRepo();
  const write = useSessionWrite();
  const [selection, setSelection] = useState<Exercise>();
  const [pickerOpen, setPickerOpen] = useState<boolean | null>(null);
  const snapshot = useLiveQuery(async () => {
    const [exercises, sets, history] = await Promise.all([
      repo.q.exercises(), repo.q.setsOfSession(session.id),
      repo.q.entriesBetween(session.user_id, '0000-01-01', session.local_date),
    ]);
    const previousSessions = history.sessions.filter((row) => row.kind === 'gym' && row.id !== session.id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    const previousSets = previousSessions.flatMap((row) => history.sets.filter((set) => set.session_id === row.id)
      .sort((a, b) => a.set_index - b.set_index));
    const pending = new Map(await Promise.all(sets.map(async (row) => [row.id, await repo.q.isPending(row.id)] as const)));
    return { exercises, sets, previousSets, pending };
  }, [repo, session.id, session.user_id, session.local_date]);

  if (!snapshot) return <main className="session-entry"><p role="status">{copy.sessionLoading}</p></main>;
  const initialId = snapshot.sets.at(-1)?.exercise_id ?? snapshot.previousSets[0]?.exercise_id;
  const selected = selection ?? snapshot.exercises.find((exercise) => exercise.id === initialId);
  const exercise = selected && snapshot.exercises.find((row) => row.id === selected.id);
  const currentSets = snapshot.sets.filter((row) => row.exercise_id === exercise?.id);
  const previous = snapshot.previousSets.filter((row) => row.exercise_id === exercise?.id);
  const lastSessionId = previous[0]?.session_id;

  return <main className="session-active">
    <header className="session-header">
      <h1>{copy.sessionTitle}</h1>
      <SessionClock startedAt={session.started_at} />
      <span>{fill(copy.sessionSetCount, { count: snapshot.sets.length })}</span>
    </header>
    <Button className="session-exercise" size="xl" variant="secondary" onClick={() => setPickerOpen(true)}>
      {exercise?.name ?? copy.sessionPickExercise}
    </Button>
    {exercise ? <LoggingCard key={exercise.id} session={session} exercise={exercise} sets={currentSets}
      previousSets={previous.filter((row) => row.session_id === lastSessionId)} pending={snapshot.pending}
      onNext={() => setPickerOpen(true)} onFinish={onFinish} />
      : <>
        <div className="session-empty"><p>{copy.emptyFloor}</p></div>
        <HoldButton size="xl" variant="secondary" holdMs={600} aria-label={copy.finish} disabled={write.busy}
          onHoldComplete={() => { void write.run(() => repo.w.finishSession(session.id), onFinish); }}>
          {copy.finish}
        </HoldButton>
        <WriteFeedback error={write.error} retry={write.retry} />
      </>}
    <ExercisePicker open={pickerOpen ?? !exercise} onClose={() => setPickerOpen(false)}
      onSelect={(row) => { setSelection(row); setPickerOpen(false); }} />
  </main>;
}
