import { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RepoContext } from '../../app/repoContext.ts';
import { Button } from '../../ui/Button.tsx';
import { copy } from '../../ui/copy.ts';
import { CodeBoxes } from '../auth/CodeBoxes.tsx';
import { normalizeInvite, rememberJoinCode } from '../auth/joinCode.ts';
import { BLUE_HUE, RED_HUE } from './hues.ts';
import { ProfileFields } from './ProfileFields.tsx';
import { Explainer } from './Explainer.tsx';
import { hintSeen, rememberHint } from './storage.ts';
import './onboarding.css';

type Step = 'crew' | 'profile' | 'guide';

export default function CrewSetupScreen() {
  const repo = useContext(RepoContext);
  const navigate = useNavigate();
  const params = useParams();
  const fromUrl = typeof params.code === 'string' ? normalizeInvite(params.code) : '';
  const [code, setCode] = useState(fromUrl);
  const [creating, setCreating] = useState(fromUrl.length === 0);
  const [step, setStep] = useState<Step>('crew');
  const [name, setName] = useState('');
  const [hue, setHue] = useState(fromUrl.length === 0 ? RED_HUE : BLUE_HUE);
  const [target, setTarget] = useState(3);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const [crewReady, setCrewReady] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const signedIn = repo?.auth.userId() != null;
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= 16;
  useEffect(() => { heading.current?.focus(); }, [step]);

  async function recoverCrew() {
    if (!repo) return;
    try {
      await repo.sync.pullNow();
      if (await repo.q.myCrew()) {
        await navigate('/', { replace: true });
        return;
      }
    } catch { /* Keep the existing H10 recovery retryable. */ }
    setError(copy.alreadyInCrew);
  }

  async function finish() {
    if (!repo || !signedIn || busy.current || !nameOk) return;
    busy.current = true;
    setPending(true);
    setError(null);
    let membershipReady = crewReady;
    try {
      // Do not change a returning user's profile if the server recovers their crew.
      if (!crewReady) {
        const result = creating ? await repo.crew.create(copy.defaultCrewName) : await repo.crew.redeem(normalizeInvite(code));
        if (!result.ok) {
          if (result.error === 'already_in_crew') await recoverCrew();
          else setError(redeemCopy(result.error));
          return;
        }
        membershipReady = true;
        setCrewReady(true);
      }
      const crew = await repo.q.myCrew();
      if (crew) {
        const profiles = await repo.q.profiles(crew.members.map((member) => member.user_id));
        if (profiles.some((profile) => profile.id !== repo.auth.userId()
          && profile.display_name.toLowerCase() === trimmed.toLowerCase())) {
          setError(copy.nameTaken);
          setStep('profile');
          return;
        }
      }
      const saved = await repo.w.upsertMyProfile({
        display_name: trimmed, initial: trimmed.slice(0, 1).toUpperCase(), color_hue: hue,
        weekly_target: target, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!saved.ok) { setError(copy.x9SaveError); return; }
      rememberHint('guide', saved.value.id);
      rememberHint('name', saved.value.id);
      await navigate('/', { replace: true });
    } catch {
      setError(membershipReady ? copy.x9SaveError : copy.joinOffline);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function continueProfile() {
    if (!nameOk || pending) return;
    const id = repo?.auth.userId();
    if (id && hintSeen('guide', id)) void finish();
    else { setError(null); setStep('guide'); }
  }

  return <main className="onboarding">
    <p className="onboarding-mark">{copy.appName}</p>
    {step === 'guide' ? <Explainer onFinish={() => void finish()} pending={pending} error={error} /> : <>
      <header>
        <h1 ref={heading} tabIndex={-1}>{step === 'crew' ? copy.x9CrewTitle : copy.x9ProfileTitle}</h1>
        {step === 'crew' && <p className="onboarding-hint">{copy.x9CrewHint}</p>}
      </header>
      {step === 'crew' ? <>
        <div className="onboarding-choice" role="group" aria-label={copy.crew}>
          <Button variant="secondary" aria-pressed={creating} onClick={() => { setCreating(true); setHue(RED_HUE); }}>{copy.x9Create}</Button>
          <Button variant="secondary" aria-pressed={!creating} onClick={() => { setCreating(false); setHue(BLUE_HUE); }}>{copy.x9Join}</Button>
        </div>
        {!creating && <>
          <p className="onboarding-hint">{copy.x9InviteHint}</p>
          <div className="onboarding-code"><CodeBoxes mode="invite" length={10} value={code} onChange={(next) => {
            setCode(next);
            try { if (next) rememberJoinCode(next); } catch { /* Paste still works without storage. */ }
          }} disabled={!repo || pending} /></div>
          <Button variant="secondary" disabled={!code} onClick={() => {
            void navigator.clipboard?.writeText(code).catch(() => {});
          }}>{copy.copyCode}</Button>
        </>}
        <div className="onboarding-actions">
          <Button size="xl" disabled={!creating && code.length !== 10} onClick={() => {
            if (!signedIn) {
              try { if (code) rememberJoinCode(code); } catch { /* Gate also retains the URL. */ }
              void navigate('/sign-in');
            } else setStep('profile');
          }}>{signedIn ? copy.x9Continue : copy.signInToJoin}</Button>
        </div>
      </> : <form className="onboarding-form" onSubmit={(event) => { event.preventDefault(); continueProfile(); }}>
        <ProfileFields name={name} setName={setName} hue={hue} setHue={setHue} target={target} setTarget={setTarget} disabled={pending} />
        <p role="alert">{error}</p>
        <div className="onboarding-actions">
          <Button size="xl" type="submit" disabled={!repo || pending || !nameOk}>{pending ? copy.x9Saving : copy.x9Continue}</Button>
          <Button variant="quiet" disabled={pending || crewReady} onClick={() => { setStep('crew'); setError(null); }}>{copy.x9Back}</Button>
        </div>
      </form>}
    </>}
  </main>;
}

function redeemCopy(error: 'code_dead' | 'crew_full' | 'slow_down' | 'already_in_crew' | 'network'): string {
  if (error === 'code_dead') return copy.deadInvite;
  if (error === 'crew_full') return copy.crewFull;
  if (error === 'slow_down') return copy.inviteSlow;
  if (error === 'already_in_crew') return copy.alreadyInCrew;
  return copy.joinOffline;
}
