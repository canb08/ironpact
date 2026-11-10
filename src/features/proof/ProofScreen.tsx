import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router';
import { useRepo } from '../../app/useRepo.ts';
import { formatDate } from '../../core/formatDate.ts';
import type { ProofCardWithMedia } from '../../core/types.ts';
import { copy, fill } from '../../ui/copy.ts';
import { feel } from '../../ui/feel/feel.ts';
import { startViewTransition } from '../../ui/motion/viewTransition.ts';
import { cardDetails, loadProof, longestStreak, type ProofData } from './model.ts';
import { proofDisplayName } from './names.ts';
import { ProofMedia } from './ProofMedia.tsx';
import { ProofViewer } from './ProofViewer.tsx';
import './proof.css';

export default function ProofScreen() {
  const repo = useRepo();
  const [retry, setRetry] = useState(0);
  const result = useLiveQuery(async () => {
    try { return { data: await loadProof(repo) }; } catch { return { error: true }; }
  }, [repo, retry]);
  if (!result) return <main className="proof-screen"><p role="status">{copy.loading}</p></main>;
  if (!result.data) return <main className="proof-screen"><p role="alert">{copy.y9LoadError}</p><button className="ui-button" onClick={() => setRetry((n) => n + 1)}>{copy.retry}</button></main>;
  return <ProofWall data={result.data} />;
}
function ProofWall({ data }: { data: ProofData }) {
  const [params, setParams] = useSearchParams();
  const selected = data.cards.find((c) => c.id === params.get('card'));
  const together = data.cards.filter((c) => c.together).length;
  const streak = longestStreak(data.cards);
  const months = [...new Set(data.cards.map((c) => c.day.slice(0, 7)))];
  const seenKey = `ironpact.proof-seen:${data.me?.id}`;
  const [newCards] = useState(() => {
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(seenKey) ?? '[]') as string[]; } catch { /* Storage is optional. */ }
    return new Set(data.cards.filter((c) => c.photos.some((p) => p.user_id !== data.me?.id && !seen.includes(`${p.id}:${p.client_updated_at}`))).map((c) => c.id));
  });
  const announced = useRef(false);
  useEffect(() => {
    if (newCards.size && !announced.current) { feel('plate'); announced.current = true; }
    try { localStorage.setItem(seenKey, JSON.stringify(data.cards.flatMap((c) => c.photos.map((p) => `${p.id}:${p.client_updated_at}`)))); } catch { /* No persistence is needed to browse. */ }
  }, [data.cards, newCards, seenKey]);
  function open(id: string | null, replace = false) {
    feel('tick');
    startViewTransition(() => flushSync(() => setParams(id ? { card: id } : {}, { replace })), data.me?.reduce_motion);
  }
  return <main className="proof-screen" data-reduced={data.me?.reduce_motion ? 'true' : undefined}>
    <header className="proof-stats">
      <p className="proof-total">{together === 1 ? copy.y9Session : fill(copy.y9Sessions, { count: together })}</p>
      <p>{streak === 1 ? copy.y9StreakOne : fill(copy.y9Streak, { count: streak })}</p>
    </header>
    {!data.cards.length && <div className="proof-empty"><ProofMedia /><p>{copy.y9Empty}</p></div>}
    {months.map((month) => {
      const cards = data.cards.filter((c) => c.day.startsWith(month));
      return <section key={month} aria-labelledby={`month-${month}`}>
        <h2 id={`month-${month}`}>{fill(copy.y9Month, { month: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)), count: cards.filter((c) => c.together).length })}</h2>
        <div className="proof-grid">{cards.map((card) => {
          const details = cardDetails(card, data);
          return <article key={card.id} className={`proof-card${newCards.has(card.id) ? ' proof-card--new' : ''}`}>
            <button className="proof-card__open" onClick={() => open(card.id)} aria-label={`${formatDate(card.day, data.today, copy)} · ${details.title}`}>
              <div className="proof-card__image" style={{ viewTransitionName: selected ? 'none' : `proof-${card.id}` }}><ProofMedia kind={card.kind} photo={card.photos[0]} volume={details.volume} /></div>
              <span className="proof-card__scrim" />
              <span className="proof-card__text"><time dateTime={card.day}>{formatDate(card.day, data.today, copy)}</time><span className="proof-chip">{details.title}</span><Avatars card={card} data={data} />{details.pr && <span className="proof-pr">{copy.y9Pr}</span>}</span>
            </button>
          </article>;
        })}</div>
      </section>;
    })}
    {selected && <ProofViewer card={selected} data={data} onClose={() => open(null, true)} onChange={(id) => open(id, true)} />}
  </main>;
}
export function Avatars({ card, data }: { card: ProofCardWithMedia; data: ProofData }) {
  const ids = card.together ? [card.created_by, ...data.profiles.map((p) => p.id).filter((id) => id !== card.created_by)].slice(0, 2) : [card.created_by];
  return <span className="proof-avatars" aria-label={card.together ? copy.y9Together : copy.y9Solo}>{ids.map((id) => {
    const profile = data.profiles.find((p) => p.id === id);
    return <span key={id} title={proofDisplayName(profile?.display_name, id === data.me?.id ? copy.x7You : copy.x3Partner)} style={{ background: id === data.me?.id ? 'var(--plate-red)' : 'var(--plate-blue)' }}>{profile?.initial ?? '•'}</span>;
  })}</span>;
}
