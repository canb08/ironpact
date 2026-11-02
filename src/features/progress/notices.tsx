import type { EditNotice } from '../../data/adapter.ts';
import { copy } from '../../ui';

export function EditNotices({ notice }: { notice: EditNotice | null }) {
  if (!notice) return null;
  return (
    <div className="progress-notices" role="status">
      {notice.prsChanged ? <p className="progress-muted">{copy.prsRecalculated}</p> : null}
      {notice.barAdjusted ? <p className="progress-muted">{copy.barAdjusted}</p> : null}
    </div>
  );
}
