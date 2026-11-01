import type { ExportInput } from '@shared/export-format.ts';
import { formatExport } from '@shared/export-format.ts';
import type { Repo } from '../../data/adapter.ts';
import { copy, fill } from '../../ui/copy.ts';
import type { ExportFormat, Profile } from '../../core/types.ts';

/** Calendar arithmetic, independent of DST and the host timezone. Today plus six prior dates. */
export function previewDates(now: Date, tz: string): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const to = `${part('year')}-${part('month')}-${part('day')}`;
  const start = new Date(`${to}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  return { from: start.toISOString().slice(0, 10), to };
}

export async function loadPreview(repo: Repo, profile: Profile, now: Date) {
  const { from, to } = previewDates(now, profile.tz);
  const [rows, exercises] = await Promise.all([
    repo.q.entriesBetween(profile.id, from, to), repo.q.exercises(),
  ]);
  const input: ExportInput = {
    user_id: profile.id, tz: profile.tz, exercises,
    sessions: rows.sessions, sets: rows.sets, cardio_entries: rows.cardio,
    martial_entries: rows.martial, min_entries: rows.min, bodyweight_entries: rows.bodyweight,
  };
  return { body: formatExport(input, profile.export_format, from), from };
}

export function exportUrl(): string | null {
  const base: unknown = import.meta.env.VITE_SUPABASE_URL;
  return typeof base === 'string' && base.trim() ? `${base.replace(/\/+$/, '')}/functions/v1/export` : null;
}

export function aiInstructions(profile: Pick<Profile, 'display_name'>, url: string, format: ExportFormat): string {
  // docs/EXPORT.md documents Bearer; hosted gateway verification belongs to G1.
  return fill(copy.copyForAiTemplate, {
    display_name: profile.display_name, URL: url, FMT: format, HEADER: 'Authorization: Bearer',
  });
}

/** A denied or unsupported clipboard leaves the visible text available for manual copying. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
