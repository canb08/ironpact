import type { EditNotice } from '../../data/adapter.ts';

export function shownNotice(notice: EditNotice | undefined): EditNotice | null {
  if (!notice || (!notice.prsChanged && !notice.barAdjusted)) return null;
  return notice;
}

export function mergeNotice(current: EditNotice, incoming: EditNotice | undefined): EditNotice {
  return {
    prsChanged: current.prsChanged || incoming?.prsChanged === true,
    barAdjusted: current.barAdjusted || incoming?.barAdjusted === true,
  };
}
