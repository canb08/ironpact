import type { ProofCardWithMedia } from '../../core/types.ts';
import type { DayEntries, Repo } from '../../data/adapter.ts';
import { volume as workingVolume } from '../../core/volume.ts';
import { recomputePrs } from '../../core/prs.ts';
import { localDateOf } from '../../core/weeks.ts';
import { proofDisplayName } from './names.ts';
import { copy, fill } from '../../ui/copy.ts';
import { formatClock, formatKm, formatPace } from '../quicklog/time.ts';

export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  let year = Number(first.slice(0, 4)), month = Number(first.slice(5, 7));
  const end = last.slice(0, 7);
  while (`${year}-${String(month).padStart(2, '0')}` <= end) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    if (++month === 13) { month = 1; year += 1; }
  }
  return months.reverse();
}
export function longestStreak(cards: readonly Pick<ProofCardWithMedia, 'day' | 'together'>[]): number {
  const weeks = [...new Set(cards.filter((c) => c.together).map((c) => {
    const date = new Date(`${c.day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return date.getTime();
  }))].sort((a, b) => a - b);
  let longest = 0, current = 0, previous = -Infinity;
  for (const week of weeks) { current = week - previous === 604800000 ? current + 1 : 1; longest = Math.max(longest, current); previous = week; }
  return longest;
}
export async function loadProof(repo: Repo) {
  const [me, crew, exercises, prs] = await Promise.all([repo.q.me(), repo.q.myCrew(), repo.q.exercises(), repo.q.prEvents({})]);
  const today = localDateOf(new Date().toISOString(), me?.tz ?? 'UTC');
  const users = crew?.members.filter((m) => !m.left_at).map((m) => m.user_id) ?? [];
  const profiles = (await repo.q.profiles(users)).map((profile) => {
    const fallback = profile.id === me?.id ? copy.x7You : copy.x3Partner;
    const displayName = proofDisplayName(profile.display_name, fallback);
    const legacy = !profile.display_name.trim() || profile.display_name.trim() === copy.x3LegacyName;
    return { ...profile, display_name: displayName, initial: legacy ? displayName.charAt(0) : profile.initial };
  });
  const histories = await Promise.all(users.map((id) => repo.q.entriesBetween(id, '0001-01-01', '9999-12-31')));
  const dates = [today, ...(crew?.members.map((m) => m.joined_at.slice(0, 10)) ?? []), ...histories.flatMap((h) => [...h.sessions, ...h.cardio, ...h.martial].map((row) => row.local_date))].sort();
  const earliest = dates[0] ?? today;
  const latest = dates.at(-1) ?? today;
  const cards = (await Promise.all(monthsBetween(earliest, latest).map((month) => repo.proof.listCards(month)))).flat().sort((a, b) => b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at));
  const entries: DayEntries = { sessions: [], sets: [], cardio: [], martial: [], min: [], bodyweight: [] };
  for (const history of histories) for (const key of ['sessions', 'sets', 'cardio', 'martial', 'min', 'bodyweight'] as const) Object.assign(entries, { [key]: [...entries[key], ...history[key]] });
  const partnerPrs = histories.flatMap((history, index) => users[index] === me?.id ? [] : recomputePrs({ sessions: history.sessions, sets: history.sets, cardio: history.cardio, bodyweights: history.bodyweight, exercises }));
  return { me, profiles, cards, entries, exercises, prs: [...prs, ...partnerPrs], today };
}
export type ProofData = Awaited<ReturnType<typeof loadProof>>;
export function cardDetails(card: ProofCardWithMedia, data: ProofData) {
  const linked = (table: string, id: string) => card.links.some((l) => l.entry_table === table && l.entry_id === id);
  const sets = data.entries.sets.filter((s) => !s.is_warmup && (linked('sets', s.id) || linked('sessions', s.session_id)));
  const runs = data.entries.cardio.filter((r) => linked('cardio_entries', r.id));
  const fights = data.entries.martial.filter((m) => linked('martial_entries', m.id));
  const volume = sets.reduce((total, set) => {
    const kind = data.exercises.find((e) => e.id === set.exercise_id)?.kind === 'bw_lift' ? 'bw_lift' : 'lift';
    const weigh = data.entries.bodyweight.filter((w) => w.user_id === set.user_id && w.local_date === set.local_date)
      .sort((a, b) => b.measured_at.localeCompare(a.measured_at) || b.id.localeCompare(a.id))[0];
    return total + workingVolume([set], kind, weigh?.weight_kg);
  }, 0);
  const run = runs[0];
  const title = card.kind === 'lift' ? fill(copy.y9Lift, { kg: new Intl.NumberFormat('en-GB').format(volume) })
    : card.kind === 'run' ? run ? fill(copy.y9Run, { km: formatKm(run.distance_m / 1000), duration: formatClock(run.duration_s) }) : copy.x3Run
      : fill(copy.y9Fight, { rounds: fights[0]?.rounds ?? 0 });
  const lines = card.kind === 'lift' ? sets.map((s) => fill(copy.y9Sets, { exercise: data.exercises.find((e) => e.id === s.exercise_id)?.name ?? copy.x7Lift, kg: s.weight_kg, reps: s.reps }))
    : card.kind === 'run' ? runs.flatMap((r) => [fill(copy.y9Run, { km: formatKm(r.distance_m / 1000), duration: formatClock(r.duration_s) }), fill(copy.y9Pace, { pace: formatPace(r.duration_s, r.distance_m / 1000) }), ...(r.note ? [r.note] : [])])
      : fights.flatMap((f) => [fill(copy.x7Fight, { discipline: copy.muayThai, minutes: f.duration_min }), ...(f.note ? [f.note] : [])]);
  const sourceIds = new Set([...sets.map((s) => s.id), ...runs.map((r) => r.id)]);
  const pr = data.prs.some((p) => sourceIds.has(p.source_id));
  return { title, lines, volume, pr };
}
