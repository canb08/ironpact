import { expect, it } from 'vitest';
import type { MartialEntry } from '../../../../src/core/types.ts';
import {
  appendStrike,
  comboBook,
  combosInNote,
  dropLastStrike,
  feelToRpe,
  formatClassNote,
  rpeToFeel,
  sameAsLast,
  struckRounds,
} from '../../../../src/features/quicklog/muaythai/classNote.ts';

it('counts two rounds per combo and maps feel onto RPE 6–10', () => {
  expect(struckRounds(3)).toBe(6);
  expect(struckRounds(2)).toBe(4);
  expect(feelToRpe(null)).toBeNull();
  expect(feelToRpe(1)).toBe(6);
  expect(feelToRpe(5)).toBe(10);
  expect(rpeToFeel(8)).toBe(3);
  expect(rpeToFeel(8.5)).toBeNull();
  expect(rpeToFeel(null)).toBeNull();
});

it('builds a combo, drops the last strike, and truncates the note on a combo boundary', () => {
  expect(appendStrike('', '1')).toBe('1');
  expect(appendStrike('1-2', 'R kick')).toBe('1-2-R kick');
  expect(appendStrike('1'.repeat(80), '2')).toBe('1'.repeat(80));
  expect(dropLastStrike('1-2-R kick')).toBe('1-2');
  expect(dropLastStrike('Teep')).toBe('');
  const long = '1-2-3-4-5-6-Knee-Elbow';
  const note = formatClassNote('Pads', [long, long, long, long, long, long, long]);
  expect([...note].length).toBeLessThanOrEqual(120);
  expect(note.startsWith('Pads · ')).toBe(true);
  expect(note.endsWith(long)).toBe(true);
  expect(formatClassNote('Pads', [])).toBe('Pads');
  expect(formatClassNote('Bag', ['1-2'])).toBe('Bag · 1-2');
  expect(formatClassNote('Pads', ['1-2', 'L kick'])).toBe('Pads · 1-2 / L kick');
});

it('reads pad-class combos only, newest first, and ignores other notes', () => {
  expect(combosInNote(null)).toEqual([]);
  expect(combosInNote('drilled guard')).toEqual([]);
  expect(combosInNote('Pads')).toEqual([]);
  expect(combosInNote('Pads · 1-2-R kick / Teep')).toEqual(['1-2-R kick', 'Teep']);
  const row = (n: number, note: string, logged: string, discipline = 'Muay Thai'): MartialEntry => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    user_id: '00000000-0000-4000-8000-000000000001',
    session_id: '00000000-0000-4000-8000-000000000002',
    discipline,
    duration_min: 60,
    rounds: 6,
    rpe: null,
    note,
    logged_at: logged,
    local_date: logged.slice(0, 10),
    client_updated_at: logged,
    updated_at: logged,
    deleted_at: null,
    created_at: logged,
  });
  const book = comboBook([
    row(1, 'Pads · 1-2', '2026-11-01T12:00:00.000Z'),
    row(2, 'Pads · 1-2 / Teep', '2026-11-02T12:00:00.000Z'),
    row(3, 'drilled guard', '2026-11-03T12:00:00.000Z', 'Boxing'),
    { ...row(4, 'Pads · Teep', '2026-11-04T12:00:00.000Z', 'BJJ'), deleted_at: '2026-11-04T13:00:00.000Z' },
  ]);
  expect(book.map((item) => `${item.combo}:${item.count}`)).toEqual(['1-2:2', 'Teep:1']);
});

it('restores minutes, focus and combos per half from the last class', () => {
  expect(sameAsLast({ rounds: 4, duration_min: 45, note: 'Clinch' })).toEqual({
    combosPerHalf: 2,
    roundMin: 3,
    minutes: 45,
    focus: 'Clinch',
  });
  expect(sameAsLast({ rounds: 6, duration_min: 60, note: 'Pads · 1-2' }).focus).toBe('Pads');
  expect(sameAsLast({ rounds: 5, duration_min: 60, note: 'sparring notes' }).combosPerHalf).toBe(3);
  expect(sameAsLast({ rounds: null, duration_min: 0, note: null })).toMatchObject({
    combosPerHalf: 3,
    minutes: 60,
    focus: 'Pads',
  });
});
