import { useState } from 'react';
import type { FairComparison } from '../../core/duel.ts';
import { Button, copy, fill } from '../../ui';
import { formatFairPercent, formatRawKg, toggleRawKg } from './view.ts';

export interface FairRow {
  id: string;
  name: string;
  fair: FairComparison;
}

/** Relative % on the front page. Raw kg is one tap, and only one person at a time. */
export function FairList({ rows }: { rows: readonly FairRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="fair-list">
      {rows.map((row) => {
        const open = openId === row.id && row.fair.current != null;
        return (
          <li key={row.id}>
            <p>
              <span className="fair-name">{row.name}</span>{' '}
              {row.fair.state === 'building' || row.fair.percent == null
                ? copy.baselineBuilding
                : fill(copy.fairPercent, { percent: formatFairPercent(row.fair.percent) })}
            </p>
            {row.fair.state === 'ready' && row.fair.current != null ? (
              <Button variant="ghost" onClick={() => setOpenId((current) => toggleRawKg(current, row.id))}>
                {copy.showRawKg}
              </Button>
            ) : null}
            {open ? <p className="fair-raw">{fill(copy.rawKg, { kg: formatRawKg(row.fair.current ?? 0) })}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
