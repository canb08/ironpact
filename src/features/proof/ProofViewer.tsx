import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRepo } from '../../app/useRepo.ts';
import type { ProofCardWithMedia } from '../../core/types.ts';
import { formatDate } from '../../core/formatDate.ts';
import { copy } from '../../ui/copy.ts';
import { feel } from '../../ui/feel/feel.ts';
import { cardDetails, type ProofData } from './model.ts';
import { ProofMedia } from './ProofMedia.tsx';

export function ProofViewer({ card, data, onClose, onChange }: { card: ProofCardWithMedia; data: ProofData; onClose: () => void; onChange: (id: string) => void }) {
  const repo = useRepo();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const index = data.cards.findIndex((c) => c.id === card.id);
  const ownPhoto = card.photos.find((p) => p.user_id === data.me?.id);
  const canPhoto = card.together || card.created_by === data.me?.id;
  const details = cardDetails(card, data);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    node?.showModal(); document.body.style.overflow = 'hidden';
    return () => { node?.close(); document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  function move(delta: number) {
    const next = data.cards[index + delta];
    if (!next) return;
    setMenu(false); setCaption(null); setError(''); onChange(next.id);
  }
  async function action(run: () => Promise<{ ok: boolean }>) {
    if (busy) return;
    setBusy(true); setError('');
    try { const result = await run(); if (!result.ok) { setError(copy.y9SaveError); feel('error'); } else { feel('tick'); setMenu(false); setCaption(null); } }
    catch { setError(copy.y9SaveError); feel('error'); }
    finally { setBusy(false); }
  }
  return createPortal(<dialog className="proof-viewer" ref={dialog} aria-label={copy.y9Title} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="proof-viewer__header"><button onClick={onClose}>{copy.close}</button><time dateTime={card.day}>{formatDate(card.day, data.today, copy)}</time><button aria-label={copy.y9Menu} aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button></header>
    {menu && <div className="proof-menu">
      {canPhoto && <button disabled={busy} onClick={() => input.current?.click()}>{ownPhoto ? copy.y9Replace : copy.y9AddPhoto}</button>}
      {ownPhoto && <button disabled={busy} onClick={() => { void action(() => repo.proof.removePhoto(ownPhoto.id)); }}>{copy.y9Remove}</button>}
      {card.created_by === data.me?.id && <button onClick={() => setCaption(card.caption ?? '')}>{copy.y9Caption}</button>}
    </div>}
    <input ref={input} hidden type="file" accept="image/*" aria-label={copy.y9Replace} onChange={(event) => { const file = event.target.files?.[0]; if (file) void action(() => repo.proof.addPhoto(card.id, file)); event.target.value = ''; }} />
    <div className="proof-viewer__photos" style={{ viewTransitionName: `proof-${card.id}` }}
      onPointerDown={(event) => { gesture.current = { x: event.clientX, y: event.clientY }; }}
      onPointerUp={(event) => { const start = gesture.current; gesture.current = null; if (!start) return; const dx = event.clientX - start.x; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5) move(dx < 0 ? 1 : -1); }}
      onPointerCancel={() => { gesture.current = null; }}>
      {card.photos.length ? card.photos.map((photo) => <ProofMedia key={photo.id} photo={photo} eager />) : <ProofMedia volume={details.volume} eager />}
    </div>
    <div className="proof-viewer__paging"><button disabled={index === 0 || busy} onClick={() => move(-1)}>{copy.y9Previous}</button><button disabled={index === data.cards.length - 1 || busy} onClick={() => move(1)}>{copy.y9Next}</button></div>
    <section className="proof-viewer__details" aria-label={copy.y9Details}>
      <h2>{details.title}</h2>{details.pr && <p className="proof-pr">{copy.y9Pr}</p>}
      {card.caption && <p>{card.caption}</p>}
      {details.lines.map((line, i) => <p key={i}>{line}</p>)}
      {caption !== null && <form onSubmit={(event) => { event.preventDefault(); void action(() => repo.proof.setCaption(card.id, caption.trim() || null)); }}>
        <label htmlFor="proof-caption">{copy.y9Caption}</label><input id="proof-caption" value={caption} maxLength={80} onChange={(event) => setCaption(event.target.value)} />
        <button disabled={busy}>{copy.y9SaveCaption}</button>
      </form>}
      {error && <p role="alert">{error}</p>}
    </section>
  </dialog>, document.body);
}
