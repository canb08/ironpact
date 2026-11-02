import type { CrewPresence } from '../../data/duo.contract.ts';
import { copy, fill } from '../../ui/copy.ts';
import { presenceMinutes, presenceWork, visiblePresence } from './view.ts';

export function PresenceBanner({
  rows,
  names,
  colors,
  nowMs,
}: {
  rows: readonly CrewPresence[];
  names: ReadonlyMap<string, string>;
  colors: ReadonlyMap<string, string>;
  nowMs: number;
}) {
  const live = visiblePresence(rows, nowMs);
  if (live.length === 0) return null;
  return (
    <div className="presence-banner">
      {live.map((row) => {
        const partner = names.get(row.user_id) ?? copy.partner;
        const minutes = presenceMinutes(row, nowMs);
        const work = presenceWork(row);
        const text = work
          ? fill(copy.presenceBanner, { partner, work, minutes })
          : fill(copy.presenceQuiet, { partner, minutes });
        return (
          <p key={row.user_id} className="presence-row" data-testid="presence-banner" role="status">
            <span className="presence-dot" style={{ background: colors.get(row.user_id) ?? 'var(--text-muted)' }} aria-hidden="true" />
            {text}
          </p>
        );
      })}
    </div>
  );
}
