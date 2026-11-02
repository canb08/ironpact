import { useId, useState, type FormEvent } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { Exercise, SetRow } from '../../core/types.ts';
import { Button, Chip, copy, fill } from '../../ui';
import { parseSet, writeErrorCopy, type SetDraft } from './form.ts';
import { Field, NoteField, RpePicker, SaveRow } from './widgets.tsx';

export function HistorySet({
  set, exercise, onRefresh, onDelete,
}: {
  set: SetRow;
  exercise: Exercise;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = fill(copy.sessionSet, { index: set.set_index });
  return (
    <li>
      <section aria-label={label}>
        <p className="progress-set">
          <span>{fill(copy.setLine, { index: set.set_index, reps: set.reps, kg: set.weight_kg })}</span>
          {set.rpe !== null ? <span>@{set.rpe}</span> : null}
          {set.is_warmup ? <Chip>{copy.sessionWarmup}</Chip> : null}
        </p>
        <div className="progress-actions">
          <Button aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
            {fill(copy.editSet, { index: set.set_index })}
          </Button>
          <Button variant="secondary" className="progress-danger" onClick={() => onDelete(set.id)}>
            {fill(copy.deleteEntry, { name: label })}
          </Button>
        </div>
        {editing ? (
          <SetForm
            set={set}
            kind={exercise.kind === 'bw_lift' ? 'bw_lift' : 'lift'}
            onSaved={() => {
              setEditing(false);
              onRefresh();
            }}
          />
        ) : null}
      </section>
    </li>
  );
}

function SetForm({
  set, kind, onSaved,
}: {
  set: SetRow;
  kind: 'lift' | 'bw_lift';
  onSaved: () => void;
}) {
  const repo = useRepo();
  const rpeId = useId();
  const [draft, setDraft] = useState<SetDraft>({
    kg: String(set.weight_kg),
    reps: String(set.reps),
    note: set.note ?? '',
    rpe: set.rpe,
    warmup: set.is_warmup,
  });
  const [attempted, setAttempted] = useState(false);
  const [server, setServer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = parseSet(draft, kind);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServer(null);
    if (!parsed.value) return;
    setSaving(true);
    try {
      const result = await repo.w.updateSet(set.id, parsed.value);
      if (!result.ok) {
        setServer(writeErrorCopy(result.error));
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="progress-form" onSubmit={(event) => { void onSubmit(event); }}>
      <Field id={`kg-${set.id}`} label={kind === 'bw_lift' ? copy.sessionAddedKg : copy.kg} value={draft.kg} inputMode="decimal" onChange={(kg) => setDraft({ ...draft, kg })} error={parsed.errors.kg} show={attempted} testId="error-kg" />
      <Field id={`reps-${set.id}`} label={copy.reps} value={draft.reps} inputMode="numeric" onChange={(reps) => setDraft({ ...draft, reps })} error={parsed.errors.reps} show={attempted} testId="error-reps" />
      <RpePicker labelId={rpeId} value={draft.rpe} onChange={(rpe) => setDraft({ ...draft, rpe })} />
      <Button aria-pressed={draft.warmup} variant={draft.warmup ? 'primary' : 'secondary'} onClick={() => setDraft({ ...draft, warmup: !draft.warmup })}>{copy.sessionWarmup}</Button>
      <NoteField id={`snote-${set.id}`} label={copy.note} value={draft.note} onChange={(note) => setDraft({ ...draft, note })} over={parsed.noteOver} show={attempted} max={120} />
      {server ? <p className="progress-error" role="alert">{server}</p> : null}
      <SaveRow saving={saving} />
    </form>
  );
}
