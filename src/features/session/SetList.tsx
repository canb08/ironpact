import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Exercise, SetRow } from '../../core/types.ts';
import { Button, Sheet, Stepper, copy, fill, useToast } from '../../ui';
import { uiSchemas } from '../../core/validate.ts';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

export function SetList({ sets, exercises, pending, freshId, onDeleted }: {
  sets: SetRow[];
  exercises: Exercise[];
  pending: Map<string, boolean>;
  freshId?: string | null;
  onDeleted?: (row: SetRow) => void;
}) {
  const repo = useRepo();
  const [editing, setEditing] = useState<SetRow | null>(null);
  const [invalid, setInvalid] = useState(false);
  const sessionId = sets[0]?.session_id;
  const prs = useLiveQuery(() => sessionId ? repo.q.prEvents({ sessionId }) : [], [repo, sessionId]);
  const groups = [...new Set(sets.map((row) => row.exercise_id))];
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
  return <><section className="session-sets" aria-label={copy.sessionSets} tabIndex={0}>
    {sets.length === 0 && <p>{copy.sessionNoSets}</p>}
    {groups.map((exerciseId) => <section className="session-set-group" key={exerciseId}>
      <h2>{exercises.find((exercise) => exercise.id === exerciseId)?.name}</h2>
      <ol>{sets.filter((row) => row.exercise_id === exerciseId).map((row, index) => {
        const onPhone = pending.get(row.id) !== false || !row.updated_at;
        return <li className="session-set-row" key={row.id} aria-label={fill(copy.sessionSet, { index: index + 1 })}
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
            const dx = start.x - event.clientX;
            const dy = Math.abs(start.y - event.clientY);
            if (dx >= 64 && dx > dy * 1.5) remove(row);
          }}>
          <span className="session-set-value"><span className="session-set-index">{index + 1}</span> {row.weight_kg} {copy.kg} × {row.reps}
            {row.rpe !== null && <small>{fill(copy.sessionRpeValue, { value: row.rpe })}</small>}
            {prs?.some((event) => event.source_id === row.id) && <span className="session-pr">{copy.x4Pr}</span>}
            {row.is_warmup && <span className="ui-chip">{copy.sessionWarmup}</span>}
          </span>
          <span className={onPhone ? 'session-tick session-tick--pending' : 'session-tick'}
            aria-label={onPhone ? copy.sessionSaved : copy.sessionSynced} title={onPhone ? copy.sessionSaved : copy.sessionSynced}>✓</span>
          {freshId === row.id && <Button className="session-undo" size="xl" variant="secondary" disabled={write.busy}
            onClick={() => remove(row)}>{copy.undo}</Button>}
          <Button variant="ghost" aria-label={fill(copy.x4SetOptions, { index: index + 1 })} onClick={() => { setEditing(row); setInvalid(false); }}>⋯</Button>
          <Button className="session-delete" variant="ghost" disabled={write.busy}
            aria-label={fill(copy.sessionDelete, { index: index + 1 })} onClick={() => remove(row)}>×</Button>
        </li>;
      })}
    </ol></section>)}
    <WriteFeedback error={write.error} retry={write.retry} />
  </section>
    <Sheet open={editing !== null} title={copy.x4EditTitle} onClose={() => setEditing(null)}>
      {editing && <form className="session-edit" noValidate onSubmit={(event) => {
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
        <Button variant="secondary" disabled={write.busy} onClick={() => remove(editing)}>{fill(copy.sessionDelete, { index: sets.filter((row) => row.exercise_id === editing.exercise_id).findIndex((row) => row.id === editing.id) + 1 })}</Button>
      </form>}
    </Sheet>
  </>;
}
