import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import { Button, Sheet, copy, fill } from '../../ui';
import { feel } from '../../ui/feel/feel.ts';
import type { ProofPromptInput } from './promptContext.ts';
import './proof.css';

export default function ProofPrompt({ input, onDone }: { input: ProofPromptInput; onDone: () => void }) {
  const repo = useRepo();
  const [photoStep, setPhotoStep] = useState(false);
  const [together, setTogether] = useState(input.defaultTogether ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const cardId = useRef<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const partner = useLiveQuery(async () => {
    const [me, crew] = await Promise.all([repo.q.me(), repo.q.myCrew()]);
    const id = crew?.members.find((m) => m.user_id !== me?.id && !m.left_at)?.user_id;
    return id ? (await repo.q.profiles([id]))[0]?.display_name || copy.y9Partner : null;
  }, [repo]);
  async function save(withPartner: boolean, file?: File, dismiss = false) {
    if (saving.current) { if (dismiss) onDone(); return; }
    saving.current = true;
    setBusy(true); setError('');
    if (dismiss) onDone();
    try {
      if (!cardId.current) {
        const result = await repo.proof.createOrJoinCard({ kind: input.kind, day: input.day, entryRef: input.entryRef, together: withPartner });
        if (!result.ok) { if (result.error === 'no_crew') { onDone(); return; } throw new Error('save'); }
        cardId.current = result.value.id;
      }
      if (file) {
        const result = await repo.proof.addPhoto(cardId.current, file);
        if (!result.ok) { setError(result.error === 'invalid_image' ? copy.y9InvalidImage : copy.y9SaveError); feel('error'); return; }
      }
      feel('tick'); onDone();
    } catch { setError(copy.y9SaveError); feel('error'); }
    finally { saving.current = false; setBusy(false); }
  }
  const choose = (value: boolean) => { setTogether(value); setPhotoStep(true); feel('tick'); };
  return <Sheet open title={photoStep ? copy.y9AddPhoto : copy.y9Together} onClose={() => { void save(false, undefined, true); }}>
    <div className="proof-prompt">
      <p>{copy.summarySaved}</p>
      {photoStep ? <>
        <p>{copy.y9Privacy}</p>
        <Button size="xl" disabled={busy} onClick={() => camera.current?.click()}>{copy.y9TakePhoto}</Button>
        <Button size="xl" variant="secondary" disabled={busy} onClick={() => library.current?.click()}>{copy.y9ChoosePhoto}</Button>
        <Button size="xl" variant="quiet" disabled={busy} onClick={() => { void save(together); }}>{copy.y9Skip}</Button>
        <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label={copy.y9TakePhoto} onChange={(event) => { const file = event.target.files?.[0]; if (file) void save(together, file); event.target.value = ''; }} />
        <input ref={library} hidden type="file" accept="image/*" aria-label={copy.y9ChoosePhoto} onChange={(event) => { const file = event.target.files?.[0]; if (file) void save(together, file); event.target.value = ''; }} />
      </> : <>
        <Button size="xl" aria-pressed={together} disabled={!partner} onClick={() => choose(true)}>{fill(copy.y9With, { partner: partner || copy.y9Partner })}</Button>
        <Button size="xl" variant="secondary" aria-pressed={!together} onClick={() => choose(false)}>{copy.y9Solo}</Button>
      </>}
      {busy && <p role="status">{copy.y9Saving}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </Sheet>;
}
