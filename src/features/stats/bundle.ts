import type { PrEvent } from '../../data/adapter.ts';
import type { BodyweightEntry, CardioEntry, Exercise, MartialEntry, Profile, Session, SetRow } from '../../core/types.ts';
import type { TrendWindow } from './trend.ts';

export interface EntryBundle {
  sessions: Session[];
  sets: SetRow[];
  bodyweight: BodyweightEntry[];
  cardio: CardioEntry[];
  martial: MartialEntry[];
}

export interface ProgressData {
  me: Profile;
  window: TrendWindow;
  lifts: Exercise[];
  partners: Profile[];
  mine: EntryBundle;
  bundles: Map<string, EntryBundle>;
  prs: PrEvent[];
}

export function emptyBundle(): EntryBundle {
  return { sessions: [], sets: [], bodyweight: [], cardio: [], martial: [] };
}
