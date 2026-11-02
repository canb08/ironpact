import { useState } from 'react';
import { readinessCheck } from '../../core/readiness.ts';
import type { Readiness } from '../../core/types.ts';
import { Button, copy, fill } from '../../ui';

type Level = 1 | 2 | 3;
type RowKey = 'sleep' | 'soreness' | 'energy';

const ROWS: readonly { key: RowKey; label: string }[] = [
  { key: 'sleep', label: copy.readinessSleep },
  { key: 'soreness', label: copy.readinessSoreness },
  { key: 'energy', label: copy.readinessEnergy },
];

const LEVELS: readonly { value: Level; label: string }[] = [
  { value: 1, label: copy.readinessLow },
  { value: 2, label: copy.readinessMid },
  { value: 3, label: copy.readinessHigh },
];

function Face({ level }: { level: Level }) {
  const mouth = level === 1 ? 'M8 17c1.2-1.6 2.5-2.2 4-2.2s2.8.6 4 2.2'
    : level === 2 ? 'M8 16h8'
    : 'M8 15c1.2 1.6 2.5 2.2 4 2.2s2.8-.6 4-2.2';
  return <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
    <path d={mouth} fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>;
}

function chosen(value: Partial<Record<RowKey, Level>>): Readiness | null {
  const sleep = value.sleep;
  const soreness = value.soreness;
  const energy = value.energy;
  if (sleep == null || soreness == null || energy == null) return null;
  return { sleep, soreness, energy };
}

export function ReadinessPanel({ busy, onSkip, onGo, onFullSend, onDoMin }: {
  busy: boolean;
  onSkip: () => void;
  onGo: (value: Readiness) => void;
  onFullSend: (value: Readiness) => void;
  onDoMin: (value: Readiness) => void;
}) {
  const [value, setValue] = useState<Partial<Record<RowKey, Level>>>({});
  const readiness = chosen(value);
  const low = readiness != null && readinessCheck(readiness).suggestMin;

  return <section className="session-readiness" aria-label={copy.readinessTitle}>
    <p className="session-readiness-kicker">{copy.readinessEyebrow}</p>
    <h2>{copy.readinessTitle}</h2>
    {ROWS.map((row) => <div key={row.key} className="session-readiness-row" role="group" aria-label={row.label}>
      {LEVELS.map((level) => <Button key={level.value} size="xl" variant="secondary" disabled={busy}
        aria-pressed={value[row.key] === level.value}
        aria-label={fill(copy.readinessChoice, { row: row.label, level: level.label })}
        onClick={() => setValue((current) => ({ ...current, [row.key]: level.value }))}>
        <Face level={level.value} />
      </Button>)}
    </div>)}
    {low && readiness ? <>
      <p>{copy.readinessMin}</p>
      <p>{copy.minDayStill}</p>
      <div className="session-readiness-actions">
        <Button size="xl" disabled={busy} onClick={() => onDoMin(readiness)}>{copy.doMin}</Button>
        <Button size="xl" variant="secondary" disabled={busy} onClick={() => onFullSend(readiness)}>{copy.fullSend}</Button>
      </div>
    </> : <div className="session-readiness-actions">
      <Button size="xl" variant="secondary" disabled={busy} onClick={onSkip}>{copy.skip}</Button>
      <Button size="xl" disabled={busy || readiness == null} onClick={() => { if (readiness) onGo(readiness); }}>{copy.readinessGo}</Button>
    </div>}
  </section>;
}
