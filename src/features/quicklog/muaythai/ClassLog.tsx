import { useState } from 'react';
import type { MartialEntry } from '../../../core/types.ts';
import { useRepo } from '../../../app/useRepo.ts';
import { Button, ScrubDial, copy, feel, fill } from '../../../ui';
import { useRepoQuery } from '../../floor/useRepoQuery.ts';
import {
  DEFAULT_COMBOS,
  DEFAULT_MINUTES,
  FEEL_OPTIONS,
  FOCUS_OPTIONS,
  LENGTH_OPTIONS,
  MINUTES_MAX,
  MINUTES_MIN,
  REPS_PER_ROUND,
  STRIKE_TOKENS,
  appendStrike,
  dropLastStrike,
  feelToRpe,
  formatClassNote,
  rpeToFeel,
  sameAsLast,
  struckRounds,
  type ClassFeel,
  type ClassFocus,
  type CombosPerHalf,
  type RoundLengthMin,
} from './classNote.ts';

const FOCUS_LABEL: Record<ClassFocus, string> = {
  Pads: copy.y2Pads,
  Bag: copy.y2Bag,
  Clinch: copy.y2Clinch,
  Technique: copy.y2Technique,
  Conditioning: copy.y2Conditioning,
};

export function ClassLog({ onSaved }: { onSaved?: (entry: MartialEntry) => void }) {
  const repo = useRepo();
  const last = useRepoQuery(async () => {
    const me = await repo.q.me();
    if (!me) return null;
    const entries = await repo.q.entriesBetween(me.id, '0000-01-01', '9999-12-31');
    const rows = entries.martial.filter((row) => row.deleted_at === null);
    rows.sort((a, b) => b.logged_at.localeCompare(a.logged_at) || b.id.localeCompare(a.id));
    return rows[0] ?? null;
  }, [repo]);

  const [combosPerHalf, setCombosPerHalf] = useState<CombosPerHalf>(DEFAULT_COMBOS);
  const [roundMin, setRoundMin] = useState<RoundLengthMin>(3);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [focus, setFocus] = useState<ClassFocus>('Pads');
  const [felt, setFelt] = useState<ClassFeel | null>(null);
  const [combos, setCombos] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [adjust, setAdjust] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const struck = struckRounds(combosPerHalf);
  const pushups = struck * REPS_PER_ROUND;
  const remembered = draft.trim() === '' ? combos : [...combos, draft.trim()];
  const note = formatClassNote(FOCUS_LABEL[focus], remembered);
  const padClass = focus === 'Pads';

  function applyLast() {
    if (!last) return;
    const next = sameAsLast(last);
    setCombosPerHalf(next.combosPerHalf);
    setRoundMin(next.roundMin);
    setMinutes(next.minutes);
    setFocus(next.focus);
    setFelt(rpeToFeel(last.rpe));
  }

  function addCombo() {
    const text = draft.trim();
    if (text === '') return;
    setCombos((current) => [...current, text]);
    setDraft('');
  }

  function save() {
    if (saving || saved) return;
    setSaving(true);
    setError(null);
    void repo.w.logMartial({
      discipline: copy.muayThai,
      duration_min: minutes,
      rounds: struck,
      rpe: feelToRpe(felt),
      note,
    }).then((result) => {
      if (!result.ok) {
        setError(result.error === 'storage_full' ? copy.storageFull : copy.outOfRange);
        return;
      }
      feel('plate');
      setSaved(true);
      onSaved?.(result.value);
    }).finally(() => setSaving(false));
  }

  return (
    <div className="mt-shell" data-testid="martial-log">
      <section className="mt-card" data-testid="class-card" aria-label={padClass ? copy.y2PadClass : FOCUS_LABEL[focus]}>
        <h3>{padClass ? copy.y2PadClass : FOCUS_LABEL[focus]}</h3>
        {padClass ? <p className="mt-quiet">{copy.y2Halves}</p> : null}
        {padClass ? <p className="mt-stat">{fill(copy.y2Shape, { combos: combosPerHalf, length: roundMin })}</p> : null}
        <p className="mt-stat" data-testid="class-rounds">
          {padClass ? fill(copy.y2Work, { struck, held: struck }) : fill(copy.y2RoundsOnly, { rounds: struck })}
        </p>
        <p className="mt-stat" data-testid="class-minutes">{fill(copy.y2About, { minutes })}</p>
        {padClass ? <p className="mt-stat" data-testid="class-body">{fill(copy.y2Body, { push: pushups, squat: pushups })}</p> : null}
        <p className="mt-quiet" data-testid="class-note">{note}</p>
      </section>
      {error ? <p className="ql-error" role="alert">{error}</p> : null}
      {saved ? <p role="status">{copy.summarySaved}</p> : (
        <Button size="xl" className="mt-hot ql-save" disabled={saving} onClick={save}>{copy.y2LogClass}</Button>
      )}
      <Button
        variant="quiet"
        className="mt-adjust-toggle"
        aria-expanded={adjust}
        onClick={() => setAdjust((open) => !open)}
      >
        {copy.y2Adjust}
      </Button>
      {adjust ? (
        <div className="mt-adjust">
          <ScrubDial
            label={copy.y2CombosHalf}
            value={combosPerHalf}
            min={2}
            max={4}
            step={1}
            onChange={(value) => {
              if (value === 2 || value === 3 || value === 4) setCombosPerHalf(value);
            }}
          />
          <p className="ql-unit" id="mt-length">{copy.y2RoundLength}</p>
          <div className="mt-chips" role="group" aria-labelledby="mt-length">
            {LENGTH_OPTIONS.map((min) => (
              <Button
                key={min}
                className="mt-hot"
                variant={roundMin === min ? 'primary' : 'secondary'}
                aria-pressed={roundMin === min}
                onClick={() => setRoundMin(min)}
              >
                {fill(copy.y2MinChip, { min })}
              </Button>
            ))}
          </div>
          <ScrubDial
            label={copy.y2Total}
            value={minutes}
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            step={1}
            onChange={(value) => setMinutes(Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, value)))}
          />
          <p className="ql-unit" id="mt-focus">{copy.y2Focus}</p>
          <div className="mt-chips" role="group" aria-labelledby="mt-focus">
            {FOCUS_OPTIONS.map((option) => (
              <Button
                key={option}
                className="mt-hot"
                variant={focus === option ? 'primary' : 'secondary'}
                aria-pressed={focus === option}
                onClick={() => setFocus(option)}
              >
                {FOCUS_LABEL[option]}
              </Button>
            ))}
          </div>
          <p className="ql-unit" id="mt-feel">{copy.y2Feel}</p>
          <div className="mt-chips" role="group" aria-labelledby="mt-feel">
            {FEEL_OPTIONS.map((value) => (
              <Button
                key={value}
                className="mt-hot"
                variant={felt === value ? 'primary' : 'secondary'}
                aria-pressed={felt === value}
                aria-label={fill(copy.y2FeelChip, { n: value })}
                onClick={() => setFelt((current) => (current === value ? null : value))}
              >
                {value}
              </Button>
            ))}
          </div>
          <p className="ql-unit" id="mt-combo">{copy.y2Remember}</p>
          <p className="mt-draft" data-testid="combo-draft">{draft}</p>
          {combos.length > 0 ? <p className="mt-quiet" data-testid="combo-list">{combos.join(' / ')}</p> : null}
          <div className="mt-chips" role="group" aria-labelledby="mt-combo">
            {STRIKE_TOKENS.map((token) => (
              <Button key={token} className="mt-hot" variant="secondary" onClick={() => setDraft((current) => appendStrike(current, token))}>
                {token}
              </Button>
            ))}
          </div>
          <div className="mt-chips">
            <Button className="mt-hot" variant="secondary" onClick={addCombo}>{copy.y2Add}</Button>
            <Button className="mt-hot" variant="secondary" onClick={() => setDraft((current) => dropLastStrike(current))}>{copy.y2Undo}</Button>
            <Button className="mt-hot" variant="secondary" onClick={() => setDraft('')}>{copy.y2Clear}</Button>
          </div>
          <Button variant="secondary" className="mt-hot" disabled={!last} onClick={applyLast}>{copy.y2Same}</Button>
          {last === null ? <p className="ql-unit">{copy.y2NoClass}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
