import { Link, useNavigate } from 'react-router';
import { Dumbbell, Footprints, Scale, Swords, Timer } from 'lucide-react';
import type { Session, SetRow } from '../../core/types.ts';
import type { Repo, SessionWithSets } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { formatDate } from '../../core/formatDate.ts';
import { ListRow, copy, fill } from '../../ui';
import { usePartnerPrShockwave } from '../prs/usePartnerPrShockwave.ts';
import { DuoMoments } from '../duo/DuoMoments.tsx';
import { loadDuo } from '../duo/load.ts';
import { PresenceBanner } from '../duo/PresenceBanner.tsx';
import { useCrewTick } from '../duo/useCrewTick.ts';
import { useDebugWeek } from '../duo/useDebugWeek.ts';
import { usePresence } from '../duo/usePresence.ts';
import { barTier, combinedKg, formatRawKg, platesAfterDebugClose, shiftDays } from '../duo/view.ts';
import { useRepoQuery } from './useRepoQuery.ts';
import { InstallChip } from './InstallChip.tsx';
import { SharedBar } from './SharedBar.tsx';
import '../duo/duo.css';
import './floor.css';

async function loadFloor(repo: Repo) {
  const duo = await loadDuo(repo, new Date().toISOString());
  if (!duo) return null;
  const [last, partners, entries, prs, exercises] = await Promise.all([
    repo.q.lastSessionSummary(duo.me.id),
    Promise.all(duo.partners.map(async (member) => ({
      member, last: await repo.q.lastSessionSummary(member.id),
    }))),
    repo.q.entriesBetween(duo.me.id, duo.me.weekStart, shiftDays(duo.me.weekStart, 6)),
    repo.q.prEvents({ since: duo.me.weekStart }),
    repo.q.exercises(),
  ]);
  return { duo, last, partners, volume: combinedKg(entries.sets, duo.me.weekStart),
    prs: prs.filter((pr) => pr.local_date <= duo.me.today), exercises };
}

type FloorData = NonNullable<Awaited<ReturnType<typeof loadFloor>>>;

/** Old default profiles called everyone Athlete; don't present it as a real name. */
function memberName(name: string, fallback: string): string {
  return name.trim() && name.trim() !== copy.x3LegacyName ? name.trim() : fallback;
}

function friendlyDate(date: string, today?: string): string {
  return formatDate(date, today ?? date, copy);
}

function sessionKindLabel(kind: Session['kind']): string {
  if (kind === 'gym') return copy.x3Workout;
  if (kind === 'run') return copy.x3Run;
  if (kind === 'martial') return copy.x3Fight;
  return copy.x3Min;
}

function heaviestWorkingSet(sets: readonly SetRow[]): SetRow | undefined {
  return sets.reduce<SetRow | undefined>((best, set) => {
    if (set.is_warmup) return best;
    return !best || set.weight_kg > best.weight_kg ? set : best;
  }, undefined);
}

function sessionDetail(last: SessionWithSets, data: FloorData, today: string): string {
  const top = heaviestWorkingSet(last.sets);
  const date = friendlyDate(last.session.local_date, today);
  if (!top) return fill(copy.x3SessionDetail, { date, kind: sessionKindLabel(last.session.kind) });
  const exercise = data.exercises.find((row) => row.id === top.exercise_id)?.name ?? copy.x3Workout;
  return fill(copy.x3SetDetail, { date, exercise, reps: top.reps, kg: formatRawKg(top.weight_kg) });
}

const quickLogs = [
  { to: '/log/run', label: copy.x3Run, Icon: Footprints },
  { to: '/log/martial', label: copy.x3Fight, Icon: Swords },
  { to: '/log/weight', label: copy.x3WeighIn, Icon: Scale },
  { to: '/log/min', label: copy.x3Min, Icon: Timer },
];

export default function FloorScreen() {
  usePartnerPrShockwave();
  const repo = useRepo();
  const navigate = useNavigate();
  const crewTick = useCrewTick(repo);
  const debugClose = useDebugWeek();
  const presence = usePresence(repo);
  const data = useRepoQuery(() => loadFloor(repo), [repo, crewTick]);

  if (data === undefined) return <main className="floor" aria-busy="true" />;
  if (data === null) return <main className="floor"><p>{copy.x3Empty}</p><InstallChip /></main>;

  const { duo } = data;
  const me = { ...duo.me, name: memberName(duo.me.name, copy.x3You) };
  const partners = duo.partners.map((member) => ({ ...member, name: memberName(member.name, copy.x3Partner) }));
  const partner = partners[0];
  const members = [me, ...partners];
  const shownPlates = debugClose ? platesAfterDebugClose(duo.plates) : duo.plates;
  const names = new Map(partners.map((member) => [member.id, member.name]));
  const colors = new Map(partners.map((member) => [member.id, member.color]));

  return <main className="floor">
    <DuoMoments screen="floor" crewId={duo.crewId} weekStart={me.weekStart}
      members={members} weekFull={duo.weekFull} plates={shownPlates}
      tier={barTier(shownPlates)} reduced={duo.reduceMotion}
      archived={duo.archived} inSession={duo.openSession} />
    <p className="floor-date"><time dateTime={me.today}>{friendlyDate(me.today)}</time></p>
    <section className="floor-hero" aria-label={copy.x3SharedBar} data-testid="shared-bar" data-user={me.id} data-partner={partner?.id}>
      <SharedBar me={me} partner={partner} reduced={duo.reduceMotion || duo.batterySaver} />
      {duo.archived ? <p className="floor-note">{copy.x3Archived}</p>
        : !partner ? <p className="floor-note">{copy.x3Invite}</p> : null}
    </section>
    <Link className="ui-button ui-button--primary ui-button--xl floor-start" to="/session">
      <Dumbbell size={24} aria-hidden="true" />{copy.x3StartWorkout}
    </Link>
    <nav className="floor-quicklogs" aria-label={copy.x3QuickLogs}>
      {quickLogs.map(({ to, label, Icon }) => <Link key={to} to={to}>
        <Icon size={24} aria-hidden="true" /><span>{label}</span>
      </Link>)}
    </nav>
    <p className="floor-min-hint">{copy.x3MinHint}</p>
    <PresenceBanner rows={presence.rows} names={names} colors={colors} nowMs={presence.nowMs} />
    <section className="floor-activity" aria-label={copy.x3Activity}>
      <ListRow className="floor-you-row" title={fill(copy.x3LastWorkout, { name: me.name })}
        detail={data.last ? sessionDetail(data.last, data, me.today) : copy.x3NoWorkouts}
        chevron={!!data.last} onClick={data.last ? () => navigate(`/day/${data.last!.session.local_date}`) : undefined} />
      {data.partners.map(({ member, last }) => <ListRow key={member.id}
        className="floor-partner-row"
        title={fill(copy.x3LastWorkout, { name: memberName(member.name, copy.x3Partner) })}
        detail={last ? sessionDetail(last, data, member.today) : copy.x3NoWorkouts} />)}
      {data.prs.map((pr) => <ListRow key={pr.id} className="floor-pr-row"
        title={data.exercises.find((row) => row.id === pr.exercise_id)?.name ?? copy.x3Run}
        detail={fill(copy.x3PrDetail, { date: friendlyDate(pr.local_date, me.today),
          type: pr.pr_type === 'e1rm' ? copy.x3PrMax : pr.pr_type === 'rep_max' ? fill(copy.x3RepMax, { reps: pr.reps ?? 0 })
            : pr.pr_type === 'volume' ? copy.x3PrVolume : pr.pr_type === 'pace' ? copy.x3PrPace : copy.x3PrDistance,
          value: formatRawKg(pr.value), unit: pr.pr_type === 'pace' ? copy.x3SecondsPerKm : pr.pr_type === 'distance' ? copy.x3Metres : copy.x3Kg })}
        trailing={<span className="ui-chip ui-chip--pr">{copy.x3Pr}</span>}
        chevron={!!pr.exercise_id} onClick={pr.exercise_id ? () => navigate(`/exercise/${pr.exercise_id}`) : undefined} />)}
    </section>
    <p className="floor-volume">{fill(copy.x3Volume, { kg: formatRawKg(data.volume) })}</p>
    {shownPlates >= 1 && <p className="floor-note" data-testid="week-streak">{fill(copy.x3Streak, { count: shownPlates })}</p>}
    {duo.adjusted && <p className="floor-note">{copy.x3Adjusted}</p>}
    {debugClose && <p className="floor-note" role="status" data-testid="debug-week">{copy.x3DebugWeek}</p>}
    <InstallChip />
  </main>;
}
