import { useContext, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RepoContext } from '../../app/repoContext.ts';
import { Button } from '../../ui/Button.tsx';
import { Stepper } from '../../ui/Stepper.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { CodeBoxes } from '../auth/CodeBoxes.tsx';
import { normalizeInvite, rememberJoinCode } from '../auth/joinCode.ts';
import { ICE_HUE, MEMBER_HUES, VOLT_HUE } from './hues.ts';

function hueLabel(hue: number): string {
  if (hue === VOLT_HUE) return copy.colourVolt;
  if (hue === ICE_HUE) return copy.colourIce;
  return fill(copy.colourHue, { hue });
}

export default function CrewSetupScreen() {
  const repo = useContext(RepoContext);
  const navigate = useNavigate();
  const params = useParams();
  const fromUrl = typeof params.code === 'string' ? normalizeInvite(params.code) : '';
  const [code, setCode] = useState(fromUrl);
  const [creating, setCreating] = useState(fromUrl.length === 0);
  const [name, setName] = useState('');
  const [hue, setHue] = useState(fromUrl.length === 0 ? VOLT_HUE : ICE_HUE);
  const [target, setTarget] = useState(3);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = repo?.auth.userId() != null;
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= 16;

  function onCode(next: string) {
    setCode(next);
    if (next.length > 0) rememberJoinCode(next);
  }

  async function lockIn() {
    if (!repo || !signedIn || pending || !nameOk) return;
    setPending(true);
    setError(null);
    if (!creating) {
      const joined = await repo.crew.redeem(normalizeInvite(code));
      if (!joined.ok) {
        setPending(false);
        setError(redeemCopy(joined.error));
        return;
      }
    } else {
      const created = await repo.crew.create(copy.defaultCrewName);
      if (!created.ok) {
        setPending(false);
        setError(created.error === 'already_in_crew' ? copy.alreadyInCrew : copy.joinOffline);
        return;
      }
    }
    const crew = await repo.q.myCrew();
    if (crew) {
      const profiles = await repo.q.profiles(crew.members.map((member) => member.user_id));
      const mine = repo.auth.userId();
      const taken = profiles.some(
        (profile) => profile.id !== mine && profile.display_name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (taken) {
        setPending(false);
        setError(copy.nameTaken);
        return;
      }
    }
    const saved = await repo.w.upsertMyProfile({
      display_name: trimmed,
      initial: trimmed.slice(0, 1).toUpperCase(),
      color_hue: hue,
      weekly_target: target,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setPending(false);
    if (!saved.ok) {
      setError(copy.joinOffline);
      return;
    }
    await navigate('/', { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col gap-4 px-4 py-8">
      <p className="text-lg font-semibold tracking-wide">{copy.appName}</p>
      {!creating ? (
        <>
          <CodeBoxes mode="invite" length={10} value={code} onChange={onCode} disabled={!repo || pending} />
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="xl"
              variant="secondary"
              disabled={!repo || code.length === 0}
              onClick={() => {
                const text = code;
                void navigator.clipboard.writeText(text);
              }}
            >
              {copy.copyCode}
            </Button>
            <Button
              size="xl"
              variant="secondary"
              disabled={!repo || pending}
              onClick={() => {
                void navigator.clipboard.readText().then((text) => onCode(normalizeInvite(text)));
              }}
            >
              {copy.pasteCode}
            </Button>
          </div>
          <Button variant="ghost" disabled={pending} onClick={() => { setCreating(true); setHue(VOLT_HUE); }}>
            {copy.startCrew}
          </Button>
        </>
      ) : (
        <Button variant="ghost" disabled={pending} onClick={() => { setCreating(false); setHue(ICE_HUE); }}>
          {copy.join}
        </Button>
      )}
      <label className="grid gap-2" htmlFor="display-name">
        {copy.displayName}
      </label>
      <input
        id="display-name"
        value={name}
        aria-invalid={trimmed.length > 16}
        autoComplete="nickname"
        className="min-h-12 rounded-md border border-line bg-surface-1 px-3 text-text"
        onChange={(event) => setName(event.target.value)}
      />
      <p className="text-sm text-text-muted">{copy.noSurnames}</p>
      {trimmed.length > 16 ? <p>{copy.nameLength}</p> : null}
      <div role="group" aria-label={copy.colour} className="flex flex-wrap gap-2">
        {MEMBER_HUES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-pressed={hue === swatch}
            aria-label={hueLabel(swatch)}
            className="h-14 w-14 rounded-full border border-line-steel-b"
            style={{ background: `oklch(0.8 0.15 ${swatch})` }}
            onClick={() => setHue(swatch)}
          />
        ))}
      </div>
      <Stepper label={copy.weeklyTarget} value={target} min={1} max={7} onChange={setTarget} />
      {!signedIn ? (
        <Button
          size="xl"
          onClick={() => {
            if (code) rememberJoinCode(code);
            void navigate('/sign-in');
          }}
        >
          {copy.signInToJoin}
        </Button>
      ) : (
        <Button
          size="xl"
          disabled={!repo || pending || !nameOk || (!creating && code.length !== 10)}
          onClick={() => void lockIn()}
        >
          {pending ? copy.checking : copy.lockIn}
        </Button>
      )}
      {error ? <p>{error}</p> : null}
    </main>
  );
}

function redeemCopy(error: 'code_dead' | 'crew_full' | 'slow_down' | 'already_in_crew' | 'network'): string {
  if (error === 'code_dead') return copy.deadInvite;
  if (error === 'crew_full') return copy.crewFull;
  if (error === 'slow_down') return copy.inviteSlow;
  if (error === 'already_in_crew') return copy.alreadyInCrew;
  return copy.joinOffline;
}
