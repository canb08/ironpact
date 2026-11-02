import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { MinEntry, Session, SetRow } from '../../core/types.ts';
import { weekCredits } from '../../core/credits.ts';
import { localDateOf, weekDates, weekStartOf } from '../../core/weeks.ts';
import type { Repo } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button, ToastProvider, copy, fill, useToast } from '../../ui';
import { formatWeekText } from './formatWeekText.ts';
import { useRepoQuery } from './useRepoQuery.ts';
import { InstallChip } from './InstallChip.tsx';
import './floor.css';

interface PartnerLine {
  id: string;
  name: string;
  line: string;
}

interface FloorData {
  mine: string;
  partners: PartnerLine[];
  last: { session: Session; sets: SetRow[] } | undefined;
}

async function weekLine(repo: Repo, userId: string, tz: string, target: number, now: string): Promise<string> {
  const start = weekStartOf(localDateOf(now, tz));
  const dates = weekDates(start);
  const from = dates[0];
  const to = dates[6];
  if (from === undefined || to === undefined) throw new Error('Week has no dates');
  const entries = await repo.q.entriesBetween(userId, from, to);
  const credits = weekCredits(entries, start, target);
  return formatWeekText(credits.credits, target, credits.minCount);
}

async function loadFloor(repo: Repo): Promise<FloorData | null> {
  const profile = await repo.q.me();
  if (!profile) return null;
  const now = new Date().toISOString();
  const crew = await repo.q.myCrew();
  const partnerIds = (crew?.members ?? []).map((member) => member.user_id).filter((id) => id !== profile.id);
  const partnerProfiles = await repo.q.profiles(partnerIds);
  const partners: PartnerLine[] = [];
  for (const partner of partnerProfiles) {
    partners.push({
      id: partner.id,
      name: partner.display_name,
      line: await weekLine(repo, partner.id, partner.tz, partner.weekly_target, now),
    });
  }
  return {
    mine: await weekLine(repo, profile.id, profile.tz, profile.weekly_target, now),
    partners,
    last: await repo.q.lastSessionSummary(profile.id),
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

function FloorBody() {
  const repo = useRepo();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const data = useRepoQuery(() => loadFloor(repo), [repo, tick]);

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

  const top = data.last ? heaviestWorkingSet(data.last.sets) : undefined;

  return (
    <main className="floor">
      <InstallChip />
      <h1>{copy.floor}</h1>
      <section className="floor-card" aria-labelledby="my-week-heading">
        <h2 id="my-week-heading">{copy.myWeek}</h2>
        <p className="floor-week" data-testid="my-week">{data.mine}</p>
      </section>
      {data.partners.length === 0 ? null : (
        <section className="floor-card" aria-labelledby="partner-week-heading">
          <h2 id="partner-week-heading">{copy.partnerWeek}</h2>
          {data.partners.map((partner) => (
            <div key={partner.id}>
              <h3>{partner.name}</h3>
              <p className="floor-week" data-testid="partner-week">{partner.line}</p>
            </div>
          ))}
        </section>
      )}
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
