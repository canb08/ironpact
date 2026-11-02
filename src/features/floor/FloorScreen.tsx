import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { MinEntry, Session, SetRow } from '../../core/types.ts';
import { comebackState } from '../../core/comeback.ts';
import type { Repo } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button, Ring, ToastProvider, copy, fill, useToast } from '../../ui';
import { BarStrip } from '../duo/BarStrip.tsx';
import { loadDuo } from '../duo/load.ts';
import { PresenceBanner } from '../duo/PresenceBanner.tsx';
import { useCrewTick } from '../duo/useCrewTick.ts';
import { useDebugWeek } from '../duo/useDebugWeek.ts';
import { usePresence } from '../duo/usePresence.ts';
import { partnerStatus } from '../duo/view.ts';
import { useRepoQuery } from './useRepoQuery.ts';
import { InstallChip } from './InstallChip.tsx';
import '../duo/duo.css';
import './floor.css';

interface FloorData {
  duo: NonNullable<Awaited<ReturnType<typeof loadDuo>>>;
  last: { session: Session; sets: SetRow[] } | undefined;
  comeback: boolean;
}

async function loadFloor(repo: Repo): Promise<FloorData | null> {
  const now = new Date().toISOString();
  const duo = await loadDuo(repo, now);
  if (!duo) return null;
  return {
    duo,
    last: await repo.q.lastSessionSummary(duo.me.id),
    comeback: comebackState(duo.me.lastCredit, duo.me.today).active,
  };
}

function sessionKindLabel(kind: Session['kind']): string {
  if (kind === 'gym') return copy.gym;
  if (kind === 'run') return copy.run;
  if (kind === 'martial') return copy.martialArts;
  return copy.min;
}

function heaviestWorkingSet(sets: readonly SetRow[]): SetRow | undefined {
  return sets.reduce<SetRow | undefined>((best, set) => {
    if (set.is_warmup) return best;
    if (!best || set.weight_kg > best.weight_kg) return set;
    return best;
  }, undefined);
}

function statusLine(member: FloorData['duo']['me'], live: boolean): string {
  const status = partnerStatus({ live, lastCredit: member.lastCredit, today: member.today });
  if (status.kind === 'live') return copy.trainingNow;
  if (status.kind === 'today') return copy.lastTrainedToday;
  if (status.kind === 'days') return fill(copy.lastTrained, { days: status.days });
  return copy.notTrainedYet;
}

function FloorBody() {
  const repo = useRepo();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tick, setTick] = useState(0);
  const [hideAdjusted, setHideAdjusted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const crewTick = useCrewTick(repo);
  const debugClose = useDebugWeek();
  const presence = usePresence(repo);
  const data = useRepoQuery(() => loadFloor(repo), [repo, tick, crewTick]);

  async function undoMin(entry: MinEntry) {
    const removed = await repo.w.softDelete('min_entries', entry.id);
    if (removed.ok) await repo.w.softDelete('sessions', entry.session_id);
    setTick((value) => value + 1);
  }

  async function onMin() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await repo.w.logMin();
      if (!result.ok) {
        showToast({ message: result.error === 'storage_full' ? copy.storageFull : copy.outOfRange });
        return;
      }
      const entry = result.value;
      showToast({
        message: copy.minLogged,
        action: { label: copy.undo, onClick: () => { void undoMin(entry); } },
      });
      setTick((value) => value + 1);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (data === undefined) {
    return (
      <main className="floor" aria-busy="true">
        <InstallChip />
      </main>
    );
  }
  if (data === null) {
    return (
      <main className="floor">
        <InstallChip />
        <h1>{copy.floor}</h1>
        <p className="floor-empty">{copy.emptyFloor}</p>
      </main>
    );
  }

  const { duo } = data;
  const names = new Map(duo.partners.map((partner) => [partner.id, partner.name]));
  const colors = new Map(duo.partners.map((partner) => [partner.id, partner.color]));
  const liveIds = new Set(presence.rows.map((row) => row.user_id));
  const top = data.last ? heaviestWorkingSet(data.last.sets) : undefined;
  const meRing = {
    id: duo.me.id, name: duo.me.name, initial: duo.me.initial, color: duo.me.color,
    target: duo.me.target, credits: duo.me.credits, minCount: duo.me.minCount,
  };
  const coop = [meRing, ...duo.partners.map((partner) => ({
    id: partner.id, name: partner.name, initial: partner.initial, color: partner.color,
    target: partner.target, credits: partner.credits, minCount: partner.minCount,
  }))];

  return (
    <main className="floor">
      <InstallChip />
      <h1>{copy.floor}</h1>
      <PresenceBanner rows={presence.rows} names={names} colors={colors} nowMs={presence.nowMs} />
      {data.comeback ? (
        <section className="comeback" aria-label={copy.comeback}>
          <h2>{copy.comeback}</h2>
          <Button size="xl" onClick={() => navigate('/session')}>{copy.shortSession}</Button>
          <Button size="xl" variant="secondary" disabled={saving} onClick={() => { void onMin(); }}>{copy.justMin}</Button>
        </section>
      ) : (
        <div className="rings">
          <section className="floor-card" aria-labelledby="my-week-heading">
            <h2 id="my-week-heading">{copy.myWeek}</h2>
            <p className="floor-week" data-testid="my-week">{duo.me.line}</p>
            <Ring members={[meRing]} size="personal" />
            <p className="floor-status">{fill(copy.weeksOn, { count: debugClose ? duo.plates + 1 : duo.plates })}</p>
          </section>
          {duo.partners.length === 0 ? (
            <section className="floor-card" aria-labelledby="partner-week-heading">
              <h2 id="partner-week-heading">{copy.partnerWeek}</h2>
              {duo.archived ? <p className="is-archived">{copy.archived}</p> : <p>{copy.emptyCrew}</p>}
              {duo.departed.map((partner) => <p key={partner.id} className="is-archived">{partner.name}</p>)}
            </section>
          ) : (
            <section className="floor-card" aria-labelledby="partner-week-heading">
              <h2 id="partner-week-heading">{copy.partnerWeek}</h2>
              {duo.archived ? <p className="is-archived">{copy.archived}</p> : (
                <Ring members={coop} size="coop" />
              )}
              {duo.partners.map((partner) => (
                <div key={partner.id}>
                  <h3>{partner.name}</h3>
                  <p className="floor-week" data-testid="partner-week">{partner.line}</p>
                  <p className="floor-status">{statusLine(partner, liveIds.has(partner.id))}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
      <BarStrip
        plates={duo.plates}
        ghost={duo.weekFull}
        archived={duo.archived}
        adjusted={duo.adjusted && !hideAdjusted}
        debugClose={debugClose}
        onDismissAdjusted={() => setHideAdjusted(true)}
        platesTestId="bar-plates"
      />
      <section className="floor-card" aria-labelledby="last-time-heading">
        <h2 id="last-time-heading">{copy.lastTime}</h2>
        {data.last ? (
          <>
            <p data-testid="last-session">{fill(copy.lastSession, { date: data.last.session.local_date, kind: sessionKindLabel(data.last.session.kind) })}</p>
            {top ? <p>{fill(copy.topSet, { reps: top.reps, kg: String(top.weight_kg) })}</p> : null}
          </>
        ) : <p className="floor-empty">{copy.emptyFloor}</p>}
      </section>
      <nav className="floor-links" aria-label={copy.quickLogs}>
        <Link className="ui-button ui-button--secondary" to="/log/run">{copy.run}</Link>
        <Link className="ui-button ui-button--secondary" to="/log/martial">{copy.martialArts}</Link>
        <Link className="ui-button ui-button--secondary" to="/log/weight">{copy.weight}</Link>
        <Link className="ui-button ui-button--secondary" to="/log/min">{copy.min}</Link>
        <Link className="ui-button ui-button--secondary" to="/crew">{copy.crew}</Link>
        <Link className="ui-button ui-button--secondary" to="/settings">{copy.settings}</Link>
      </nav>
      <div className="floor-actions">
        <Button size="xl" onClick={() => navigate('/session')}>{copy.start}</Button>
        <Button size="xl" className="floor-min" disabled={saving} onClick={() => { void onMin(); }}>{copy.min}</Button>
      </div>
    </main>
  );
}

export default function FloorScreen() {
  return (
    <ToastProvider>
      <FloorBody />
    </ToastProvider>
  );
}
