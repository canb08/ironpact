import { useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatBodyweight, formatDuration, formatKg, formatKm } from '@shared/export-format.ts';
import type { FeedItem } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { copy, fill } from '../../ui/copy.ts';
import { Button } from '../../ui/Button.tsx';
import { HoldButton } from '../../ui/HoldButton.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { copyText } from '../export/export.ts';
import { useOnline } from '../export/useOnline.ts';
import { groupFeed } from './feed.ts';
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
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const locked = useRef(false);
  const touch = useRef<number | null>(null);
  const data = useLiveQuery(async () => {
    try {
      const membership = await repo.q.myCrew();
      if (!membership) return { membership: undefined, partners: [], groups: [] };
      const ids = membership.members.filter((m) => m.left_at === null && m.user_id !== repo.auth.userId()).map((m) => m.user_id);
      const [partners, items] = await Promise.all([repo.q.profiles(ids), repo.q.crewFeed(20)]);
      return { membership, partners, groups: groupFeed(items, partners) };
    } catch { return { error: true, partners: [], groups: [] }; }
  }, [repo, revision]);

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

  return (
    <main className="crew-screen" onTouchStart={(e) => { touch.current = window.scrollY <= 0 ? e.touches[0]?.clientY ?? null : null; }}
      onTouchCancel={() => { touch.current = null; }}
      onTouchEnd={(e) => {
        const start = touch.current; touch.current = null;
        if (online && start !== null && (e.changedTouches[0]?.clientY ?? start) - start >= 80) void refresh();
      }}>
      <h1>{data?.membership?.crew.name ?? copy.crewTitle}</h1>
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
      {!data ? <p>{copy.loading}</p> : data.error ? <p role="alert">{copy.networkRetry}</p> : !data.membership ? <p>{copy.noCrew}</p> : <>
        {data.partners.length === 0 ? <p>{copy.emptyCrew}</p> : <>
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
        </>}
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
