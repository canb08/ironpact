import { useEffect, useRef, useState } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { ProofKind, ProofPhoto } from '../../core/types.ts';
import { copy } from '../../ui/copy.ts';

export function ProofMedia({ photo, eager = false, volume = 0, kind = 'lift' }: { photo?: ProofPhoto; eager?: boolean; volume?: number; kind?: ProofKind }) {
  const repo = useRepo();
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager || typeof IntersectionObserver === 'undefined');
  const [media, setMedia] = useState<{ key: string; url: string; small: string }>();
  const [loaded, setLoaded] = useState('');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = photo ? `${photo.id}:${photo.client_updated_at}` : '';
  useEffect(() => {
    if (eager || !box.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(box.current); return () => observer.disconnect();
  }, [eager]);
  useEffect(() => {
    if (!photo || !visible) return;
    let active = true;
    const refresh = () => {
      void repo.proof.photoUrl(photo.id).then(async (result) => {
        if (!active) return;
        if (!result.ok) { setError(true); return; }
        const preview = new Image(); preview.crossOrigin = 'anonymous'; preview.src = result.value;
        let small = '';
        try {
          await preview.decode();
          const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 32;
          canvas.getContext('2d')?.drawImage(preview, 0, 0, 24, 32);
          small = canvas.toDataURL('image/jpeg', 0.5);
        } catch { /* Signed hosts without CORS still render in the image element. */ }
        if (active) { setMedia({ key, url: result.value, small }); setError(false); }
      }).catch(() => { if (active) setError(true); });
    };
    refresh();
    const timer = window.setInterval(refresh, 230_000);
    return () => { active = false; clearInterval(timer); };
  }, [repo, photo, key, visible, retry]);
  return <div ref={box} className="proof-media">
    <div className="proof-placeholder" aria-hidden={photo ? true : undefined} aria-label={copy.y9NoPhoto} role="img">
      {kind === 'run' ? <svg className="proof-route" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <path d="M24 94 C12 66 78 78 68 52 S28 30 88 18" />
        <circle className="proof-route__start" cx="24" cy="94" r="6" />
        <circle className="proof-route__finish" cx="88" cy="18" r="6" />
      </svg> : <><span className="proof-bar" />
      {[0, 1].map((side) => <span key={side} className={`proof-plates proof-plates--${side}`}>
        {['red', 'blue', 'yellow', 'green'].slice(0, Math.max(1, Math.min(4, Math.ceil(volume / 500)))).map((color) => <i key={color} style={{ background: `var(--plate-${color})` }} />)}
      </span>)}</>}
    </div>
    {media?.key === key && <>
      {media.small && loaded !== key && <img className="proof-media__blur" src={media.small} alt="" aria-hidden="true" />}
      <img className={`proof-media__photo${loaded === key ? ' is-loaded' : ''}`} src={media.url} loading={eager ? 'eager' : 'lazy'} alt={copy.y9Photo} onLoad={() => setLoaded(key)} onError={() => setError(true)} />
    </>}
    {error && eager && <button className="proof-media__retry" onClick={(event) => { event.stopPropagation(); setError(false); setRetry((n) => n + 1); }}>{copy.y9PhotoUnavailable}</button>}
  </div>;
}
