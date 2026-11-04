import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Exercise, SetRow } from '../../core/types.ts';
import { Button, Sheet, Stepper, copy, fill, useToast } from '../../ui';
import { SPRING_MS } from '../../ui/motion/springs.ts';
import { uiSchemas } from '../../core/validate.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { revealLatestSet } from './sessionViewport.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

export function SetList({ sets, exercises, currentExerciseId, onChangeExercise, pending, onDeleted, ghost, onRepeat, freshId, reduced, busy }: {
  ghost: { weight_kg: number; reps: number };
  onRepeat: (row: SetRow) => void;
  freshId: string | null;
  reduced: boolean;
  busy: boolean;
  sets: SetRow[];
  exercises: Exercise[];
  pending: Map<string, boolean>;
  currentExerciseId: string;
  onChangeExercise: () => void;
  onDeleted?: (row: SetRow) => void;
}) {
  const repo = useRepo();
  const [editing, setEditing] = useState<SetRow | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const list = useRef<HTMLElement>(null);
  const newestId = sets.filter((row) => row.exercise_id === currentExerciseId).at(-1)?.id;
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return;
    let frame = 0;
    const main = list.current?.closest('main');
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (main && !main.querySelector('.session-earlier[open]')) revealLatestSet(main);
        });
      });
    };
    reveal();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    if (main) observer?.observe(main);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [currentExerciseId, newestId]);
  const sessionId = sets[0]?.session_id;
  const prs = useLiveQuery(() => sessionId ? repo.q.prEvents({ sessionId }) : [], [repo, sessionId]);
  const groups = [...new Set(sets.map((row) => row.exercise_id))].filter((id) => id !== currentExerciseId);
  const { showToast } = useToast();
  const write = useSessionWrite();
  const gesture = useRef<{ id: string; pointer: number; x: number; y: number } | null>(null);
  const remove = (row: SetRow) => {
    void write.run(() => repo.w.softDelete('sets', row.id), () => {
      setEditing(null);
      onDeleted?.(row);
      showToast({ message: copy.undone, timeoutMs: 5000, action: { label: copy.undo, onClick: () => {
        void write.run(() => repo.w.restore('sets', row.id), () => {});
      } } });
    });
  };
  const renderRows = (exerciseId: string) => <ol>{sets.filter((row) => row.exercise_id === exerciseId).map((row, index) => {
        const onPhone = pending.get(row.id) !== false || !row.updated_at;
        return <li className={`session-set-row${row.id === freshId && !reduced ? ' session-set-row--land' : ''}`} style={{ animationDuration: `${SPRING_MS.slam * (.75 + Math.min(500, Math.max(0, row.weight_kg)) / 500)}ms` }} key={row.id} aria-label={fill(copy.sessionSet, { index: index + 1 })}
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
            gesture.current = { id: row.id, pointer: event.pointerId, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerCancel={() => { gesture.current = null; }}
          onLostPointerCapture={() => { gesture.current = null; }}
          onPointerUp={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (!start || start.id !== row.id || start.pointer !== event.pointerId) return;
            const dx = event.clientX - start.x;
            const dy = Math.abs(start.y - event.clientY);
            if (busy || write.busy || Math.abs(dx) < 64 || Math.abs(dx) <= dy * 1.5) return;
            if (dx > 0) onRepeat(row);
            else { setEditing(row); setEditOpen(true); setInvalid(false); }
          }}>
          <span className="session-set-value"><span className="session-set-index">{index + 1}</span> {row.weight_kg} {copy.kg} × {row.reps}
            {row.rpe !== null && <span className="session-set-rpe">{fill(copy.sessionRpeValue, { value: row.rpe })}</span>}
            {prs?.some((event) => event.source_id === row.id) && <span className="session-pr">{copy.x4Pr}</span>}
            {row.is_warmup && <span className="ui-chip">{copy.sessionWarmup}</span>}
          </span>
          <span className="session-sync-status" aria-label={onPhone ? copy.sessionSaved : copy.sessionSynced}>{onPhone ? copy.sessionSaved : copy.sessionSynced}</span>
          <Button variant="ghost" aria-label={fill(copy.x4SetOptions, { index: index + 1 })} onClick={() => { setEditing(row); setEditOpen(false); setInvalid(false); }}>⋯</Button>
        </li>;
      })}
    </ol>;
  return <><section ref={list} className="session-sets" aria-label={copy.sessionSets} tabIndex={0}>
    {groups.map((exerciseId) => {
      const rows = sets.filter((row) => row.exercise_id === exerciseId);
      const best = [...rows].filter((row) => !row.is_warmup).sort((a, b) => b.weight_kg * (1 + b.reps / 30) - a.weight_kg * (1 + a.reps / 30))[0];
      const exercise = exercises.find((row) => row.id === exerciseId)?.name ?? copy.sessionPickExercise;
      const count = rows.length === 1 ? copy.x4SetOne : fill(copy.x4SetCount, { count: rows.length });
      return <details className="session-earlier" key={exerciseId}>
        <summary>{best ? fill(copy.x4EarlierExercise, { exercise, sets: count, kg: best.weight_kg, reps: best.reps }) : fill(copy.x4EarlierExerciseNoBest, { exercise, sets: count })}</summary>
        {renderRows(exerciseId)}
      </details>;
    })}
    <section className="session-set-group" data-current-exercise={currentExerciseId}>
      <div className="session-exercise">
        <h2>{exercises.find((row) => row.id === currentExerciseId)?.name ?? copy.sessionPickExercise}</h2>
        <Button className="session-change" variant="secondary" onClick={onChangeExercise}>{copy.x4Change}</Button>
      </div>
      {newestId ? renderRows(currentExerciseId) : <p>{copy.sessionNoSets}</p>}
      <div className="session-ghost" role="group" aria-label={copy.y3Ghost}>
        <span className="session-set-index">{sets.filter((row) => row.exercise_id === currentExerciseId).length + 1}</span>
        <span>{Number.isFinite(ghost.weight_kg) ? ghost.weight_kg : '—'} {copy.kg} × {ghost.reps}</span>
        <span className="session-ghost-label">{copy.y3Ghost}</span>
      </div>
    </section>
    <WriteFeedback error={write.error} retry={write.retry} />
  </section>
    <Sheet open={editing !== null} title={editOpen ? copy.x4EditTitle : copy.x4SetMenu} onClose={() => setEditing(null)}>
      {editing && !editOpen && <div className="session-set-menu">
        <Button variant="secondary" disabled={busy || write.busy} onClick={() => { onRepeat(editing); setEditing(null); }}>{copy.y3SameAgain}</Button>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>{copy.x4Edit}</Button>
        <Button variant="secondary" disabled={write.busy} aria-label={fill(copy.sessionDelete, { index: sets.filter((row) => row.exercise_id === editing.exercise_id).findIndex((row) => row.id === editing.id) + 1 })} onClick={() => remove(editing)}>{copy.x4Delete}</Button>
      </div>}
      {editing && editOpen && <form className="session-edit" noValidate onSubmit={(event) => {
        event.preventDefault();
        const kind = exercises.find((exercise) => exercise.id === editing.exercise_id)?.kind;
        const valid = (kind === 'bw_lift' ? uiSchemas.added_kg : uiSchemas.lift_kg).safeParse(editing.weight_kg).success
          && uiSchemas.reps.safeParse(editing.reps).success && (editing.rpe === null || uiSchemas.rpe.safeParse(editing.rpe).success);
        setInvalid(!valid);
        if (!valid) return;
        void write.run(() => repo.w.updateSet(editing.id, { weight_kg: editing.weight_kg, reps: editing.reps,
          rpe: editing.rpe, is_warmup: editing.is_warmup }), () => setEditing(null));
      }}>
        <Stepper label={copy.kg} value={editing.weight_kg} step={2.5} onChange={(weight_kg) => setEditing({ ...editing, weight_kg })} />
        <Stepper label={copy.reps} value={editing.reps} onChange={(reps) => setEditing({ ...editing, reps })} />
        <label>{copy.sessionRpe}<select value={editing.rpe ?? ''} onChange={(event) => setEditing({ ...editing, rpe: event.target.value === '' ? null : Number(event.target.value) })}>
          <option value="">{copy.sessionNoRpe}</option>
          {Array.from({ length: 11 }, (_, i) => 5 + i / 2).map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <Button variant="secondary" aria-pressed={editing.is_warmup} onClick={() => setEditing({ ...editing, is_warmup: !editing.is_warmup })}>{copy.sessionWarmup}</Button>
        {invalid && <p role="alert">{copy.outOfRange}</p>}
        <WriteFeedback error={write.error} retry={write.retry} />
        <Button type="submit" disabled={write.busy}>{copy.x4SaveSet}</Button>

      </form>}
    </Sheet>
  </>;
}
