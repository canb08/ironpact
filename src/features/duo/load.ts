import { weekCredits, type WeekCredits } from '../../core/credits.ts';
import type { LocalDate, Profile } from '../../core/types.ts';
import type { FairComparison } from '../../core/duel.ts';
import type { Repo } from '../../data/adapter.ts';
import { crewWeekBounds, localDateOf, weekDates, weekStartOf } from '../../core/weeks.ts';
import { combinedKg, combinedSessions, fairFromSets, lastCreditDate, memberColor } from './view.ts';

export interface MemberWeek {
  id: string;
  name: string;
  initial: string;
  color: string;
  target: number;
  credits: number;
  minCount: number;
  status: WeekCredits['status'];
  line: string;
  today: LocalDate;
  weekStart: LocalDate;
  lastCredit: LocalDate | null;
  fair: FairComparison;
}

export interface DuoSnapshot {
  me: MemberWeek;
  partners: MemberWeek[];
  departed: { id: string; name: string }[];
  archived: boolean;
  crewName: string | null;
  crewTz: string | null;
  plates: number;
  adjusted: boolean;
  weekFull: boolean;
  togetherSessions: number;
  togetherTonnesKg: number;
  spotWeek: LocalDate | null;
  nowIso: string;
  crewId: string | null;
  reduceMotion: boolean;
  batterySaver: boolean;
  openSession: boolean;
}

function line(credits: number, target: number, minCount: number): string {
  const shown = Number.isInteger(credits) ? String(credits) : credits.toFixed(1);
  return `${shown}/${target} · ${minCount} MIN`;
}

async function memberWeek(repo: Repo, profile: Profile, nowIso: string): Promise<MemberWeek> {
  const today = localDateOf(nowIso, profile.tz);
  const weekStart = weekStartOf(today);
  const dates = weekDates(weekStart);
  const from = dates[0];
  const to = dates[6];
  if (from === undefined || to === undefined) throw new Error('Week has no dates');
  const history = await repo.q.entriesBetween(profile.id, '0000-01-01', '9999-12-31');
  const entries = {
    sessions: history.sessions.filter((row) => row.local_date >= from && row.local_date <= to),
    sets: history.sets.filter((row) => row.local_date >= from && row.local_date <= to),
    cardio: history.cardio.filter((row) => row.local_date >= from && row.local_date <= to),
    martial: history.martial.filter((row) => row.local_date >= from && row.local_date <= to),
    min: history.min.filter((row) => row.local_date >= from && row.local_date <= to),
  };
  const credits = weekCredits(entries, weekStart, profile.weekly_target);
  return {
    id: profile.id,
    name: profile.display_name,
    initial: profile.initial,
    color: memberColor(profile.color_hue),
    target: profile.weekly_target,
    credits: credits.credits,
    minCount: credits.minCount,
    status: credits.status,
    line: line(credits.credits, profile.weekly_target, credits.minCount),
    today,
    weekStart,
    lastCredit: lastCreditDate(history),
    fair: fairFromSets(history.sets, today),
  };
}

export async function loadDuo(repo: Repo, nowIso: string): Promise<DuoSnapshot | null> {
  const me = await repo.q.me();
  if (!me) return null;
  const crew = await repo.q.myCrew();
  const members = crew?.members ?? [];
  const activeIds = members.filter((member) => member.left_at === null && member.user_id !== me.id).map((member) => member.user_id);
  const departedIds = members.filter((member) => member.left_at !== null).map((member) => member.user_id);
  const profiles = await repo.q.profiles([...activeIds, ...departedIds]);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const partners: MemberWeek[] = [];
  for (const id of activeIds) {
    const profile = byId.get(id);
    if (profile) partners.push(await memberWeek(repo, profile, nowIso));
  }
  const departed = departedIds.flatMap((id) => {
    const profile = byId.get(id);
    return profile ? [{ id: profile.id, name: profile.display_name }] : [];
  });
  const mine = await memberWeek(repo, me, nowIso);
  const bar = await repo.duo.bar();
  const open = await repo.q.openSession();
  const latest = bar.history.at(-1);
  const everyone = [mine, ...partners];
  const spotWeek = crew ? crewWeekBounds(nowIso, crew.crew.tz).weekStart : mine.weekStart;
  const bounds = weekDates(spotWeek);
  const from = bounds[0];
  const to = bounds[6];
  let togetherSessions = 0;
  let togetherTonnesKg = 0;
  if (from !== undefined && to !== undefined) {
    for (const person of everyone) {
      const history = await repo.q.entriesBetween(person.id, from, to);
      togetherSessions += combinedSessions(history.sessions.map((row) => row.local_date), spotWeek);
      togetherTonnesKg += combinedKg(history.sets, spotWeek);
    }
  }
  return {
    me: mine,
    partners,
    departed,
    archived: departed.length > 0,
    crewName: crew?.crew.name ?? null,
    crewTz: crew?.crew.tz ?? null,
    plates: bar.value,
    adjusted: latest?.adjusted_after_edit === true,
    weekFull: everyone.length > 0 && everyone.every((member) => member.status === 'FULL'),
    togetherSessions,
    togetherTonnesKg,
    spotWeek,
    nowIso,
    crewId: crew?.crew.id ?? null,
    reduceMotion: me.reduce_motion,
    batterySaver: me.battery_saver,
    openSession: open !== undefined,
  };
}
