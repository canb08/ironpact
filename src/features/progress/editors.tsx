import { useId, useState, type FormEvent } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { BodyweightEntry, CardioEntry, Exercise, MartialEntry, MinEntry, Session, SetRow } from '../../core/types.ts';
import { Button, HoldButton, copy, fill } from '../../ui';
import {
  parseMartial, parseMin, parseRun, parseSession, parseSet, parseWeight, writeErrorCopy,
  type MartialDraft, type MinDraft, type RunDraft, type SessionDraft, type SetDraft,
} from './form.ts';
import { formatDuration } from './parse.ts';
import { Field, NoteField, RpePicker, SaveRow } from './widgets.tsx';

export interface TrashItem {
  table: 'sessions' | 'sets' | 'cardio_entries' | 'martial_entries' | 'min_entries' | 'bodyweight_entries';
  id: string;
}

function fromSession(session: Session): SessionDraft {
  return {
    date: session.local_date,
    note: session.note ?? '',
    startedAt: session.started_at,
    endedAt: session.ended_at ?? '',
    sleep: session.readiness ? String(session.readiness.sleep) : '',
    soreness: session.readiness ? String(session.readiness.soreness) : '',
    energy: session.readiness ? String(session.readiness.energy) : '',
  };
}

function SessionFields({
  prefix, draft, onChange, show,
}: {
  prefix: string;
  draft: SessionDraft;
  onChange: (draft: SessionDraft) => void;
  show: boolean;
}) {
  const parsed = parseSession(draft);
  return (
    <>
      <Field id={`${prefix}-date`} type="date" label={copy.dateLabel} value={draft.date} onChange={(date) => onChange({ ...draft, date })} error={parsed.errors.date} show={show} testId="error-date" />
      <p className="progress-muted">{copy.moveDateHint}</p>
      <Field id={`${prefix}-started`} label={copy.startedAt} value={draft.startedAt} onChange={(startedAt) => onChange({ ...draft, startedAt })} error={parsed.errors.startedAt} show={show} testId="error-started" />
      <Field id={`${prefix}-ended`} label={copy.endedAt} value={draft.endedAt} onChange={(endedAt) => onChange({ ...draft, endedAt })} error={parsed.errors.endedAt} show={show} testId="error-ended" />
      <NoteField id={`${prefix}-session-note`} label={copy.sessionNoteLabel} value={draft.note} onChange={(note) => onChange({ ...draft, note })} over={parsed.noteOver} show={show} max={200} />
      <Field id={`${prefix}-sleep`} label={copy.sleep} value={draft.sleep} inputMode="numeric" onChange={(sleep) => onChange({ ...draft, sleep })} error={null} show={show} testId="error-sleep" />
      <Field id={`${prefix}-soreness`} label={copy.soreness} value={draft.soreness} inputMode="numeric" onChange={(soreness) => onChange({ ...draft, soreness })} error={null} show={show} testId="error-soreness" />
      <Field id={`${prefix}-energy`} label={copy.energy} value={draft.energy} inputMode="numeric" onChange={(energy) => onChange({ ...draft, energy })} error={null} show={show} testId="error-energy" />
      {show && parsed.errors.readiness ? <p className="progress-error" role="alert" data-testid="error-readiness">{parsed.errors.readiness}</p> : null}
    </>
  );
}

function useServer() {
  const [server, setServer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  return { server, setServer, saving, setSaving, attempted, setAttempted };
}

export function RunSession({
  session, rows, routeDate, onMoved, onRefresh, onTrash,
}: {
  session: Session;
  rows: CardioEntry[];
  routeDate: string;
  onMoved: (date: string) => void;
  onRefresh: () => void;
  onTrash: (items: TrashItem[]) => void;
}) {
  const repo = useRepo();
  const rpeId = useId();
  const status = useServer();
  const [sessionDraft, setSessionDraft] = useState(() => fromSession(session));
  const [drafts, setDrafts] = useState<Record<string, RunDraft>>(() => Object.fromEntries(rows.map((row) => [row.id, {
    km: String(row.distance_m / 1000),
    duration: formatDuration(row.duration_s),
    note: row.note ?? '',
    rpe: row.rpe,
  }])));
  const sessionParsed = parseSession(sessionDraft);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    status.setAttempted(true);
    status.setServer(null);
    const parsedRows = rows.map((row) => ({ row, parsed: parseRun(drafts[row.id] ?? { km: '', duration: '', note: '', rpe: null }) }));
    if (!sessionParsed.patch || parsedRows.some((item) => item.parsed.value === null)) return;
    const patch = sessionParsed.patch;
    status.setSaving(true);
    try {
      for (const item of parsedRows) {
        if (!item.parsed.value) return;
        const result = await repo.w.updateEntry('cardio_entries', item.row.id, { ...item.parsed.value, local_date: patch.local_date });
        if (!result.ok) {
          status.setServer(writeErrorCopy(result.error));
          return;
        }
      }
      const saved = await repo.w.updateSession(session.id, patch);
      if (!saved.ok) {
        status.setServer(writeErrorCopy(saved.error));
        return;
      }
      if (patch.local_date !== routeDate) onMoved(patch.local_date);
      else onRefresh();
    } finally {
      status.setSaving(false);
    }
  }

  return (
    <section className="progress-card" aria-label={copy.run}>
      <h2>{copy.run}</h2>
      <form className="progress-form" onSubmit={(event) => { void onSubmit(event); }}>
        {rows.map((row) => {
          const draft = drafts[row.id] ?? { km: '', duration: '', note: '', rpe: null };
          const parsed = parseRun(draft);
          const write = (next: RunDraft) => setDrafts((current) => ({ ...current, [row.id]: next }));
          return (
            <div key={row.id} className="progress-field">
              <Field id={`km-${row.id}`} label={copy.distance} value={draft.km} inputMode="decimal" onChange={(km) => write({ ...draft, km })} error={parsed.errors.distance} show={status.attempted} testId="error-distance" />
              <p className="progress-muted">{copy.km}</p>
              <Field id={`duration-${row.id}`} label={copy.duration} value={draft.duration} inputMode="numeric" onChange={(duration) => write({ ...draft, duration })} error={parsed.errors.duration} show={status.attempted} testId="error-duration" />
              <p className="progress-muted">{copy.durationHint}</p>
              <RpePicker labelId={`${rpeId}-${row.id}`} value={draft.rpe} onChange={(rpe) => write({ ...draft, rpe })} />
              <NoteField id={`note-${row.id}`} label={copy.note} value={draft.note} onChange={(note) => write({ ...draft, note })} over={parsed.noteOver} show={status.attempted} max={120} />
            </div>
          );
        })}
        <SessionFields prefix={`run-${session.id}`} draft={sessionDraft} onChange={setSessionDraft} show={status.attempted} />
        {status.server ? <p className="progress-error" role="alert">{status.server}</p> : null}
        <SaveRow saving={status.saving} />
      </form>
      {rows.map((row) => (
        <Button key={row.id} variant="secondary" className="progress-danger" onClick={() => onTrash(entryTrash(session, 'cardio_entries', row.id, rows.length + 0))}>
          {fill(copy.deleteEntry, { name: copy.run })}
        </Button>
      ))}
      <SessionHold session={session} sets={[]} cardio={rows} martial={[]} min={[]} onTrash={onTrash} />
    </section>
  );
}

function entryTrash(session: Session, table: TrashItem['table'], id: string, siblings: number): TrashItem[] {
  const items: TrashItem[] = [{ table, id }];
  if (siblings <= 1) items.push({ table: 'sessions', id: session.id });
  return items;
}

export function MartialSession({
  session, rows, routeDate, onMoved, onRefresh, onTrash,
}: {
  session: Session;
  rows: MartialEntry[];
  routeDate: string;
  onMoved: (date: string) => void;
  onRefresh: () => void;
  onTrash: (items: TrashItem[]) => void;
}) {
  const repo = useRepo();
  const rpeId = useId();
  const status = useServer();
  const [sessionDraft, setSessionDraft] = useState(() => fromSession(session));
  const [drafts, setDrafts] = useState<Record<string, MartialDraft>>(() => Object.fromEntries(rows.map((row) => [row.id, {
    discipline: row.discipline,
    minutes: String(row.duration_min),
    rounds: row.rounds === null ? '' : String(row.rounds),
    note: row.note ?? '',
    rpe: row.rpe,
  }])));
  const sessionParsed = parseSession(sessionDraft);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    status.setAttempted(true);
    status.setServer(null);
    const parsedRows = rows.map((row) => ({ row, parsed: parseMartial(drafts[row.id] ?? { discipline: '', minutes: '', rounds: '', note: '', rpe: null }) }));
    if (!sessionParsed.patch || parsedRows.some((item) => item.parsed.value === null)) return;
    const patch = sessionParsed.patch;
    status.setSaving(true);
    try {
      for (const item of parsedRows) {
        if (!item.parsed.value) return;
        const result = await repo.w.updateEntry('martial_entries', item.row.id, { ...item.parsed.value, local_date: patch.local_date });
        if (!result.ok) {
          status.setServer(writeErrorCopy(result.error));
          return;
        }
      }
      const saved = await repo.w.updateSession(session.id, patch);
      if (!saved.ok) {
        status.setServer(writeErrorCopy(saved.error));
        return;
      }
      if (patch.local_date !== routeDate) onMoved(patch.local_date);
      else onRefresh();
    } finally {
      status.setSaving(false);
    }
  }

  return (
    <section className="progress-card" aria-label={copy.martialArts}>
      <h2>{copy.martialArts}</h2>
      <form className="progress-form" onSubmit={(event) => { void onSubmit(event); }}>
        {rows.map((row) => {
          const draft = drafts[row.id] ?? { discipline: '', minutes: '', rounds: '', note: '', rpe: null };
          const parsed = parseMartial(draft);
          const write = (next: MartialDraft) => setDrafts((current) => ({ ...current, [row.id]: next }));
          return (
            <div key={row.id}>
              <Field id={`discipline-${row.id}`} label={copy.discipline} value={draft.discipline} onChange={(discipline) => write({ ...draft, discipline })} error={parsed.errors.discipline} show={status.attempted} testId="error-discipline" />
              <Field id={`minutes-${row.id}`} label={copy.minutes} value={draft.minutes} inputMode="numeric" onChange={(minutes) => write({ ...draft, minutes })} error={parsed.errors.minutes} show={status.attempted} testId="error-minutes" />
              <Field id={`rounds-${row.id}`} label={copy.rounds} value={draft.rounds} inputMode="numeric" onChange={(rounds) => write({ ...draft, rounds })} error={parsed.errors.rounds} show={status.attempted} testId="error-rounds" />
              <RpePicker labelId={`${rpeId}-${row.id}`} value={draft.rpe} onChange={(rpe) => write({ ...draft, rpe })} />
              <NoteField id={`mnote-${row.id}`} label={copy.note} value={draft.note} onChange={(note) => write({ ...draft, note })} over={parsed.noteOver} show={status.attempted} max={120} />
            </div>
          );
        })}
        <SessionFields prefix={`martial-${session.id}`} draft={sessionDraft} onChange={setSessionDraft} show={status.attempted} />
        {status.server ? <p className="progress-error" role="alert">{status.server}</p> : null}
        <SaveRow saving={status.saving} />
      </form>
      {rows.map((row) => (
        <Button key={row.id} variant="secondary" className="progress-danger" onClick={() => onTrash(entryTrash(session, 'martial_entries', row.id, rows.length))}>
          {fill(copy.deleteEntry, { name: copy.martialArts })}
        </Button>
      ))}
      <SessionHold session={session} sets={[]} cardio={[]} martial={rows} min={[]} onTrash={onTrash} />
    </section>
  );
}

export function MinSession({
  session, rows, routeDate, onMoved, onRefresh, onTrash,
}: {
  session: Session;
  rows: MinEntry[];
  routeDate: string;
  onMoved: (date: string) => void;
  onRefresh: () => void;
  onTrash: (items: TrashItem[]) => void;
}) {
  const repo = useRepo();
  const status = useServer();
  const [sessionDraft, setSessionDraft] = useState(() => fromSession(session));
  const [drafts, setDrafts] = useState<Record<string, MinDraft>>(() => Object.fromEntries(rows.map((row) => [row.id, {
    description: row.description,
    minutes: row.duration_min === null ? '' : String(row.duration_min),
  }])));
  const sessionParsed = parseSession(sessionDraft);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    status.setAttempted(true);
    status.setServer(null);
    const parsedRows = rows.map((row) => ({ row, parsed: parseMin(drafts[row.id] ?? { description: '', minutes: '' }) }));
    if (!sessionParsed.patch || parsedRows.some((item) => item.parsed.value === null)) return;
    const patch = sessionParsed.patch;
    status.setSaving(true);
    try {
      for (const item of parsedRows) {
        if (!item.parsed.value) return;
        const result = await repo.w.updateEntry('min_entries', item.row.id, { ...item.parsed.value, local_date: patch.local_date });
        if (!result.ok) {
          status.setServer(writeErrorCopy(result.error));
          return;
        }
      }
      const saved = await repo.w.updateSession(session.id, patch);
      if (!saved.ok) {
        status.setServer(writeErrorCopy(saved.error));
        return;
      }
      if (patch.local_date !== routeDate) onMoved(patch.local_date);
      else onRefresh();
    } finally {
      status.setSaving(false);
    }
  }

  return (
    <section className="progress-card" aria-label={copy.min}>
      <h2>{copy.min}</h2>
      <form className="progress-form" onSubmit={(event) => { void onSubmit(event); }}>
        {rows.map((row) => {
          const draft = drafts[row.id] ?? { description: '', minutes: '' };
          const parsed = parseMin(draft);
          const write = (next: MinDraft) => setDrafts((current) => ({ ...current, [row.id]: next }));
          return (
            <div key={row.id}>
              <Field id={`min-${row.id}`} label={copy.minLabel} value={draft.description} onChange={(description) => write({ ...draft, description })} error={parsed.errors.description} show={status.attempted} testId="error-min" />
              <Field id={`min-minutes-${row.id}`} label={copy.minutes} value={draft.minutes} inputMode="numeric" onChange={(minutes) => write({ ...draft, minutes })} error={parsed.errors.minutes} show={status.attempted} testId="error-minutes" />
            </div>
          );
        })}
        <SessionFields prefix={`min-${session.id}`} draft={sessionDraft} onChange={setSessionDraft} show={status.attempted} />
        {status.server ? <p className="progress-error" role="alert">{status.server}</p> : null}
        <SaveRow saving={status.saving} />
      </form>
      {rows.map((row) => (
        <Button key={row.id} variant="secondary" className="progress-danger" onClick={() => onTrash(entryTrash(session, 'min_entries', row.id, rows.length))}>
          {fill(copy.deleteEntry, { name: copy.min })}
        </Button>
      ))}
      <SessionHold session={session} sets={[]} cardio={[]} martial={[]} min={rows} onTrash={onTrash} />
    </section>
  );
}

export function GymSession({
  session, sets, exercises, routeDate, onMoved, onRefresh, onTrash, label = copy.gym,
}: {
  session: Session;
  sets: SetRow[];
  exercises: readonly Exercise[];
  routeDate: string;
  onMoved: (date: string) => void;
  onRefresh: () => void;
  onTrash: (items: TrashItem[]) => void;
  label?: string;
}) {
  const repo = useRepo();
  const status = useServer();
  const [draft, setDraft] = useState(() => fromSession(session));
  const parsed = parseSession(draft);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    status.setAttempted(true);
    status.setServer(null);
    if (!parsed.patch) return;
    status.setSaving(true);
    try {
      const saved = await repo.w.updateSession(session.id, parsed.patch);
      if (!saved.ok) {
        status.setServer(writeErrorCopy(saved.error));
        return;
      }
      if (parsed.patch.local_date !== routeDate) onMoved(parsed.patch.local_date);
      else onRefresh();
    } finally {
      status.setSaving(false);
    }
  }

  return (
    <section className="progress-card" aria-label={label}>
      <h2>{label}</h2>
      <form className="progress-form" onSubmit={(event) => { void onSubmit(event); }}>
        <SessionFields prefix={`gym-${session.id}`} draft={draft} onChange={setDraft} show={status.attempted} />
        {status.server ? <p className="progress-error" role="alert">{status.server}</p> : null}
        <SaveRow saving={status.saving} />
      </form>
      {sets.map((set) => (
        <SetEditor key={`${set.id}:${set.client_updated_at}`} set={set} exercise={exercises.find((exercise) => exercise.id === set.exercise_id)} onRefresh={onRefresh} onTrash={onTrash} />
      ))}
      <SessionHold session={session} sets={sets} cardio={[]} martial={[]} min={[]} onTrash={onTrash} />
    </section>
  );
}

function SetEditor({
  set, exercise, onRefresh, onTrash,
}: {
  set: SetRow;
  exercise: Exercise | undefined;
  onRefresh: () => void;
  onTrash: (items: TrashItem[]) => void;
}) {
  const repo = useRepo();
  const rpeId = useId();
  const status = useServer();
  const kind = exercise?.kind === 'bw_lift' ? 'bw_lift' : 'lift';
  const [draft, setDraft] = useState<SetDraft>({
    kg: String(set.weight_kg),
    reps: String(set.reps),
    note: set.note ?? '',
    rpe: set.rpe,
    warmup: set.is_warmup,
  });
  const parsed = parseSet(draft, kind);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    status.setAttempted(true);
    status.setServer(null);
    if (!parsed.value) return;
    status.setSaving(true);
    try {
      const result = await repo.w.updateSet(set.id, parsed.value);
      if (!result.ok) {
        status.setServer(writeErrorCopy(result.error));
        return;
      }
      onRefresh();
    } finally {
      status.setSaving(false);
    }
  }

  return (
    <section aria-label={fill(copy.sessionSet, { index: set.set_index })}>
      <h3>{exercise?.name ?? copy.missingExercise}</h3>
      <form className="progress-form" onSubmit={(event) => { void onSubmit(event); }}>
        <Field id={`kg-${set.id}`} label={kind === 'bw_lift' ? copy.sessionAddedKg : copy.kg} value={draft.kg} inputMode="decimal" onChange={(kg) => setDraft({ ...draft, kg })} error={parsed.errors.kg} show={status.attempted} testId="error-kg" />
        <Field id={`reps-${set.id}`} label={copy.reps} value={draft.reps} inputMode="numeric" onChange={(reps) => setDraft({ ...draft, reps })} error={parsed.errors.reps} show={status.attempted} testId="error-reps" />
        <RpePicker labelId={rpeId} value={draft.rpe} onChange={(rpe) => setDraft({ ...draft, rpe })} />
        <Button aria-pressed={draft.warmup} variant={draft.warmup ? 'primary' : 'secondary'} onClick={() => setDraft({ ...draft, warmup: !draft.warmup })}>{copy.sessionWarmup}</Button>
        <NoteField id={`snote-${set.id}`} label={copy.note} value={draft.note} onChange={(note) => setDraft({ ...draft, note })} over={parsed.noteOver} show={status.attempted} max={120} />
        {status.server ? <p className="progress-error" role="alert">{status.server}</p> : null}
        <SaveRow saving={status.saving} />
      </form>
      <Button variant="secondary" className="progress-danger" onClick={() => onTrash([{ table: 'sets', id: set.id }])}>
        {fill(copy.deleteEntry, { name: fill(copy.sessionSet, { index: set.set_index }) })}
      </Button>
    </section>
  );
}

function SessionHold({
  session, sets, cardio, martial, min, onTrash,
}: {
  session: Session;
  sets: SetRow[];
  cardio: CardioEntry[];
  martial: MartialEntry[];
  min: MinEntry[];
  onTrash: (items: TrashItem[]) => void;
}) {
  const items: TrashItem[] = [
    ...sets.map((row) => ({ table: 'sets' as const, id: row.id })),
    ...cardio.map((row) => ({ table: 'cardio_entries' as const, id: row.id })),
    ...martial.map((row) => ({ table: 'martial_entries' as const, id: row.id })),
    ...min.map((row) => ({ table: 'min_entries' as const, id: row.id })),
    { table: 'sessions', id: session.id },
  ];
  return (
    <HoldButton variant="secondary" className="progress-danger" holdMs={600} aria-label={copy.holdDeleteSession} onHoldComplete={() => onTrash(items)}>
      {copy.holdDeleteSession}
    </HoldButton>
  );
}

export function WeightCard({
  row, routeDate, onMoved, onRefresh, onTrash,
}: {
  row: BodyweightEntry;
  routeDate: string;
  onMoved: (date: string) => void;
  onRefresh: () => void;
  onTrash: (items: TrashItem[]) => void;
}) {
  const repo = useRepo();
  const status = useServer();
  const [kg, setKg] = useState(String(row.weight_kg));
  const [measuredAt, setMeasuredAt] = useState(row.measured_at);
  const [date, setDate] = useState(row.local_date);
  const parsed = parseWeight({ kg, measuredAt, date });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    status.setAttempted(true);
    status.setServer(null);
    if (!parsed.value) return;
    status.setSaving(true);
    try {
      const result = await repo.w.updateEntry('bodyweight_entries', row.id, parsed.value);
      if (!result.ok) {
        status.setServer(writeErrorCopy(result.error));
        return;
      }
      if (parsed.value.local_date !== routeDate) onMoved(parsed.value.local_date);
      else onRefresh();
    } finally {
      status.setSaving(false);
    }
  }

  return (
    <section className="progress-card" aria-label={copy.weight}>
      <h2>{copy.weight}</h2>
      <form className="progress-form" onSubmit={(event) => { void onSubmit(event); }}>
        <Field id={`bw-${row.id}`} label={copy.weight} value={kg} inputMode="decimal" onChange={setKg} error={parsed.errors.kg} show={status.attempted} testId="error-weight" />
        <Field id={`bw-at-${row.id}`} label={copy.measuredAt} value={measuredAt} onChange={setMeasuredAt} error={parsed.errors.measuredAt} show={status.attempted} testId="error-measured" />
        <Field id={`bw-date-${row.id}`} type="date" label={copy.dateLabel} value={date} onChange={setDate} error={parsed.errors.date} show={status.attempted} testId="error-date" />
        <p className="progress-muted">{copy.moveDateHint}</p>
        {status.server ? <p className="progress-error" role="alert">{status.server}</p> : null}
        <SaveRow saving={status.saving} />
      </form>
      <Button variant="secondary" className="progress-danger" onClick={() => onTrash([{ table: 'bodyweight_entries', id: row.id }])}>
        {fill(copy.deleteEntry, { name: copy.weight })}
      </Button>
    </section>
  );
}
