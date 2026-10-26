// Spec §7.1 export-format.test.ts (U-X1…U-X21, U-X23). U-X22 (reserved labels) is a DB/zod check, owned by A2/B2.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatExport,
  formatKg,
  formatKm,
  isValidSince,
  sanitizeNote,
  type ExportInput,
  type ExportSet,
} from '../../supabase/functions/_shared/export-format.ts';

const FIXTURES = fileURLToPath(new URL('../fixtures/export/', import.meta.url));
const fixtureText = (name: string): string => readFileSync(FIXTURES + name, 'utf8');
const fixtureBytes = (name: string): Buffer => readFileSync(FIXTURES + name);
const fixtureInput = (name: string): ExportInput => JSON.parse(fixtureText(name)) as ExportInput;

const D = '2026-10-24';
const at = (minute: number): string => `2026-10-24T08:${String(minute).padStart(2, '0')}:00Z`;

function gym(sets: Array<Partial<ExportSet> & Pick<ExportSet, 'reps' | 'weight_kg'>>, extra: Partial<ExportInput> = {}): ExportInput {
  return {
    user_id: 'u1',
    tz: 'Europe/Amsterdam',
    exercises: [
      { id: 'bench', export_label: 'Bench', kind: 'lift' },
      { id: 'dip', export_label: 'Dip', kind: 'bw_lift' },
    ],
    sessions: [{ id: 's1', user_id: 'u1', kind: 'gym', mode: 'full', started_at: at(0), local_date: D }],
    sets: sets.map((s, i) => ({ id: `a${i}`, session_id: 's1', exercise_id: 'bench', set_index: i + 1, logged_at: at(i + 1), ...s })),
    ...extra,
  };
}
const lines = (input: ExportInput): string => formatExport(input, 'lines');

describe('export-format: lift lines', () => {
  it('U-X1 identical sets → 3×5×80kg', () => {
    expect(lines(gym([{ reps: 5, weight_kg: 80 }, { reps: 5, weight_kg: 80 }, { reps: 5, weight_kg: 80 }]))).toBe(
      `- ${D} · Bench · 3×5×80kg\n`,
    );
  });

  it('U-X2 mixed → 2×5×80kg + 1×3×85kg', () => {
    expect(lines(gym([{ reps: 5, weight_kg: 80 }, { reps: 5, weight_kg: 80 }, { reps: 3, weight_kg: 85 }]))).toBe(
      `- ${D} · Bench · 2×5×80kg + 1×3×85kg\n`,
    );
  });

  it('U-X3 non-consecutive repeats stay separate', () => {
    expect(lines(gym([{ reps: 5, weight_kg: 80 }, { reps: 3, weight_kg: 85 }, { reps: 5, weight_kg: 80 }]))).toBe(
      `- ${D} · Bench · 1×5×80kg + 1×3×85kg + 1×5×80kg\n`,
    );
  });

  it('U-X4 warm-ups excluded; only-warmup exercise yields no line', () => {
    const input = gym([
      { reps: 10, weight_kg: 20, is_warmup: true },
      { reps: 5, weight_kg: 80 },
      { exercise_id: 'dip', reps: 10, weight_kg: 0, is_warmup: true },
    ]);
    expect(lines(input)).toBe(`- ${D} · Bench · 1×5×80kg\n`);
  });

  it('U-X5 BW, BW+10kg, BW-15kg', () => {
    const input = gym([
      { exercise_id: 'dip', reps: 10, weight_kg: 0 },
      { exercise_id: 'dip', reps: 10, weight_kg: 10 },
      { exercise_id: 'dip', reps: 6, weight_kg: -15 },
    ]);
    expect(lines(input)).toBe(`- ${D} · Dip · 1×10×BW + 1×10×BW+10kg + 1×6×BW-15kg\n`);
  });

  it('U-X6 kg trimming 80 / 82.5 / 81.25 / 1.25 / 100.10→100.1', () => {
    expect([80, 82.5, 81.25, 1.25, 100.1, 100.0].map(formatKg)).toEqual(['80', '82.5', '81.25', '1.25', '100.1', '100']);
  });

  it('U-X7 RPE max, .5 kept, integer without .0', () => {
    expect(lines(gym([{ reps: 5, weight_kg: 80, rpe: 8 }, { reps: 5, weight_kg: 80, rpe: 8.5 }]))).toBe(
      `- ${D} · Bench · 2×5×80kg · RPE 8.5\n`,
    );
    expect(lines(gym([{ reps: 5, weight_kg: 80, rpe: 7.5 }, { reps: 5, weight_kg: 80, rpe: 9.0 }]))).toBe(
      `- ${D} · Bench · 2×5×80kg · RPE 9\n`,
    );
  });

  it('U-X8 note sanitising: · → -, newline → space, collapse, 120-cap', () => {
    expect(sanitizeNote('last rep · \n slow')).toBe('last rep - slow');
    expect(sanitizeNote('  a \r\n\t b  ')).toBe('a b');
    const long = `${'x'.repeat(119)} yyy`;
    expect(sanitizeNote(long)).toBe('x'.repeat(119));
    expect(Array.from(sanitizeNote('é'.repeat(200))).length).toBe(120);
  });

  it('U-X9 session note only on first lift line of session', () => {
    const input = gym([{ reps: 5, weight_kg: 80 }, { exercise_id: 'dip', reps: 10, weight_kg: 0 }]);
    input.sessions = [{ ...input.sessions[0]!, note: 'felt strong' }];
    expect(lines(input)).toBe(`- ${D} · Bench · 1×5×80kg · felt strong\n- ${D} · Dip · 1×10×BW\n`);
  });
});

describe('export-format: run, martial, weight, MIN', () => {
  const base = (extra: Partial<ExportInput>): ExportInput => ({ user_id: 'u1', tz: 'Europe/Amsterdam', exercises: [], sessions: [], ...extra });

  it('U-X10 runs merged per day; M:SS vs H:MM:SS at 3599/3600 s', () => {
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    const input = base({
      sessions: [
        { id: 'r1', user_id: 'u1', kind: 'run', started_at: at(0), local_date: D },
        { id: 'r2', user_id: 'u1', kind: 'run', started_at: at(30), local_date: D },
      ],
      cardio_entries: [
        { id: 'c1', session_id: 'r1', distance_m: 3000, duration_s: 900, rpe: 5, note: 'am', logged_at: at(10) },
        { id: 'c2', session_id: 'r2', distance_m: 2500, duration_s: 800, rpe: 7, note: 'pm', logged_at: at(40) },
      ],
    });
    expect(lines(input)).toBe(`- ${D} · Run · 5.5km · 28:20 · RPE 7 · am; pm\n`);
  });

  it('U-X11 km half-up rounding 5005 m → 5.01km, 10000 → 10km', () => {
    expect(formatKm(5005)).toBe('5.01');
    expect(formatKm(10000)).toBe('10');
    expect(formatKm(21100)).toBe('21.1');
  });

  it('U-X12 martial merged per discipline per day; two disciplines two lines', () => {
    const input = base({
      sessions: [{ id: 'm', user_id: 'u1', kind: 'martial', started_at: at(0), local_date: D }],
      martial_entries: [
        { id: 'm1', session_id: 'm', discipline: 'BJJ', duration_min: 30, rpe: 6, logged_at: at(1) },
        { id: 'm2', session_id: 'm', discipline: 'Muay Thai', duration_min: 45, rpe: 8.5, logged_at: at(2) },
        { id: 'm3', session_id: 'm', discipline: 'BJJ', duration_min: 30, rpe: 7, note: 'drilled guard', logged_at: at(3) },
      ],
    });
    expect(lines(input)).toBe(`- ${D} · BJJ · 60m · RPE 7 · drilled guard\n- ${D} · Muay Thai · 45m · RPE 8.5\n`);
  });

  it('U-X13 weight latest of day, 78 → 78.0kg', () => {
    const input = base({
      bodyweight_entries: [
        { id: 'w1', weight_kg: 79.1, measured_at: at(1), local_date: D },
        { id: 'w2', weight_kg: 78, measured_at: at(5), local_date: D },
      ],
    });
    expect(lines(input)).toBe(`- ${D} · Weight · 78.0kg\n`);
  });

  it('U-X14 MIN entry line; mode=min session adds MIN · session', () => {
    const input = gym([{ reps: 5, weight_kg: 72.5 }]);
    input.sessions = [{ ...input.sessions[0]!, mode: 'min' }, { id: 'n', user_id: 'u1', kind: 'min', mode: 'min', started_at: at(50), local_date: D }];
    input.min_entries = [{ id: 'n1', session_id: 'n', description: '20m walk', logged_at: at(50) }];
    expect(lines(input)).toBe(`- ${D} · Bench · 1×5×72.5kg\n- ${D} · MIN · session\n- ${D} · MIN · 20m walk\n`);
  });

  it('U-X15 within-date order Weight → lifts → martial → Run → MIN', () => {
    const out = lines(fixtureInput('basic.json')).split('\n').filter((l) => l.startsWith('- 2026-10-24'));
    expect(out.map((l) => l.split(' · ')[1])).toEqual(['Weight', 'Bench', 'Pull-up', 'Dip', 'BJJ', 'Run']);
  });

  it('U-X16 trailing LF on last line, no blank line, empty → ""', () => {
    const text = lines(fixtureInput('basic.json'));
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text.includes('\r')).toBe(false);
    expect(lines(fixtureInput('empty.json'))).toBe('');
  });
});

describe('export-format: goldens (§5.6)', () => {
  const input = fixtureInput('basic.json');

  it('U-X17 golden basic.txt byte-identical', () => {
    expect(Buffer.from(formatExport(input, 'lines'), 'utf8').equals(fixtureBytes('basic.txt'))).toBe(true);
    expect(fixtureText('basic.txt').split('\n')).toHaveLength(17); // 16 lines + the final LF
  });

  it('U-X18 golden since-2026-10-21', () => {
    expect(Buffer.from(formatExport(input, 'lines', '2026-10-21'), 'utf8').equals(fixtureBytes('basic.since-2026-10-21.txt'))).toBe(true);
  });

  it('U-X19 json and csv goldens; json.line === lines output', () => {
    const json = formatExport(input, 'json');
    expect(json).toBe(fixtureText('basic.json.expected.json'));
    expect(formatExport(input, 'csv')).toBe(fixtureText('basic.csv.expected.csv'));
    const parsed = JSON.parse(json) as { since: string | null; entries: Array<{ line: string }> };
    expect(parsed.since).toBeNull();
    expect(parsed.entries.map((e) => `${e.line}\n`).join('')).toBe(fixtureText('basic.txt'));
  });

  it('U-X20 partner rows never appear', () => {
    expect(formatExport(fixtureInput('partner-only.json'), 'lines')).toBe('');
    expect(formatExport(input, 'lines')).not.toMatch(/Bench · 1×5×100kg/);
  });

  it('U-X21 deleted rows excluded; renamed exercise uses current label', () => {
    expect(formatExport(input, 'lines')).not.toContain('85kg · RPE 8 · felt'); // deleted set a4
    expect(formatExport(input, 'lines')).not.toContain('78.6kg'); // deleted weigh-in w1
    const renamed = { ...input, exercises: input.exercises.map((e) => (e.id === 'bench' ? { ...e, export_label: 'Bench Press' } : e)) };
    const out = formatExport(renamed, 'lines');
    expect(out).toContain('- 2026-10-19 · Bench Press · 2×5×72.5kg\n');
    expect(out).not.toContain(' · Bench · ');
  });

  it('U-X23 note with × is preserved; note with · becomes -', () => {
    expect(lines(gym([{ reps: 5, weight_kg: 80, note: '3×3 next · go' }]))).toBe(`- ${D} · Bench · 1×5×80kg · 3×3 next - go\n`);
  });

  it('since must be a real calendar date', () => {
    expect(['2026-10-21', '2028-02-29'].map(isValidSince)).toEqual([true, true]);
    expect(['2026-02-30', '2026-13-01', '26-10-21', '2026-10-21T00:00', ''].map(isValidSince)).toEqual([false, false, false, false, false]);
  });

  it('empty user: lines "", csv header only, json entries []', () => {
    const empty = fixtureInput('empty.json');
    expect(formatExport(empty, 'csv')).toBe('date,type,label,value,duration,rpe,note\n');
    expect((JSON.parse(formatExport(empty, 'json')) as { entries: unknown[] }).entries).toEqual([]);
  });
});
