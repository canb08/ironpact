import { useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Exercise } from '../../core/types.ts';
import { exerciseSchema } from '../../core/validate.ts';
import { Button, Sheet, copy, fill } from '../../ui';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';
import './session.css';

interface ExercisePickerProps {
  open: boolean;
  closeOnSelect?: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
}

const formSchema = exerciseSchema.pick({ name: true, export_label: true, kind: true, category: true, lower_body: true });
const isLift = (exercise: Exercise) => exercise.kind === 'lift' || exercise.kind === 'bw_lift';

export function ExercisePicker({ open, onClose, onSelect, closeOnSelect = true }: ExercisePickerProps) {
  const repo = useRepo();
  const id = useId();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [bodyweight, setBodyweight] = useState(false);
  const [isolation, setIsolation] = useState(false);
  const [lowerBody, setLowerBody] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const write = useSessionWrite();
  const catalogue = useLiveQuery(async () => {
    if (!open) return undefined;
    const [all, recent] = await Promise.all([repo.q.exercises(), repo.q.recentExercises(8)]);
    return { all: all.filter(isLift), recent: recent.filter(isLift) };
  }, [repo, open]);
  const query = search.trim().toLocaleLowerCase('en');
  const matches = (exercise: Exercise) => [exercise.name, exercise.export_label, ...exercise.aliases]
    .some((value) => value.toLocaleLowerCase('en').includes(query));
  const all = catalogue?.all.filter(matches) ?? [];
  const recent = catalogue?.recent.filter(matches) ?? [];
  const choose = (exercise: Exercise) => { onSelect(exercise); if (closeOnSelect) onClose(); };

  return <>
    <Sheet open={open && write.error !== 'storage_full'} onClose={onClose} title={copy.pickerTitle}>
      <div className="session-picker">
        <label htmlFor={`${id}-search`}>{copy.pickerSearch}</label>
        <input id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        {!catalogue && <p role="status">{copy.sessionLoading}</p>}
        {recent.length > 0 && <section aria-labelledby={`${id}-recent`}>
          <h3 id={`${id}-recent`}>{copy.x4Recent}</h3>
          <ul>{recent.map((exercise) => <li key={exercise.id}>
            <Button variant="secondary" onClick={() => choose(exercise)}>{exercise.name}</Button>
          </li>)}</ul>
        </section>}
        {(['lift', 'bw_lift'] as const).map((kind) => {
          const rows = all.filter((exercise) => exercise.kind === kind && !recent.some((row) => row.id === exercise.id));
          return rows.length > 0 && <section key={kind} aria-labelledby={`${id}-${kind}`}>
            <h3 id={`${id}-${kind}`}>{kind === 'lift' ? copy.x4Weighted : copy.x4Bodyweight}</h3>
            <ul>{rows.map((exercise) => <li key={exercise.id}>
              <Button variant="ghost" onClick={() => choose(exercise)}>{exercise.name}</Button>
            </li>)}</ul>
          </section>;
        })}
        {catalogue && all.length === 0 && <p role="status">{fill(copy.pickerNoMatch, { query: search.trim() })}</p>}
        {!creating ? <Button variant="secondary" onClick={() => {
          setName(search.trim());
          setLabel(Array.from(search.trim()).slice(0, 24).join(''));
          setCreating(true);
        }}>{copy.pickerCreate}</Button> : <form noValidate onSubmit={(event) => {
          event.preventDefault();
          const parsed = formSchema.safeParse({ name: name.trim(), export_label: label.trim(),
            kind: bodyweight ? 'bw_lift' : 'lift', category: isolation ? 'isolation' : 'compound', lower_body: lowerBody });
          setInvalid(!parsed.success);
          if (!parsed.success) return;
          void write.run(() => repo.w.createExercise(parsed.data), (exercise) => {
            setCreating(false);
            setSearch('');
            choose(exercise);
          });
        }}>
          <label htmlFor={`${id}-name`}>{copy.pickerName}</label>
          <input id={`${id}-name`} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          <label htmlFor={`${id}-label`}>{copy.pickerExportLabel}</label>
          <input id={`${id}-label`} value={label} maxLength={24} onChange={(event) => setLabel(event.target.value)} />
          <label className="session-toggle"><input type="checkbox" checked={bodyweight} onChange={(event) => setBodyweight(event.target.checked)} />{copy.pickerBodyweight}</label>
          <label className="session-toggle"><input type="checkbox" checked={isolation} onChange={(event) => setIsolation(event.target.checked)} />{copy.pickerIsolation}</label>
          <label className="session-toggle"><input type="checkbox" checked={lowerBody} onChange={(event) => setLowerBody(event.target.checked)} />{copy.pickerLowerBody}</label>
          {invalid && <p role="alert">{copy.pickerInvalid}</p>}
          <Button type="submit" disabled={write.busy}>{copy.pickerCreate}</Button>
        </form>}
        {write.error !== 'storage_full' && <WriteFeedback error={write.error} retry={write.retry} />}
      </div>
    </Sheet>
    {write.error === 'storage_full' && <WriteFeedback error={write.error} retry={write.retry} />}
  </>;
}
