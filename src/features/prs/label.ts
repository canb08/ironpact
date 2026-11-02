import type { PrEventDraft } from '../../core/prs.ts';
import { copy, fill } from '../../ui/copy.ts';

export function prEyebrow(event: Pick<PrEventDraft, 'pr_type' | 'reps' | 'bucket_label'>): string {
  switch (event.pr_type) {
    case 'e1rm': return copy.prE1rm;
    case 'rep_max': return fill(copy.prRepMax, { reps: event.reps ?? 0 });
    case 'volume': return copy.prVolume;
    case 'distance': return copy.prLongestRun;
    case 'pace': return fill(copy.prFastest, { bucket: event.bucket_label ?? '' });
  }
}

export function formatPrKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
