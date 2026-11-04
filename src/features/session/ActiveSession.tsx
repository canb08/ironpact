import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import { guessNextExercise, guessOpeningExercise, prefillForExercise } from '../../core/prefill.ts';
import { progressionForExercise } from '../../core/progression.ts';
import { detectSessionVolumePrs, detectSetPr, type PrEventDraft, type PrHistory } from '../../core/prs.ts';
import { doMinPlan } from '../../core/readiness.ts';
import type { Exercise, Session, SetRow } from '../../core/types.ts';
import { setHapticsOn } from '../../platform/haptics.ts';
import { feel } from '../../ui/feel/feel.ts';
import { keepAwake, releaseKeepAwake } from '../../platform/wakeLock.ts';
import { HoldButton, copy, fill, useToast } from '../../ui';
import { PrCard } from '../prs/PrCard.tsx';
import { prEyebrow } from '../prs/label.ts';
import { defaultRestSeconds } from '../timer/restTimer.ts';
import { ExercisePicker } from './ExercisePicker.tsx';
import { LoggingCard } from './LoggingCard.tsx';
import { SessionClock } from './SessionClock.tsx';
import { idleEndedAt, toPrRow } from './sessionModel.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

function historyOf(session: Session, sessions: readonly Session[], sets: readonly SetRow[], extra: readonly SetRow[], cardio: PrHistory['cardio'], bodyweights: PrHistory['bodyweights'], exercises: readonly Exercise[]): PrHistory {
  const setMap = new Map<string, SetRow>();
  for (const set of [...sets, ...extra]) setMap.set(set.id, set);
  return {
    sessions: sessions.some((row) => row.id === session.id) ? [...sessions] : [...sessions, session],
    sets: [...setMap.values()],
    cardio: [...cardio],
    bodyweights: [...bodyweights],
    exercises: [...exercises],
  };
}

export function ActiveSession({ session, onFinish, initialExercise }: {
  session: Session;
  onFinish: (session: Session) => void;
  initialExercise?: Exercise | undefined;
}) {
  const repo = useRepo();
  const write = useSessionWrite();
  const { showToast } = useToast();
  const [selection, setSelection] = useState<Exercise | undefined>(initialExercise);
  const [pickerOpen, setPickerOpen] = useState<boolean | null>(null);
  const [card, setCard] = useState<PrEventDraft | null>(null);
  const [baseline, setBaseline] = useState(false);
  const [loggingBusy, setLoggingBusy] = useState(false);
  const closing = useRef(false);
  const seen = useRef(new Set<string>());
  const taken = useRef(new Set<string>());
  const setsRef = useRef<SetRow[]>([]);
  const finishRef = useRef(onFinish);
  const snapshot = useLiveQuery(async () => {
    const [exercises, sets, history, profile] = await Promise.all([
      repo.q.exercises(),
      repo.q.setsOfSession(session.id),
      repo.q.entriesBetween(session.user_id, '0000-01-01', '9999-12-31'),
      repo.q.me(),
    ]);
    const pending = new Map(await Promise.all(sets.map(async (row) => [row.id, await repo.q.isPending(row.id)] as const)));
    return { exercises, sets, history, profile, pending };
  }, [repo, session.id, session.user_id]);
  const logged = snapshot?.sets;
  const plan = snapshot && session.mode === 'min' ? doMinPlan({
    sessions: snapshot.history.sessions, sets: snapshot.history.sets, userId: session.user_id,
    excludeSessionId: session.id, exercises: snapshot.exercises,
    barKg: snapshot.profile?.bar_kg, platesKg: snapshot.profile?.plates_kg,
  }) : null;
  const opening = snapshot ? guessOpeningExercise({
    sessions: snapshot.history.sessions, sets: snapshot.history.sets, userId: session.user_id,
    excludeSessionId: session.id, today: session.local_date,
  }) : null;
  const initialId = logged?.at(-1)?.exercise_id ?? plan?.blocks[0]?.exercise_id ?? opening;
  const exerciseId = selection?.id ?? (snapshot ? initialId : null);
  const pref = useLiveQuery(async () => exerciseId ? repo.q.exercisePref(exerciseId) : undefined, [repo, exerciseId]);

  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { setsRef.current = logged ?? []; }, [logged]);
  useEffect(() => { void keepAwake(); return () => releaseKeepAwake(); }, []);
  useEffect(() => {
    if (!baseline) return;
    const timer = window.setTimeout(() => setBaseline(false), 10000);
    return () => window.clearTimeout(timer);
  }, [baseline]);
  useEffect(() => {
    if (snapshot?.profile) setHapticsOn(snapshot.profile.haptics_on);
  }, [snapshot?.profile]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const ended = idleEndedAt(session.started_at, setsRef.current.map((set) => set.logged_at), Date.now());
      if (!ended || closing.current) return;
      closing.current = true;
      void repo.w.updateSession(session.id, { ended_at: ended }).then((result) => {
        if (result.ok) finishRef.current(result.value);
        else closing.current = false;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [repo, session.id, session.started_at]);

  if (!snapshot) return <main className="session-active"><p role="status">{copy.sessionLoading}</p></main>;
  const exercise = selection ?? snapshot.exercises.find((row) => row.id === initialId);
  const focus = exercise && snapshot.exercises.find((row) => row.id === exercise.id);
  const history = historyOf(session, snapshot.history.sessions, snapshot.history.sets, snapshot.sets, snapshot.history.cardio, snapshot.history.bodyweight, snapshot.exercises);
  const nudge = focus == null ? null : progressionForExercise({
    exercise: focus, today: session.local_date, bigJumps: snapshot.profile?.big_jumps ?? false,
    sessions: history.sessions, sets: history.sets, userId: session.user_id, excludeSessionId: session.id,
  });
  const scripted = focus == null ? null : plan?.blocks.find((block) => block.exercise_id === focus.id)?.sets;
  const prefillSets = scripted ?? (focus == null ? [] : prefillForExercise({
    sessions: history.sessions, sets: history.sets, userId: session.user_id, excludeSessionId: session.id,
    exerciseId: focus.id, count: 20,
  }));
  const restSeconds = pref?.rest_s ?? defaultRestSeconds(focus?.category === 'isolation' ? 'isolation' : 'compound');
  const shown = card && snapshot.sets.some((set) => set.id === card.source_id) ? card : null;

  const noteSet = (row: SetRow) => {
    if (seen.current.has(row.id)) return;
    seen.current.add(row.id);
    const withRow: PrHistory = {
      ...history,
      sets: history.sets.some((set) => set.id === row.id) ? history.sets : [...history.sets, row],
    };
    const detected = detectSetPr(withRow, row.id);
    if (detected.kind === 'baseline') {
      const key = `ironpact.baseline-note.${session.user_id}.${row.exercise_id}`;
      try {
        if (!localStorage.getItem(key)) { setBaseline(true); localStorage.setItem(key, '1'); }
      } catch { setBaseline(true); }
      return;
    }
    if (detected.kind !== 'pr' || detected.event.pr_type === 'volume') return;
    const event = detected.event;
    void repo.w.recordPrEvents([toPrRow(event)]).then((result) => {
      if (!result.ok) return;
      const exerciseKey = event.exercise_id ?? row.exercise_id;
      if (taken.current.has(exerciseKey)) {
        showToast({ message: prEyebrow(event), timeoutMs: 4000 });
        return;
      }
      taken.current.add(exerciseKey);
      setCard(event);
      feel('pr');
    });
  };

  const goNext = () => {
    if (!focus) { setPickerOpen(true); return; }
    const minNext = plan?.blocks.map((block) => block.exercise_id) ?? [];
    const scriptedNext = minNext[minNext.indexOf(focus.id) + 1];
    const guessed = scriptedNext ?? guessNextExercise({
      sessions: history.sessions, sets: history.sets, userId: session.user_id, excludeSessionId: session.id,
      currentExerciseId: focus.id, today: session.local_date,
    });
    const next = guessed ? snapshot.exercises.find((row) => row.id === guessed) : undefined;
    if (next && next.id !== focus.id) setSelection(next);
    else setPickerOpen(true);
  };

  const finish = () => {
    const badges = detectSessionVolumePrs(history, session.id).map(toPrRow);
    void write.run(async () => {
      if (badges.length > 0) {
        const result = await repo.w.recordPrEvents(badges);
        if (!result.ok) return result;
      }
      return repo.w.finishSession(session.id);
    }, onFinish);
  };

  return <main className="session-active">
    <header className="session-header">
      <h1>{copy.sessionTitle}</h1>
      <SessionClock startedAt={session.started_at} />
      <span>{snapshot.sets.length === 1 ? copy.x4SetOne : fill(copy.x4SetCount, { count: snapshot.sets.length })}</span>
      <HoldButton size="xl" variant="secondary" holdMs={600} aria-label={copy.x4FinishHold} disabled={write.busy || loggingBusy} onHoldComplete={finish}>
        {copy.x4Finish}{' '}<span className="session-hold-hint">{copy.x4Hold}</span>
      </HoldButton>

    </header>
    {baseline && <p className="session-baseline" role="status">{copy.x4Baseline}</p>}
    <WriteFeedback error={write.error} retry={write.retry} />
    {shown && <PrCard event={shown} onClose={() => setCard(null)} />}
    {focus ? <LoggingCard key={focus.id} session={session} exercise={focus} sets={snapshot.sets.filter((row) => row.exercise_id === focus.id)}
      barKg={snapshot.profile?.bar_kg ?? 20} platesKg={snapshot.profile?.plates_kg ?? [25, 20, 15, 10, 5, 2.5, 1.25]}
      reduceMotion={snapshot.profile?.reduce_motion} allSets={snapshot.sets} exercises={snapshot.exercises} bigJumps={snapshot.profile?.big_jumps ?? false}
      prefillSets={prefillSets} pending={snapshot.pending} restSeconds={restSeconds} nudge={nudge}
      onNext={goNext} onChangeExercise={() => setPickerOpen(true)} onLogged={noteSet} finishing={write.busy} onBusyChange={setLoggingBusy} />
      : <div className="session-empty"><p>{copy.sessionNoSets}</p></div>}
    <ExercisePicker open={pickerOpen ?? !focus} onClose={() => setPickerOpen(false)}
      onSelect={(row) => { setSelection(row); setPickerOpen(false); }} />
  </main>;
}
