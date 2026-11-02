import { useEffect, useId, useRef, useState } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import { Button } from '../../ui/Button.tsx';
import { copy } from '../../ui/copy.ts';
import { hintSeen, rememberHint } from './storage.ts';
import './onboarding.css';

/** Mount on Today (requires the Lead's allowlist extension; see PR contract request). */
export function TodayNamePrompt() {
  const repo = useRepo();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const id = useId();
  useEffect(() => {
    let active = true;
    void repo.q.me().then((me) => {
      const name = me?.display_name.trim();
      if (active && me && (!name || name.toLowerCase() === copy.x3LegacyName.toLowerCase()) && !hintSeen('name', me.id)) setUserId(me.id);
    }).catch(() => {});
    return () => { active = false; };
  }, [repo]);

  if (!userId) return null;
  const trimmed = name.trim();
  async function save() {
    if (!userId || busy.current || trimmed.length < 1 || trimmed.length > 16) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await repo.w.upsertMyProfile({ display_name: trimmed, initial: trimmed.slice(0, 1).toUpperCase() });
      if (!result.ok) { setError(copy.x9SaveError); return; }
      rememberHint('name', userId);
      setUserId(null);
    } catch { setError(copy.x9SaveError); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="onboarding-name-prompt" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{copy.x9NamePrompt}</h2>
    <p className="onboarding-hint">{copy.x9NamePromptHint}</p>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label htmlFor={`${id}-name`}>{copy.x9Name}</label>
      <input id={`${id}-name`} value={name} autoComplete="nickname" disabled={pending}
        aria-invalid={trimmed.length > 16} aria-describedby={`${id}-hint`}
        onChange={(event) => setName(event.target.value)} />
      <p id={`${id}-hint`} className="onboarding-hint">{copy.x9NameHint}</p>
      {trimmed.length > 16 && <p role="alert">{copy.nameLength}</p>}
      <p role="alert">{error}</p>
      <div className="onboarding-name-prompt__actions">
        <Button type="submit" disabled={pending || !trimmed || trimmed.length > 16}>{pending ? copy.x9Saving : copy.x9SaveName}</Button>
        <Button variant="quiet" disabled={pending} onClick={() => { rememberHint('name', userId); setUserId(null); }}>{copy.x9Dismiss}</Button>
      </div>
    </form>
  </section>;
}
