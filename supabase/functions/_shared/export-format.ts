// SPOTTER export formatter: spec §5 (byte-exact contract) + §10.6.
// Pure and dependency-free: imported by the app (`@shared`) for the Settings preview
// and by the `export` Edge Function, so both always produce identical bytes.

export type ExportFormat = 'lines' | 'json' | 'csv';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['lines', 'json', 'csv'];

export const EXPORT_CONTENT_TYPE: Readonly<Record<ExportFormat, string>> = {
  lines: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

const SEP = ' · '; // " · "
const TIMES = '×'; // "×"
const NOTE_CAP = 120;

// ---------- input rows (the subset of §4 columns the export reads) ----------

type Nullable<T> = T | null | undefined;

export interface ExportExercise {
  id: string;
  export_label: string;
  kind: string; // 'lift' | 'bw_lift' | others are not exported as lift lines
}

export interface ExportSession {
  id: string;
  user_id: string;
  kind: string; // 'gym' | 'run' | 'martial' | 'min'
  mode?: Nullable<string>; // 'full' | 'min'
  started_at: string;
  local_date: string;
  note?: Nullable<string>;
  deleted_at?: Nullable<string>;
}

export interface ExportSet {
  id: string;
  session_id: string;
  user_id?: Nullable<string>;
  exercise_id: string;
  set_index: number;
  reps: number;
  weight_kg: number;
  rpe?: Nullable<number>;
  is_warmup?: Nullable<boolean>;
  note?: Nullable<string>;
  logged_at: string;
  deleted_at?: Nullable<string>;
}

export interface ExportCardio {
  id: string;
  session_id: string;
  user_id?: Nullable<string>;
  distance_m: number;
  duration_s: number;
  rpe?: Nullable<number>;
  note?: Nullable<string>;
  logged_at: string;
  deleted_at?: Nullable<string>;
}

export interface ExportMartial {
  id: string;
  session_id: string;
  user_id?: Nullable<string>;
  discipline: string;
  duration_min: number;
  rpe?: Nullable<number>;
  note?: Nullable<string>;
  logged_at: string;
  deleted_at?: Nullable<string>;
}

export interface ExportBodyweight {
  id: string;
  user_id?: Nullable<string>;
  weight_kg: number;
  measured_at: string;
  local_date: string;
  deleted_at?: Nullable<string>;
}

export interface ExportMin {
  id: string;
  session_id?: Nullable<string>;
  user_id?: Nullable<string>;
  local_date?: Nullable<string>; // used only when the row has no session
  description: string;
  logged_at: string;
  deleted_at?: Nullable<string>;
}

/** One user's rows. Rows owned by anyone else are ignored, whatever the caller passes. */
export interface ExportInput {
  user_id: string;
  tz: string;
  exercises: readonly ExportExercise[];
  sessions: readonly ExportSession[];
  sets?: readonly ExportSet[];
  cardio_entries?: readonly ExportCardio[];
  martial_entries?: readonly ExportMartial[];
  bodyweight_entries?: readonly ExportBodyweight[];
  min_entries?: readonly ExportMin[];
}

// ---------- output entries ----------

export interface LiftGroup {
  n: number;
  reps: number;
  kg: number; // bw_lift: the added load (0, positive or negative)
  bw: boolean;
}

export type ExportEntry =
  | { date: string; type: 'weight'; label: 'Weight'; kg: number; line: string }
  | { date: string; type: 'lift'; label: string; groups: LiftGroup[]; rpe: number | null; note: string | null; line: string }
  | { date: string; type: 'martial'; label: string; minutes: number; rpe: number | null; note: string | null; line: string }
  | { date: string; type: 'run'; label: 'Run'; km: number; duration_s: number; rpe: number | null; note: string | null; line: string }
  | { date: string; type: 'min'; label: 'MIN'; description: string; line: string };

// ---------- number and text helpers (exported for unit tests) ----------

/** Dot decimal, at most 2 decimals, half-up, trailing zeros and dot trimmed: 80, 82.5, 81.25, 100.1. */
export function formatKg(value: number): string {
  const sign = value < 0 ? '-' : '';
  const hundredths = Math.round(Math.abs(value) * 100 + 1e-9);
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  if (frac === 0) return `${sign}${whole}`;
  const fracText = String(frac).padStart(2, '0').replace(/0+$/, '');
  return `${sign}${whole}.${fracText}`;
}

/** RPE as an integer or with .5: "8", "8.5". */
export function formatRpe(rpe: number): string {
  return formatKg(rpe);
}

/** Σ metres → km, half-up to 2 decimals, trimmed: 5005 → "5.01", 10000 → "10". */
export function formatKm(distanceM: number): string {
  const hundredths = Math.floor(distanceM / 10 + 0.5 + 1e-9);
  return formatKg(hundredths / 100);
}

/** M:SS under 3600 s, H:MM:SS from 3600 s. */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Always one decimal: 78 → "78.0". */
export function formatBodyweight(kg: number): string {
  return (Math.round(kg * 10 + 1e-9) / 10).toFixed(1);
}

/** §5.3 rule 6: '·' → '-', CR/LF → space, collapse whitespace, trim, cut to 120 code points, trim. */
export function sanitizeNote(text: string): string {
  const cleaned = text.replace(/·/g, '-').replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, NOTE_CAP).join('').trim();
}

/** `since` must look like YYYY-MM-DD and be a real calendar date. */
export function isValidSince(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function joinNotes(raw: readonly Nullable<string>[]): string | null {
  const seen: string[] = [];
  for (const note of raw) {
    if (!note) continue;
    const clean = sanitizeNote(note);
    if (clean && !seen.includes(clean)) seen.push(clean);
  }
  const joined = sanitizeNote(seen.join('; '));
  return joined === '' ? null : joined;
}

function maxRpe(values: readonly Nullable<number>[]): number | null {
  let max: number | null = null;
  for (const v of values) if (typeof v === 'number' && (max === null || v > max)) max = v;
  return max;
}

/** `N×R×W` runs joined with " + ": 2×5×80kg + 1×3×85kg, 3×8×BW, 3×10×BW+10kg, 3×6×BW-15kg. */
export function formatGroups(groups: readonly LiftGroup[]): string {
  return groups
    .map((g) => {
      const w = !g.bw ? `${formatKg(g.kg)}kg` : g.kg === 0 ? 'BW' : g.kg > 0 ? `BW+${formatKg(g.kg)}kg` : `BW-${formatKg(-g.kg)}kg`;
      return `${g.n}${TIMES}${g.reps}${TIMES}${w}`;
    })
    .join(' + ');
}

const byText =(a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function tail(rpe: number | null, note: string | null): string {
  return (rpe === null ? '' : `${SEP}RPE ${formatRpe(rpe)}`) + (note === null ? '' : `${SEP}${note}`);
}

// ---------- core ----------

interface Sortable {
  entry: ExportEntry;
  rank: number; // Weight 0, lifts 1, martial 2, run 3, MIN 4
  at: string; // ISO timestamp used for in-rank order
  key: string; // final tie-break, for determinism
}

/** Builds the ordered entries (one per output line) for the token owner only. */
export function buildEntries(input: ExportInput, since?: Nullable<string>): ExportEntry[] {
  const owner = input.user_id;
  const live = <T extends { deleted_at?: Nullable<string> }>(row: T): boolean => !row.deleted_at;
  const mine = <T extends { user_id?: Nullable<string> }>(row: T): boolean => row.user_id == null || row.user_id === owner;

  const sessions = new Map<string, ExportSession>();
  for (const s of input.sessions) if (s.user_id === owner && live(s)) sessions.set(s.id, s);
  const exercises = new Map(input.exercises.map((e) => [e.id, e]));
  const inRange = (date: string): boolean => !since || date >= since;
  const out: Sortable[] = [];

  // Weight: the latest live measurement of each local date.
  const weights = new Map<string, ExportBodyweight>();
  for (const w of input.bodyweight_entries ?? []) {
    if (!live(w) || !mine(w) || !inRange(w.local_date)) continue;
    const prev = weights.get(w.local_date);
    if (!prev || w.measured_at > prev.measured_at) weights.set(w.local_date, w);
  }
  for (const [date, w] of weights) {
    const line = `- ${date}${SEP}Weight${SEP}${formatBodyweight(w.weight_kg)}kg`;
    out.push({ entry: { date, type: 'weight', label: 'Weight', kg: Number(formatBodyweight(w.weight_kg)), line }, rank: 0, at: w.measured_at, key: '' });
  }

  // Lifts: one line per (date, exercise), working sets only, ordered by (session start, set index).
  type LiftRow = { set: ExportSet; session: ExportSession };
  const lifts = new Map<string, LiftRow[]>();
  for (const set of input.sets ?? []) {
    const session = sessions.get(set.session_id);
    const exercise = exercises.get(set.exercise_id);
    if (!session || !exercise || !live(set) || !mine(set) || set.is_warmup) continue;
    if (exercise.kind !== 'lift' && exercise.kind !== 'bw_lift') continue;
    if (!inRange(session.local_date)) continue;
    const k = `${session.local_date}\u0000${set.exercise_id}`;
    const rows = lifts.get(k) ?? [];
    rows.push({ set, session });
    lifts.set(k, rows);
  }
  type LiftLine = { date: string; exercise: ExportExercise; rows: LiftRow[]; firstAt: string };
  const liftLines: LiftLine[] = [];
  for (const rows of lifts.values()) {
    rows.sort((a, b) => byText(a.session.started_at, b.session.started_at) || a.set.set_index - b.set.set_index);
    const first = rows[0]!;
    const firstAt = rows.reduce((min, r) => (r.set.logged_at < min ? r.set.logged_at : min), first.set.logged_at);
    liftLines.push({ date: first.session.local_date, exercise: exercises.get(first.set.exercise_id)!, rows, firstAt });
  }
  // A session's note goes on the line holding that session's earliest working set.
  const sessionNoteLine = new Map<string, LiftLine>();
  const sessionFirstAt = new Map<string, string>();
  for (const line of liftLines) {
    for (const { set, session } of line.rows) {
      const prev = sessionFirstAt.get(session.id);
      if (prev === undefined || set.logged_at < prev) {
        sessionFirstAt.set(session.id, set.logged_at);
        sessionNoteLine.set(session.id, line);
      }
    }
  }
  for (const line of liftLines) {
    const bw = line.exercise.kind === 'bw_lift';
    const groups: LiftGroup[] = [];
    for (const { set } of line.rows) {
      const last = groups[groups.length - 1];
      if (last && last.reps === set.reps && last.kg === set.weight_kg) last.n += 1;
      else groups.push({ n: 1, reps: set.reps, kg: set.weight_kg, bw });
    }
    const groupText = formatGroups(groups);
    const setNotes = [...line.rows].sort((a, b) => byText(a.set.logged_at, b.set.logged_at)).map((r) => r.set.note);
    const sessionNotes = [...sessionNoteLine.entries()]
      .filter(([, l]) => l === line)
      .map(([id]) => sessions.get(id)!)
      .sort((a, b) => byText(a.started_at, b.started_at))
      .map((s) => s.note);
    const rpe = maxRpe(line.rows.map((r) => r.set.rpe));
    const note = joinNotes([...setNotes, ...sessionNotes]);
    const label = line.exercise.export_label;
    const text = `- ${line.date}${SEP}${label}${SEP}${groupText}${tail(rpe, note)}`;
    out.push({ entry: { date: line.date, type: 'lift', label, groups, rpe, note, line: text }, rank: 1, at: line.firstAt, key: label });
  }

  // Martial arts: one line per (date, discipline).
  const martial = new Map<string, { date: string; rows: ExportMartial[] }>();
  for (const m of input.martial_entries ?? []) {
    const session = sessions.get(m.session_id);
    if (!session || !live(m) || !mine(m) || !inRange(session.local_date)) continue;
    const k = `${session.local_date}\u0000${m.discipline}`;
    const group = martial.get(k) ?? { date: session.local_date, rows: [] };
    group.rows.push(m);
    martial.set(k, group);
  }
  for (const { date, rows } of martial.values()) {
    rows.sort((a, b) => byText(a.logged_at, b.logged_at));
    const label = rows[0]!.discipline;
    const minutes = rows.reduce((sum, r) => sum + r.duration_min, 0);
    const rpe = maxRpe(rows.map((r) => r.rpe));
    const note = joinNotes(rows.map((r) => r.note));
    const line = `- ${date}${SEP}${label}${SEP}${minutes}m${tail(rpe, note)}`;
    out.push({ entry: { date, type: 'martial', label, minutes, rpe, note, line }, rank: 2, at: rows[0]!.logged_at, key: label });
  }

  // Run: every cardio entry of the date merges into one line.
  const runs = new Map<string, ExportCardio[]>();
  for (const c of input.cardio_entries ?? []) {
    const session = sessions.get(c.session_id);
    if (!session || !live(c) || !mine(c) || !inRange(session.local_date)) continue;
    const rows = runs.get(session.local_date) ?? [];
    rows.push(c);
    runs.set(session.local_date, rows);
  }
  for (const [date, rows] of runs) {
    rows.sort((a, b) => byText(a.logged_at, b.logged_at));
    const distance = rows.reduce((sum, r) => sum + r.distance_m, 0);
    const duration = rows.reduce((sum, r) => sum + r.duration_s, 0);
    const rpe = maxRpe(rows.map((r) => r.rpe));
    const note = joinNotes(rows.map((r) => r.note));
    const km = formatKm(distance);
    const line = `- ${date}${SEP}Run${SEP}${km}km${SEP}${formatDuration(duration)}${tail(rpe, note)}`;
    out.push({ entry: { date, type: 'run', label: 'Run', km: Number(km), duration_s: duration, rpe, note, line }, rank: 3, at: rows[0]!.logged_at, key: '' });
  }

  // MIN: one line per min entry, plus "session" for a gym session done in MIN mode.
  const pushMin = (date: string, description: string, at: string, key: string): void => {
    const line = `- ${date}${SEP}MIN${SEP}${description}`;
    out.push({ entry: { date, type: 'min', label: 'MIN', description, line }, rank: 4, at, key });
  };
  for (const n of input.min_entries ?? []) {
    if (!live(n) || !mine(n)) continue;
    const session = n.session_id ? sessions.get(n.session_id) : undefined;
    if (n.session_id && !session) continue;
    const date = session ? session.local_date : n.local_date;
    const description = sanitizeNote(n.description);
    if (!date || !description || !inRange(date)) continue;
    pushMin(date, description, n.logged_at, n.id);
  }
  for (const s of sessions.values()) {
    if (s.kind === 'gym' && s.mode === 'min' && inRange(s.local_date)) pushMin(s.local_date, 'session', s.started_at, s.id);
  }

  out.sort(
    (a, b) =>
      byText(b.entry.date, a.entry.date) || a.rank - b.rank || byText(a.at, b.at) || byText(a.key, b.key),
  );
  return out.map((o) => o.entry);
}

// ---------- renderers ----------

export function renderLines(entries: readonly ExportEntry[]): string {
  return entries.map((e) => `${e.line}\n`).join('');
}

export function renderJson(entries: readonly ExportEntry[], tz: string, since?: Nullable<string>): string {
  return `${JSON.stringify({ format: 'spotter.export.v1', tz, since: since ?? null, entries }, null, 2)}\n`;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function renderCsv(entries: readonly ExportEntry[]): string {
  const rows = ['date,type,label,value,duration,rpe,note'];
  for (const e of entries) {
    let value = '';
    let duration = '';
    let rpe: number | null = null;
    let note: string | null = null;
    switch (e.type) {
      case 'weight':
        value = formatBodyweight(e.kg);
        break;
      case 'lift':
        value = formatGroups(e.groups);
        ({ rpe, note } = e);
        break;
      case 'martial':
        value = String(e.minutes);
        ({ rpe, note } = e);
        break;
      case 'run':
        value = formatKm(e.km * 1000);
        duration = formatDuration(e.duration_s);
        ({ rpe, note } = e);
        break;
      case 'min':
        value = e.description;
        break;
    }
    const cells = [e.date, e.type, e.label, value, duration, rpe === null ? '' : formatRpe(rpe), note ?? ''];
    rows.push(cells.map(csvField).join(','));
  }
  return `${rows.join('\n')}\n`;
}

/** The whole export body for one format. Lines with zero entries is the empty string. */
export function formatExport(input: ExportInput, format: ExportFormat, since?: Nullable<string>): string {
  const entries = buildEntries(input, since);
  if (format === 'json') return renderJson(entries, input.tz, since);
  if (format === 'csv') return renderCsv(entries);
  return renderLines(entries);
}
