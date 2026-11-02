import type { MartialEntry } from '../../../core/types.ts';

/** Storage contract from FEEL §4. The prefix is not a translation string. */
export const PADS_PREFIX = 'Pads';
export const NOTE_LIMIT = 120;
export const REPS_PER_ROUND = 10;
export const DEFAULT_COMBOS = 3;
export const DEFAULT_MINUTES = 60;
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 480;

export const STRIKE_TOKENS = ['1', '2', '3', '4', '5', '6', 'Teep', 'L kick', 'R kick', 'Knee', 'Elbow'] as const;
export type StrikeToken = (typeof STRIKE_TOKENS)[number];

export const FOCUS_OPTIONS = ['Pads', 'Bag', 'Clinch', 'Technique', 'Conditioning'] as const;
export type ClassFocus = (typeof FOCUS_OPTIONS)[number];

export const LENGTH_OPTIONS = [2, 3, 5] as const;
export type RoundLengthMin = (typeof LENGTH_OPTIONS)[number];

export const COMBO_OPTIONS = [2, 3, 4] as const;
export type CombosPerHalf = (typeof COMBO_OPTIONS)[number];

/** 1–5 "how did it feel". Stored as form RPE 6–10, the only range the schema accepts. */
export const FEEL_OPTIONS = [1, 2, 3, 4, 5] as const;
export type ClassFeel = (typeof FEEL_OPTIONS)[number];

export interface ClassSetup {
  combosPerHalf: CombosPerHalf;
  roundMin: RoundLengthMin;
  minutes: number;
  focus: ClassFocus;
}

export function isCombosPerHalf(value: number): value is CombosPerHalf {
  return value === 2 || value === 3 || value === 4;
}

/** Two halves, so rounds you struck (and rounds you held) are twice the combos per half. */
export function struckRounds(combosPerHalf: number): number {
  return 2 * combosPerHalf;
}

export function feelToRpe(feel: ClassFeel | null): number | null {
  return feel == null ? null : feel + 5;
}

export function rpeToFeel(rpe: number | null): ClassFeel | null {
  if (rpe == null) return null;
  const feel = rpe - 5;
  return (FEEL_OPTIONS as readonly number[]).includes(feel) ? feel as ClassFeel : null;
}

export function appendStrike(draft: string, token: string): string {
  const next = draft === '' ? token : `${draft}-${token}`;
  return [...next].length > 80 ? draft : next;
}

export function dropLastStrike(draft: string): string {
  const cut = draft.lastIndexOf('-');
  return cut === -1 ? '' : draft.slice(0, cut);
}

/** `Pads · 1-2-3 / L kick-2`, dropping whole combos that would pass 120. */
export function formatClassNote(focus: string, combos: readonly string[]): string {
  let note = focus;
  let started = false;
  for (const raw of combos) {
    const text = raw.trim();
    if (text === '') continue;
    const next = started ? `${note} / ${text}` : `${note} · ${text}`;
    if ([...next].length > NOTE_LIMIT) break;
    note = next;
    started = true;
  }
  return note;
}

/** Combos noted on a pad class. Anything else, including old free-text notes, is empty. */
export function combosInNote(note: string | null): string[] {
  if (note == null) return [];
  const trimmed = note.trim();
  const marker = `${PADS_PREFIX} · `;
  if (!trimmed.startsWith(marker)) return [];
  const found: string[] = [];
  for (const group of trimmed.slice(marker.length).split(' · ')) {
    for (const piece of group.split(' / ')) {
      const combo = piece.trim();
      if (combo !== '') found.push(combo);
    }
  }
  return found;
}

export interface ComboDrill {
  combo: string;
  count: number;
  lastLoggedAt: string;
}

/** Newest combo first. Count is how many classes noted that exact string. */
export function comboBook(rows: readonly MartialEntry[]): ComboDrill[] {
  const map = new Map<string, ComboDrill>();
  const ordered = rows
    .filter((row) => row.deleted_at === null)
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id));
  for (const row of ordered) {
    for (const combo of combosInNote(row.note)) {
      const current = map.get(combo);
      if (current) {
        current.count += 1;
        current.lastLoggedAt = row.logged_at;
      } else {
        map.set(combo, { combo, count: 1, lastLoggedAt: row.logged_at });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.lastLoggedAt.localeCompare(a.lastLoggedAt) || a.combo.localeCompare(b.combo));
}

export function focusOf(note: string | null): ClassFocus {
  if (note == null) return 'Pads';
  const head = note.split('·')[0]?.trim() ?? '';
  return (FOCUS_OPTIONS as readonly string[]).includes(head) ? head as ClassFocus : 'Pads';
}

/** Round length is not stored. Minutes and rounds (when they are 4, 6 or 8) are. */
export function sameAsLast(entry: {
  rounds: number | null;
  duration_min: number;
  note: string | null;
}): ClassSetup {
  const half = entry.rounds == null ? Number.NaN : entry.rounds / 2;
  const minutes = Number.isInteger(entry.duration_min) && entry.duration_min >= MINUTES_MIN && entry.duration_min <= MINUTES_MAX
    ? entry.duration_min
    : DEFAULT_MINUTES;
  return {
    combosPerHalf: isCombosPerHalf(half) ? half : DEFAULT_COMBOS,
    roundMin: 3,
    minutes,
    focus: focusOf(entry.note),
  };
}
