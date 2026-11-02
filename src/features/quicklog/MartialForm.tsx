import type { MartialEntry } from '../../core/types.ts';
import { ClassLog } from './muaythai/ClassLog.tsx';

/** Muay Thai only. Older rows keep whatever discipline they were saved with. */
export function MartialForm({ onSaved }: { onSaved?: (entry: MartialEntry) => void }) {
  return <ClassLog onSaved={onSaved} />;
}
