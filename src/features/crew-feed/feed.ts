import { formatBodyweight, formatDuration, formatKg, formatKm } from '@shared/export-format.ts';
import type { BodyweightEntry, CardioEntry, Exercise, MartialEntry, MinEntry, Profile, SetRow } from '../../core/types.ts';
import type { FeedItem } from '../../data/adapter.ts';
import { copy, fill } from '../../ui/copy.ts';

export interface FeedEntry {
  id: string;
  user: string;
  items: FeedItem[];
}

export interface FeedDay {
  date: string;
  entries: FeedEntry[];
}

export interface HistoryRows {
  sets: SetRow[];
  cardio: CardioEntry[];
  martial: MartialEntry[];
  min: MinEntry[];
  bodyweight: BodyweightEntry[];
}

function loggedAt(item: FeedItem): string {
  return item.type === 'weight' ? item.row.measured_at : item.row.logged_at;
}

/** Latest 20 entries for the people given, grouped by day. Sets in one session stay together. */
export function groupFeed(items: FeedItem[], people: Profile[], options?: { selfId?: string | null }): FeedDay[] {
  const profiles = new Map(people.map((person) => [person.id, person]));
  const visible = items.filter((item) => {
    const profile = profiles.get(item.row.user_id);
    if (!profile || item.row.deleted_at) return false;
    if (item.type !== 'weight') return true;
    return profile.show_bodyweight === true || item.row.user_id === options?.selfId;
  });
  visible.sort((a, b) => loggedAt(b).localeCompare(loggedAt(a)) || a.row.id.localeCompare(b.row.id));
  const days = new Map<string, FeedDay>();
  const entries = new Map<string, FeedEntry>();
  for (const item of visible.slice(0, 20)) {
    let day = days.get(item.row.local_date);
    if (!day) {
      day = { date: item.row.local_date, entries: [] };
      days.set(item.row.local_date, day);
    }
    const id = item.type === 'set' ? `session:${item.row.user_id}:${item.row.session_id}` : `${item.type}:${item.row.id}`;
    let entry = entries.get(id);
    if (!entry) {
      entry = { id, user: item.row.user_id, items: [] };
      entries.set(id, entry);
      day.entries.push(entry);
    }
    entry.items.push(item);
  }
  for (const entry of entries.values()) {
    if (entry.items.some((item) => item.type === 'set')) {
      entry.items.sort((a, b) => (a.type === 'set' && b.type === 'set' ? a.row.set_index - b.row.set_index : 0));
    }
  }
  return [...days.values()];
}

export function itemsFromHistory(entries: HistoryRows, exercises: readonly Exercise[]): FeedItem[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const items: FeedItem[] = [];
  for (const row of entries.sets) {
    const exercise = byId.get(row.exercise_id);
    if (exercise) items.push({ type: 'set', row, exercise });
  }
  for (const row of entries.cardio) items.push({ type: 'run', row });
  for (const row of entries.martial) items.push({ type: 'martial', row });
  for (const row of entries.min) items.push({ type: 'min', row });
  for (const row of entries.bodyweight) items.push({ type: 'weight', row });
  return items;
}

export function formatEntry(item: FeedItem): string {
  switch (item.type) {
    case 'set': {
      const kg = formatKg(item.row.weight_kg);
      if (item.exercise.kind === 'bw_lift') {
        const added = item.row.weight_kg === 0 ? '' : ` ${item.row.weight_kg > 0 ? '+' : ''}${kg} kg`;
        return fill(copy.x7BwSet, { exercise: item.exercise.name, reps: item.row.reps, load: added });
      }
      return fill(copy.x7Set, { exercise: item.exercise.name, reps: item.row.reps, kg });
    }
    case 'run':
      return fill(copy.x7Run, { km: formatKm(item.row.distance_m), duration: formatDuration(item.row.duration_s) });
    case 'martial':
      return fill(copy.x7Fight, { discipline: item.row.discipline, minutes: item.row.duration_min });
    case 'min':
      return fill(copy.x7Min, { description: item.row.description });
    case 'weight':
      return fill(copy.x7WeighIn, { kg: formatBodyweight(item.row.weight_kg) });
  }
}
