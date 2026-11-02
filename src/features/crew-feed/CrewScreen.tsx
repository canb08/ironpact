import { useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatBodyweight, formatDuration, formatKg, formatKm } from '@shared/export-format.ts';
import { spotOffers } from '../../core/streak.ts';
import type { FeedItem } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { copy, fill } from '../../ui/copy.ts';
import { Button } from '../../ui/Button.tsx';
import { HoldButton } from '../../ui/HoldButton.tsx';
import { Ring } from '../../ui/Ring.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { copyText } from '../export/export.ts';
import { useOnline } from '../export/useOnline.ts';
import { BarStrip } from '../duo/BarStrip.tsx';
import { DuoMoments } from '../duo/DuoMoments.tsx';
import { FairList } from '../duo/FairList.tsx';
import { loadDuo, type DuoSnapshot } from '../duo/load.ts';
import { PresenceBanner } from '../duo/PresenceBanner.tsx';
import { useCrewTick } from '../duo/useCrewTick.ts';
import { useDebugWeek } from '../duo/useDebugWeek.ts';
import { usePresence } from '../duo/usePresence.ts';
import { barTier, formatTonnes, partnerStatus, platesAfterDebugClose } from '../duo/view.ts';
import { groupFeed } from './feed.ts';
import '../duo/duo.css';
import './crew.css';

function entryText(item: FeedItem): string {
  switch (item.type) {
    case 'set': {
      const kg = item.row.weight_kg;
      const load = item.exercise.kind === 'bw_lift'
        ? fill(copy.crewBodyLoad, { load: kg === 0 ? '' : `${kg > 0 ? '+' : ''}${formatKg(kg)}kg` })
        : fill(copy.crewLoad, { kg: formatKg(kg) });
      return fill(copy.crewSet, { exercise: item.exercise.name, reps: item.row.reps, load });
    }
    case 'run': return fill(copy.crewRun, { km: formatKm(item.row.distance_m), duration: formatDuration(item.row.duration_s) });
    case 'martial': return fill(copy.crewMartial, { discipline: item.row.discipline, minutes: item.row.duration_min });
    case 'min': return fill(copy.crewMin, { description: item.row.description });
    case 'weight': return fill(copy.crewWeight, { kg: formatBodyweight(item.row.weight_kg) });
  }
}

export default function CrewScreen() {
  const repo = useRepo();
  const user = useSyncExternalStore(repo.auth.onChange, repo.auth.userId);
  return <CrewFeed key={user} />;
}

function CrewFeed() {
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
  const [hideAdjusted, setHideAdjusted] = useState(false);
  const locked = useRef(false);
  const touch = useRef<number | null>(null);
  const data = useLiveQuery(async () => {
    try {
      const membership = await repo.q.myCrew();
      const now = new Date().toISOString();
      const duo = await loadDuo(repo, now);
      const spots = await repo.duo.spots();
      if (!membership || !duo) return { membership: undefined, partners: [], groups: [], duo, spots };
      const ids = membership.members.filter((m) => m.left_at === null && m.user_id !== repo.auth.userId()).map((m) => m.user_id);
      const [partners, items] = await Promise.all([repo.q.profiles(ids), repo.q.crewFeed(20)]);
      return { membership, partners, groups: groupFeed(items, partners), duo, spots };
    } catch { return { error: true as const, partners: [], groups: [], duo: null, spots: [] }; }
  }, [repo, revision, crewTick]);

  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setMessage('');
    try { await work(); }
    catch { setMessage(copy.networkRetry); }
    finally { locked.current = false; setBusy(false); setRevision((n) => n + 1); }
  }
  const refresh = () => action(() => repo.sync.pullNow());
  const owner = data?.membership?.members.some((m) => m.user_id === repo.auth.userId() && m.role === 'owner');
  const duo: DuoSnapshot | null = data?.duo ?? null;
  const names = new Map((duo?.partners ?? []).map((partner) => [partner.id, partner.name]));
  const colors = new Map((duo?.partners ?? []).map((partner) => [partner.id, partner.color]));
  const liveIds = new Set(presence.rows.map((row) => row.user_id));
  const offers = duo && duo.spotWeek && duo.crewTz ? spotOffers({
    now: duo.nowIso,
    crewTz: duo.crewTz,
    spotter: { userId: duo.me.id, credits: duo.me.credits, target: duo.me.target },
    partners: duo.partners.map((partner) => ({ userId: partner.id, status: partner.status })),
    spotsGivenOn: (data?.spots ?? []).filter((spot) => spot.user_id === duo.me.id).map((spot) => spot.local_date),
  }) : [];

  return (
    <main className="crew-screen" onTouchStart={(e) => { touch.current = window.scrollY <= 0 ? e.touches[0]?.clientY ?? null : null; }}
      onTouchCancel={() => { touch.current = null; }}
      onTouchEnd={(e) => {
        const start = touch.current; touch.current = null;
        if (online && start !== null && (e.changedTouches[0]?.clientY ?? start) - start >= 80) void refresh();
      }}>
      <h1>{data?.membership?.crew.name ?? duo?.crewName ?? copy.crewTitle}</h1>
      {duo ? (
        <DuoMoments
          screen="crew"
          crewId={duo.crewId}
          weekStart={duo.me.weekStart}
          members={[
            {
              id: duo.me.id, name: duo.me.name, initial: duo.me.initial, color: duo.me.color,
              target: duo.me.target, credits: duo.me.credits, minCount: duo.me.minCount,
            },
            ...duo.partners.map((partner) => ({
              id: partner.id, name: partner.name, initial: partner.initial, color: partner.color,
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
      <div className="crew-actions">
        <Button variant="secondary" disabled={busy || !online} onClick={() => void refresh()}>{busy ? copy.loading : copy.refresh}</Button>
        {owner && <Button disabled={busy || !online} onClick={() => void action(async () => {
          const result = await repo.crew.createInvite();
          if (!result.ok) { setMessage(result.error === 'not_crew_owner' ? copy.inviteOwnerOnly : copy.networkRetry); return; }
          const link = new URL(`/join/${encodeURIComponent(result.value)}`, window.location.origin).href;
          setInvite(link);
          setMessage(await copyText(link) ? copy.inviteCopied : copy.clipboardUnavailable);
        })}>{copy.copyInvite}</Button>}
        {invite && <code className="crew-link">{invite}</code>}
      </div>
      <p role="status">{message}</p>
      {!data ? <p>{copy.loading}</p> : data.error ? <p role="alert">{copy.networkRetry}</p> : !data.membership || !duo ? <p>{copy.noCrew}</p> : <>
        {duo.partners.length === 0 ? <p>{copy.emptyCrew}</p> : duo.partners.map((partner) => {
          const status = partnerStatus({ live: liveIds.has(partner.id), lastCredit: partner.lastCredit, today: partner.today });
          const statusText = status.kind === 'live' ? copy.trainingNow
            : status.kind === 'today' ? copy.lastTrainedToday
            : status.kind === 'days' ? fill(copy.lastTrained, { days: status.days })
            : copy.notTrainedYet;
          return (
            <section className={`crew-card${duo.archived ? ' is-archived' : ''}`} key={partner.id} aria-label={partner.name}>
              <h2>{partner.name}</h2>
              {duo.archived ? <p className="crew-status">{copy.archived}</p> : (
                <Ring size="personal" reduced={duo.reduceMotion} members={[{
                  id: partner.id, name: partner.name, initial: partner.initial, color: partner.color,
                  target: partner.target, credits: partner.credits, minCount: partner.minCount,
                }]} />
              )}
              <p className="crew-status">{statusText}</p>
            </section>
          );
        })}
        {duo.partners.length > 0 ? <FairList rows={duo.partners.map((partner) => ({ id: partner.id, name: partner.name, fair: partner.fair }))} /> : null}
        <section className="crew-card" aria-labelledby="together-heading">
          <h2 id="together-heading">{copy.together}</h2>
          <p>{fill(copy.togetherSessions, { count: duo.togetherSessions })}</p>
          <p>{fill(copy.togetherTonnes, { tonnes: formatTonnes(duo.togetherTonnesKg) })}</p>
          <BarStrip
            plates={duo.plates}
            ghost={duo.weekFull}
            archived={duo.archived}
            adjusted={duo.adjusted && !hideAdjusted}
            debugClose={debugClose}
            onDismissAdjusted={() => setHideAdjusted(true)}
            reduced={duo.reduceMotion}
            batterySaver={duo.batterySaver}
          />
        </section>
        {duo.departed.map((partner) => <p key={partner.id} className="is-archived">{partner.name} · {copy.archived}</p>)}
        {offers.map((offer) => {
          const name = names.get(offer.coversUserId) ?? copy.partner;
          return (
            <section className="crew-card" key={offer.coversUserId}>
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
          {data.groups.length === 0 && <p>{copy.crewFeedEmpty}</p>}
          <ol className="crew-feed" aria-label={copy.crewFeedTitle}>
            {data.groups.map((group) => <li className="crew-card" key={group.id}>
              <h3>{fill(group.sets ? copy.crewSession : copy.crewEntry, {
                partner: data.partners.find((p) => p.id === group.user)?.display_name ?? copy.partner, date: group.date,
              })}</h3>
              <ul>{group.items.map((item) => <li key={item.row.id}>
                {entryText(item)}{item.type === 'set' && item.row.is_warmup && <small> · {copy.crewWarmup}</small>}
              </li>)}</ul>
            </li>)}
          </ol>
        {!owner && <p>{copy.inviteOwnerOnly}</p>}
        <Button variant="secondary" className="crew-danger" disabled={busy || !online} onClick={() => setConfirmLeave(true)}>{copy.leaveCrew}</Button>
      </>}
      <Sheet open={confirmLeave} title={copy.leaveCrew} onClose={() => setConfirmLeave(false)}>
        <p>{copy.leaveCrewConfirm}</p>
        <HoldButton aria-label={copy.holdLeaveCrew} variant="secondary" className="crew-danger" disabled={busy || !online} onHoldComplete={() => void action(async () => {
          const result = await repo.crew.leave();
          if (!result.ok) { setMessage(copy.networkRetry); return; }
          setConfirmLeave(false); setInvite(null);
        })}>{copy.holdLeaveCrew}</HoldButton>
        <Button variant="secondary" onClick={() => setConfirmLeave(false)}>{copy.cancel}</Button>
        <p role="status">{message}</p>
      </Sheet>
    </main>
  );
}
