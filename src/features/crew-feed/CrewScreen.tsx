import { useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate } from '../../core/formatDate.ts';
import { recomputePrs, type PrEventDraft } from '../../core/prs.ts';
import { spotOffers } from '../../core/streak.ts';
import type { Exercise, Profile, Session } from '../../core/types.ts';
import type { Repo, SessionWithSets } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { BigNumber } from '../../ui/BigNumber.tsx';
import { Button } from '../../ui/Button.tsx';
import { Chip } from '../../ui/Chip.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { HoldButton } from '../../ui/HoldButton.tsx';
import { ListRow } from '../../ui/ListRow.tsx';
import { PlateBar } from '../../ui/PlateBar.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { copyText } from '../export/export.ts';
import { useOnline } from '../export/useOnline.ts';
import { DuoMoments } from '../duo/DuoMoments.tsx';
import { loadDuo, type MemberWeek } from '../duo/load.ts';
import { PresenceBanner } from '../duo/PresenceBanner.tsx';
import { useCrewTick } from '../duo/useCrewTick.ts';
import { useDebugWeek } from '../duo/useDebugWeek.ts';
import { usePresence } from '../duo/usePresence.ts';
import { barTier, formatRawKg, memberColor, partnerStatus, platesAfterDebugClose } from '../duo/view.ts';
import { usePartnerPrShockwave } from '../prs/usePartnerPrShockwave.ts';
import { formatEntry, groupFeed, itemsFromHistory, type FeedDay } from './feed.ts';
import { longestSharedStreak, monthBounds, prsThisWeek, sessionsTogether, topSets, volumeKg } from './stats.ts';
import '../duo/duo.css';
import './crew.css';

interface Hero {
  partner: MemberWeek;
  last: SessionWithSets | undefined;
  prs: PrEventDraft[];
}

interface MonthStats {
  sessions: number;
  volumeKg: number;
  streak: number;
}

function shownName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed && trimmed !== copy.x3LegacyName ? trimmed : fallback;
}

function kindLabel(kind: Session['kind']): string {
  if (kind === 'gym') return copy.x3Workout;
  if (kind === 'run') return copy.x3Run;
  if (kind === 'martial') return copy.x3Fight;
  return copy.x3Min;
}

function prLine(event: PrEventDraft, exercises: readonly Exercise[]): { title: string; detail: string } {
  const title = exercises.find((row) => row.id === event.exercise_id)?.name ?? copy.x7Lift;
  const type = event.pr_type === 'e1rm' ? copy.x7PrMax
    : event.pr_type === 'rep_max' ? fill(copy.x7RepMax, { reps: event.reps ?? 0 })
      : event.pr_type === 'volume' ? copy.x7PrVolume
        : event.pr_type === 'pace' ? copy.x7PrPace
          : copy.x7PrDistance;
  const unit = event.pr_type === 'pace' ? copy.x3SecondsPerKm : event.pr_type === 'distance' ? copy.x3Metres : copy.x3Kg;
  return { title, detail: fill(copy.x7PrLine, { type, value: formatRawKg(event.value), unit }) };
}

async function loadCrew(repo: Repo) {
  const membership = await repo.q.myCrew();
  const now = new Date().toISOString();
  const duo = await loadDuo(repo, now);
  const spots = await repo.duo.spots();
  if (!membership || !duo) return { membership, duo, spots, profiles: [] as Profile[], exercises: [] as Exercise[], days: [] as FeedDay[], heroes: [] as Hero[], month: null as MonthStats | null };
  const meId = repo.auth.userId();
  const partnerIds = duo.partners.map((partner) => partner.id);
  const [profiles, exercises, partnerItems, meEntries, lasts, histories] = await Promise.all([
    repo.q.profiles(meId ? [meId, ...partnerIds] : partnerIds),
    repo.q.exercises(),
    repo.q.crewFeed(20),
    meId ? repo.q.entriesBetween(meId, '0000-01-01', '9999-12-31') : Promise.resolve(null),
    Promise.all(duo.partners.map((partner) => repo.q.lastSessionSummary(partner.id))),
    Promise.all(duo.partners.map((partner) => repo.q.entriesBetween(partner.id, '0000-01-01', '9999-12-31'))),
  ]);
  const mine = meEntries ? itemsFromHistory(meEntries, exercises) : [];
  const days = groupFeed([...partnerItems, ...mine], profiles, { selfId: meId });
  const heroes: Hero[] = duo.partners.map((partner, index) => {
    const history = histories[index];
    const prs = history ? prsThisWeek(recomputePrs({
      sessions: history.sessions, sets: history.sets, cardio: history.cardio,
      bodyweights: history.bodyweight, exercises,
    }), partner.weekStart, partner.today) : [];
    return { partner, last: lasts[index], prs };
  });
  const bounds = monthBounds(duo.me.today);
  const members = [
    ...(meEntries ? [{ entries: meEntries, target: duo.me.target, dates: meEntries.sessions.map((row) => row.local_date), sets: meEntries.sets }] : []),
    ...duo.partners.map((partner, index) => {
      const history = histories[index];
      return { entries: history, target: partner.target, dates: history?.sessions.map((row) => row.local_date) ?? [], sets: history?.sets ?? [] };
    }),
  ].filter((member) => member.entries);
  const month: MonthStats = {
    sessions: sessionsTogether(members.map((member) => member.dates), bounds.from, bounds.to),
    volumeKg: members.reduce((sum, member) => sum + volumeKg(member.sets, bounds.from, bounds.to), 0),
    streak: longestSharedStreak(members.flatMap((member) => member.entries ? [{ entries: member.entries, target: member.target }] : []), duo.me.today),
  };
  return { membership, duo, spots, profiles, exercises, days, heroes, month: duo.partners.length > 0 ? month : null };
}

export default function CrewScreen() {
  const repo = useRepo();
  const user = useSyncExternalStore(repo.auth.onChange, repo.auth.userId);
  return <CrewFeed key={user} />;
}

function CrewFeed() {
  usePartnerPrShockwave();
  const repo = useRepo();
  const online = useOnline(repo);
  const crewTick = useCrewTick(repo);
  const presence = usePresence(repo);
  const debugClose = useDebugWeek();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const locked = useRef(false);
  const touch = useRef<number | null>(null);
  const data = useLiveQuery(async () => {
    try { return await loadCrew(repo); }
    catch { return { error: true as const, profiles: [], exercises: [], days: [], heroes: [], month: null, duo: null, spots: [] }; }
  }, [repo, revision, crewTick]);

  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try { await work(); }
    catch { setMessage(copy.networkRetry); }
    finally { locked.current = false; setBusy(false); setRevision((n) => n + 1); }
  }

  const refresh = () => { if (online) void action(() => repo.sync.pullNow()); };
  const meId = repo.auth.userId();
  const membership = data && 'membership' in data ? data.membership : undefined;
  const owner = membership?.members.some((member) => member.user_id === meId && member.role === 'owner') ?? false;
  const duo = data && 'duo' in data ? data.duo : null;
  const names = new Map((duo?.partners ?? []).map((partner) => [partner.id, shownName(partner.name, copy.x7Partner)]));
  const colors = new Map((duo?.partners ?? []).map((partner) => [partner.id, partner.color]));
  const profiles = new Map((data?.profiles ?? []).map((profile) => [profile.id, profile]));
  const liveIds = new Set(presence.rows.map((row) => row.user_id));
  const offers = duo && duo.spotWeek && duo.crewTz ? spotOffers({
    now: duo.nowIso,
    crewTz: duo.crewTz,
    spotter: { userId: duo.me.id, credits: duo.me.credits, target: duo.me.target },
    partners: duo.partners.map((partner) => ({ userId: partner.id, status: partner.status })),
    spotsGivenOn: (data && 'spots' in data ? data.spots : []).filter((spot) => spot.user_id === duo.me.id).map((spot) => spot.local_date),
  }) : [];
  const canShare = typeof navigator.share === 'function';

  async function publishInvite(mode: 'copy' | 'share') {
    await action(async () => {
      const result = await repo.crew.createInvite();
      if (!result.ok) {
        setMessage(result.error === 'not_crew_owner' ? copy.inviteOwnerOnly : copy.networkRetry);
        return;
      }
      const link = new URL(`/join/${encodeURIComponent(result.value)}`, window.location.origin).href;
      setInvite(link);
      if (mode === 'share' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: copy.appName, text: copy.x7ShareText, url: link });
          setMessage(copy.x7Shared);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      setMessage(await copyText(link) ? copy.inviteCopied : copy.clipboardUnavailable);
    });
  }

  const today = duo?.me.today ?? '';
  const friendly = (date: string) => formatDate(date, today, copy);
  const inviteBlock = (prominent: boolean) => (
    <div className={prominent ? 'crew-invite crew-invite--primary' : 'crew-invite crew-invite--quiet'}>
      {owner ? <>
        <Button variant={prominent ? 'primary' : 'secondary'} disabled={busy || !online} onClick={() => void publishInvite('copy')}>{copy.x7Invite}</Button>
        {canShare ? <Button variant={prominent ? 'secondary' : 'quiet'} disabled={busy || !online} onClick={() => void publishInvite('share')}>{copy.x7Share}</Button> : null}
      </> : <p className="crew-muted">{copy.inviteOwnerOnly}</p>}
      {invite ? <code className="crew-link">{invite}</code> : null}
      <p role="status">{message}</p>
    </div>
  );

  return (
    <main className="crew-screen" onTouchStart={(event) => { touch.current = window.scrollY <= 0 ? event.touches[0]?.clientY ?? null : null; }}
      onTouchCancel={() => { touch.current = null; }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (start !== null && (event.changedTouches[0]?.clientY ?? start) - start >= 80) refresh();
      }}>
      {duo ? (
        <DuoMoments
          screen="crew"
          crewId={duo.crewId}
          weekStart={duo.me.weekStart}
          members={[
            { id: duo.me.id, name: shownName(duo.me.name, copy.x7You), initial: duo.me.initial, color: duo.me.color, target: duo.me.target, credits: duo.me.credits, minCount: duo.me.minCount },
            ...duo.partners.map((partner) => ({
              id: partner.id, name: shownName(partner.name, copy.x7Partner), initial: partner.initial, color: partner.color,
              target: partner.target, credits: partner.credits, minCount: partner.minCount,
            })),
          ]}
          weekFull={duo.weekFull}
          plates={debugClose ? platesAfterDebugClose(duo.plates) : duo.plates}
          tier={barTier(debugClose ? platesAfterDebugClose(duo.plates) : duo.plates)}
          reduced={duo.reduceMotion}
          archived={duo.archived}
          inSession={duo.openSession}
        />
      ) : null}
      {duo ? <PresenceBanner rows={presence.rows} names={names} colors={colors} nowMs={presence.nowMs} /> : null}
      {!online && <p role="status">{copy.offline}</p>}
      {!data ? <p>{copy.loading}</p> : 'error' in data && data.error ? <p role="alert">{copy.networkRetry}</p> : !membership || !duo ? <p>{copy.noCrew}</p> : <>
        {data.heroes.length === 0 ? <>
          <p>{copy.x7NoPartner}</p>
          {inviteBlock(true)}
        </> : data.heroes.map(({ partner, last, prs }) => {
          const name = shownName(partner.name, copy.x7Partner);
          const status = partnerStatus({ live: liveIds.has(partner.id), lastCredit: partner.lastCredit, today: partner.today });
          const statusText = status.kind === 'live' ? null
            : status.kind === 'today' ? copy.lastTrainedToday
              : status.kind === 'days' ? fill(copy.lastTrained, { days: status.days })
                : copy.notTrainedYet;
          const tops = last ? topSets(last.sets) : [];
          return (
            <section className="crew-hero" key={partner.id} aria-labelledby={`partner-${partner.id}`}>
              <h2 id={`partner-${partner.id}`} className="crew-name">
                <span className="crew-swatch" style={{ background: partner.color }} aria-hidden="true" />
                {name}
              </h2>
              {statusText ? <p className="crew-muted">{statusText}</p> : null}
              <div className="crew-bar" aria-hidden="true">
                <PlateBar members={[
                  { credits: 0, target: partner.target },
                  { name, credits: partner.credits, target: partner.target, minCount: partner.minCount },
                ]} />
              </div>
              <p className="crew-week">{fill(copy.x7ThisWeek, { credits: formatRawKg(partner.credits), target: partner.target })}</p>
              <h3 className="crew-kicker">{copy.x7Last}</h3>
              {!last ? <p className="crew-muted">{copy.x7NoWorkout}</p> : tops.length === 0 ? (
                <ListRow title={kindLabel(last.session.kind)} detail={friendly(last.session.local_date)} />
              ) : tops.map((set) => (
                <ListRow key={set.exerciseId}
                  title={data.exercises.find((row) => row.id === set.exerciseId)?.name ?? copy.x7Lift}
                  detail={fill(copy.x7TopSet, { date: friendly(last.session.local_date), reps: set.reps, kg: formatRawKg(set.kg) })} />
              ))}
              {prs.length > 0 ? <>
                <h3 className="crew-kicker">{copy.x7Prs}</h3>
                <ul className="crew-prs">
                  {prs.map((event) => {
                    const line = prLine(event, data.exercises);
                    return <li key={`${event.source_id}:${event.pr_type}`}>
                      <ListRow className="crew-pr" title={line.title} detail={line.detail} trailing={<Chip tone="pr">{copy.x3Pr}</Chip>} />
                    </li>;
                  })}
                </ul>
              </> : null}
            </section>
          );
        })}
        {duo.archived ? <p className="crew-muted">{copy.x3Archived}</p> : null}
        {data.month ? (
          <section aria-labelledby="crew-month">
            <h2 id="crew-month">{copy.x7Month}</h2>
            <div className="crew-month">
              <div className="crew-stat">
                <BigNumber value={data.month.sessions} size="hero" />
                <span className="crew-kicker">{copy.x7Sessions}</span>
              </div>
              <div className="crew-stat">
                <BigNumber value={formatRawKg(data.month.volumeKg)} size="hero" unit={copy.x3Kg} />
                <span className="crew-kicker">{copy.x7Volume}</span>
              </div>
              <div className="crew-stat">
                <BigNumber value={data.month.streak} size="hero" />
                <span className="crew-kicker">{data.month.streak === 1 ? copy.x7StreakOne : copy.x7Streak}</span>
              </div>
            </div>
          </section>
        ) : null}
        {offers.map((offer) => {
          const name = names.get(offer.coversUserId) ?? copy.x7Partner;
          return (
            <section className="crew-spot" key={offer.coversUserId}>
              <p>{fill(offer.eligible ? copy.spotOffer : copy.spotNotEligible, { partner: name })}</p>
              {offer.eligible && duo.spotWeek ? <Button disabled={busy || !online} onClick={() => {
                const week = duo.spotWeek;
                if (!week) return;
                void action(async () => {
                  const result = await repo.duo.useSpot(week);
                  setMessage(result.ok ? fill(copy.spotSent, { partner: name }) : copy.networkRetry);
                });
              }}>{copy.spotButton}</Button> : null}
            </section>
          );
        })}
        <h2>{copy.crewFeedTitle}</h2>
        {data.days.length === 0 && <p className="crew-muted">{copy.crewFeedEmpty}</p>}
        <ol className="crew-feed" aria-label={copy.crewFeedTitle}>
          {data.days.map((day) => <li key={day.date}>
            <h3 className="crew-kicker"><time dateTime={day.date}>{friendly(day.date)}</time></h3>
            <ul>
              {day.entries.map((entry) => {
                const profile = profiles.get(entry.user);
                const name = shownName(profile?.display_name ?? '', entry.user === meId ? copy.x7You : copy.x7Partner);
                const hue = profile?.color_hue;
                const color = entry.user === meId ? duo.me.color : colors.get(entry.user) ?? memberColor(typeof hue === 'number' ? hue : 220);
                return <li key={entry.id}>
                  <p className="crew-person">
                    <span className="crew-swatch" style={{ background: color }} aria-hidden="true" />
                    {name}
                  </p>
                  <ul>{entry.items.map((item) => <li key={item.row.id}>
                    {formatEntry(item)}
                    {item.type === 'set' && item.row.is_warmup ? <small> {copy.x7Warmup}</small> : null}
                  </li>)}</ul>
                </li>;
              })}
            </ul>
          </li>)}
        </ol>
        {duo.departed.map((partner) => <p key={partner.id} className="crew-muted">{shownName(partner.name, copy.x7Partner)} {copy.archived}</p>)}
        {data.heroes.length > 0 ? inviteBlock(false) : null}
        <Button variant="secondary" className="crew-leave" disabled={busy || !online} onClick={() => setConfirmLeave(true)}>{copy.leaveCrew}</Button>
      </>}
      <Sheet open={confirmLeave} title={copy.leaveCrew} onClose={() => setConfirmLeave(false)}>
        <p>{copy.leaveCrewConfirm}</p>
        <HoldButton aria-label={copy.holdLeaveCrew} variant="secondary" className="crew-danger" disabled={busy || !online} onHoldComplete={() => void action(async () => {
          const result = await repo.crew.leave();
          if (!result.ok) { setMessage(copy.networkRetry); return; }
          setConfirmLeave(false);
          setInvite(null);
        })}>{copy.holdLeaveCrew}</HoldButton>
        <Button variant="secondary" onClick={() => setConfirmLeave(false)}>{copy.cancel}</Button>
        <p role="status">{message}</p>
      </Sheet>
    </main>
  );
}
