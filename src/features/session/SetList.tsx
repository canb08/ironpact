import { useRef } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { SetRow } from '../../core/types.ts';
import { Button, copy, fill, useToast } from '../../ui';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';

export function SetList({ sets, pending }: { sets: SetRow[]; pending: Map<string, boolean> }) {
  const repo = useRepo();
  const { showToast } = useToast();
  const write = useSessionWrite();
  const gesture = useRef<{ id: string; pointer: number; x: number; y: number } | null>(null);
  const remove = (row: SetRow) => {
    void write.run(() => repo.w.softDelete('sets', row.id), () => {
      showToast({ message: copy.sessionDeleted, timeoutMs: 8000, action: { label: copy.undo, onClick: () => {
        void write.run(() => repo.w.restore('sets', row.id), () => {});
      } } });
    });
  };
  return <section className="session-sets" aria-label={copy.sessionSets}>
    {sets.length === 0 && <p>{copy.sessionNoSets}</p>}
    <ol>
      {sets.map((row, index) => {
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
          <span className="session-set-value">{index + 1} · {row.reps} × {row.weight_kg} {copy.kg}
            {row.rpe !== null && <> · @{row.rpe}</>}
            {row.is_warmup && <span className="ui-chip">{copy.sessionWarmup}</span>}
          </span>
          <span className={onPhone ? 'session-tick session-tick--pending' : 'session-tick'}
            aria-label={onPhone ? copy.sessionSaved : copy.sessionSynced} title={onPhone ? copy.sessionSaved : copy.sessionSynced}>✓</span>
          <Button variant="ghost" size="xl" disabled={write.busy}
            aria-label={fill(copy.sessionDelete, { index: index + 1 })} onClick={() => remove(row)}>×</Button>
        </li>;
      })}
    </ol>
    <WriteFeedback error={write.error} retry={write.retry} />
  </section>;
}
