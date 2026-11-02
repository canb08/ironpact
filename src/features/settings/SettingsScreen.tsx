import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ListRow } from '../../ui/ListRow.tsx';
import { useLiveQuery } from 'dexie-react-hooks';
import type { NotifyPrefs, Profile, Theme } from '../../core/types.ts';
import type { Repo, SyncStatus } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button } from '../../ui/Button.tsx';
import { HoldButton } from '../../ui/HoldButton.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { Stepper } from '../../ui/Stepper.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { VaultExport } from '../export/VaultExport.tsx';
import { copyText } from '../export/export.ts';
import { useOnline } from '../export/useOnline.ts';
import { ICE_HUE, MEMBER_HUES, VOLT_HUE } from '../onboarding/hues.ts';
import { defaultRestSeconds } from '../timer/restTimer.ts';
import { applyDocumentFeel, deleteReady } from './feel.ts';
import { listedPlates, togglePlate } from './plates.ts';
import '../export/export.css';
import './settings.css';

const notificationsAvailable = false; // Phase 7: retain preferences and controls until push ships.

const sections = [
  { id: 'profile', title: copy.settingsProfile, detail: copy.x8ProfileDetail },
  { id: 'training', title: copy.settingsTraining, detail: copy.x8TrainingDetail },
  { id: 'appearance', title: copy.x8Appearance, detail: copy.x8AppearanceDetail },
  { id: 'privacy', title: copy.x8Privacy, detail: copy.x8PrivacyDetail },
  { id: 'crew', title: copy.settingsCrew, detail: copy.x8CrewDetail },
  { id: 'account', title: copy.settingsAccount, detail: copy.x8AccountDetail },
] as const;
type Section = typeof sections[number]['id'];

type Patch = Partial<Omit<Profile, 'id'>>;
type SavePatch = Patch | ((current: Profile) => Patch);

export default function SettingsScreen() {
  const { section } = useParams();
  const current = sections.find((item) => item.id === section)?.id;
  const repo = useRepo();
  const user = useSyncExternalStore(repo.auth.onChange, repo.auth.userId);
  return (
    <main className="settings-screen">
      <h1>{copy.settingsTitle}</h1>
      {user ? <SettingsBody key={`${user}-${current ?? 'index'}`} section={current} /> : <p>{copy.profileNeeded}</p>}
    </main>
  );
}

function SettingsBody({ section }: { section?: Section }) {
  const repo = useRepo();
  const navigate = useNavigate();
  if (!section) return <>
    <nav className="settings-index" aria-label={copy.settingsTitle}>
      {[sections.slice(0, 3), sections.slice(3)].map((group, index) => <ul key={index}>
        {group.map((item) => <li key={item.id}>
          <ListRow title={item.title} detail={item.detail} chevron onClick={() => void navigate(`/settings/${item.id}`)} />
        </li>)}
      </ul>)}
    </nav>
    <SyncPanel repo={repo} />
  </>;
  return <>
    {['profile', 'training', 'appearance', 'privacy'].includes(section) && <ProfileSettings repo={repo} section={section} />}
    {section === 'privacy' && <VaultExport repo={repo} />}
    {section === 'crew' && <CrewPanel repo={repo} />}
    {section === 'account' && <AccountPanel repo={repo} />}
  </>;
}

function useSaver(repo: Repo, onSaved: () => void) {
  const queue = useRef(Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  function save(patch: SavePatch): Promise<boolean> {
    const job = queue.current.then(async () => {
      try {
        const current = await repo.q.me();
        if (!current) return false;
        const next = typeof patch === 'function' ? patch(current) : patch;
        const result = await repo.w.upsertMyProfile(next);
        if (!result.ok) {
          setError(result.error === 'storage_full' ? copy.storageFull : copy.settingsCouldNotSave);
          return false;
        }
        setError(null);
        onSaved();
        return true;
      } catch {
        setError(copy.settingsCouldNotSave);
        return false;
      }
    });
    queue.current = job.then(() => undefined, () => undefined);
    return job;
  }
  return { error, save };
}

function ProfileSettings({ repo, section }: { repo: Repo; section: Section }) {
  const [revision, setRevision] = useState(0);
  const profile = useLiveQuery(() => repo.q.me(), [repo, revision]);
  const pending = !profile;
  const { error, save } = useSaver(repo, () => setRevision((value) => value + 1));
  useEffect(() => {
    if (profile) applyDocumentFeel(profile);
  }, [profile]);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [minError, setMinError] = useState<string | null>(null);
  const [quietError, setQuietError] = useState<string | null>(null);
  const name = nameDraft ?? profile?.display_name ?? '';
  const minLabel = minDraft ?? profile?.min_default_label ?? '';
  if (profile && nameDraft !== null && nameDraft.trim() === profile.display_name) setNameDraft(null);
  if (profile && minDraft !== null && minDraft.trim() === profile.min_default_label) setMinDraft(null);

  function saveIfReady(patch: SavePatch) {
    if (!profile) return;
    void save(patch);
  }

  function commitName(value: string): boolean {
    if (!profile) return false;
    const trimmed = value.trim();
    const length = Array.from(trimmed).length;
    const first = Array.from(trimmed)[0];
    if (!first || trimmed.includes('·') || length > 16) {
      setNameError(copy.nameLength);
      return false;
    }
    setNameError(null);
    if (trimmed !== profile.display_name) saveIfReady({ display_name: trimmed, initial: first.toLocaleUpperCase('en') });
    return true;
  }

  function commitMin(value: string): boolean {
    if (!profile) return false;
    const trimmed = value.trim();
    const length = Array.from(trimmed).length;
    if (length < 1 || length > 40) {
      setMinError(copy.minLabelLength);
      return false;
    }
    setMinError(null);
    if (trimmed !== profile.min_default_label) saveIfReady({ min_default_label: trimmed });
    return true;
  }

  function commitQuiet(key: 'quiet_start' | 'quiet_end', value: string) {
    if (!profile) return;
    const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
    if (!match) {
      setQuietError(copy.quietInvalid);
      return;
    }
    const time = `${match[1]}:${match[2]}`;
    setQuietError(null);
    if (time !== profile[key]) saveIfReady({ [key]: time });
  }

  function setNotify(key: keyof NotifyPrefs, checked: boolean) {
    if (!profile) return;
    saveIfReady((current) => ({ notify: { ...current.notify, [key]: checked } }));
  }

  return (
    <div className="settings-profile" aria-busy={pending} aria-hidden={pending || undefined} inert={pending || undefined}>
      {section === 'profile' && (
        <section className="settings-section" aria-labelledby="settings-profile">
          <h2 id="settings-profile">{copy.settingsProfile}</h2>
          <div className="settings-field">
            <label htmlFor="settings-name">{copy.displayName}</label>
            <input
              id="settings-name"
              type="text"
              value={name}
              autoComplete="nickname"
              disabled={pending}
              aria-invalid={nameError !== null}
              onChange={(event) => {
                setNameDraft(event.currentTarget.value);
                commitName(event.currentTarget.value);
              }}
              onBlur={(event) => commitName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitName(event.currentTarget.value);
                }
              }}
            />
          </div>
          <p className="settings-muted">{copy.noSurnames}</p>
          {nameError ? <p role="alert">{nameError}</p> : null}
          {profile ? (
            <Stepper label={copy.weeklyTarget} value={profile.weekly_target} min={1} max={7} onChange={(weekly_target) => saveIfReady({ weekly_target })} />
          ) : (
            <FrozenStepper label={copy.weeklyTarget} />
          )}
          <div role="group" aria-label={copy.colour} className="settings-hues">
            {MEMBER_HUES.map((hue) => (
              <button
                key={hue}
                type="button"
                disabled={pending}
                aria-pressed={profile ? profile.color_hue === hue : false}
                aria-label={hueName(hue)}
                style={{ background: `oklch(0.8 0.15 ${hue})` }}
                onClick={() => saveIfReady({ color_hue: hue })}
              />
            ))}
          </div>
          <div className="settings-field">
            <label htmlFor="settings-min">{copy.settingsMinLabel}</label>
            <input
              id="settings-min"
              type="text"
              value={minLabel}
              maxLength={40}
              disabled={pending}
              onChange={(event) => {
                setMinDraft(event.currentTarget.value);
                commitMin(event.currentTarget.value);
              }}
              onBlur={(event) => commitMin(event.currentTarget.value)}
            />
          </div>
          {minError ? <p role="alert">{minError}</p> : null}
        </section>
      )}

      {section === 'training' && (
        <section className="settings-section" aria-labelledby="settings-training">
          <h2 id="settings-training">{copy.settingsTraining}</h2>
          <p id="plate-inventory">{copy.plateInventory}</p>
          <div role="group" aria-labelledby="plate-inventory" className="settings-plates">
            {listedPlates(profile?.plates_kg ?? []).map((kg) => (
              <Toggle
                key={kg}
                label={fill(copy.plateKg, { kg })}
                checked={profile?.plates_kg.some((plate) => plate === kg) ?? false}
                disabled={pending}
                onChange={() => saveIfReady((current) => ({ plates_kg: togglePlate(current.plates_kg, kg) }))}
              />
            ))}
          </div>
          {profile ? (
            <Stepper label={copy.barKg} value={profile.bar_kg} min={5} max={25} step={2.5} onChange={(bar_kg) => saveIfReady({ bar_kg })} />
          ) : (
            <FrozenStepper label={copy.barKg} />
          )}
          <h3>{copy.restDefaults}</h3>
          <p>{fill(copy.restCompoundLine, { seconds: defaultRestSeconds('compound') })}</p>
          <p>{fill(copy.restIsolationLine, { seconds: defaultRestSeconds('isolation') })}</p>
          <p className="settings-muted">{copy.restRemembered}</p>
          <Toggle label={copy.bigJumps} checked={profile?.big_jumps ?? false} disabled={pending} onChange={(big_jumps) => saveIfReady({ big_jumps })} />
          <p className="settings-muted">{copy.bigJumpsHint}</p>
        </section>
      )}

      {section === 'training' && (
        <section className="settings-section" aria-labelledby="settings-units">
          <h2 id="settings-units">{copy.settingsUnits}</h2>
          <Toggle label={copy.unitsKg} checked disabled onChange={() => undefined} />
          <p className="settings-muted">{copy.unitsFixed}</p>
        </section>
      )}

      {section === 'appearance' && (
        <section className="settings-section" aria-labelledby="settings-feel">
          <h2 id="settings-feel">{copy.x8Appearance}</h2>
          <Toggle label={copy.soundOn} checked={profile?.sound_on ?? false} disabled={pending} onChange={(sound_on) => saveIfReady({ sound_on })} />
          <Toggle label={copy.hapticsOn} checked={profile?.haptics_on ?? false} disabled={pending} onChange={(haptics_on) => saveIfReady({ haptics_on })} />
          <Toggle label={copy.reduceMotionOn} checked={profile?.reduce_motion ?? false} disabled={pending} onChange={(reduce_motion) => saveIfReady({ reduce_motion })} />
          <Toggle label={copy.batterySaverOn} checked={profile?.battery_saver ?? false} disabled={pending} onChange={(battery_saver) => saveIfReady({ battery_saver })} />
          <p className="settings-muted">{copy.x8BatterySaverHint}</p>
          <fieldset>
            <legend>{copy.themeChoice}</legend>
            {(['dark', 'light', 'system'] as const).map((theme) => (
              <label key={theme} className="settings-radio">
                <input type="radio" name="settings-theme" checked={profile?.theme === theme} disabled={pending} onChange={() => saveIfReady({ theme })} />
                <span>{themeLabel(theme)}</span>
              </label>
            ))}
          </fieldset>
        </section>
      )}

      {notificationsAvailable && (
        <section className="settings-section" aria-labelledby="settings-notify">
          <h2 id="settings-notify">{copy.settingsNotifications}</h2>
          <p className="settings-muted">{copy.notificationsSaved}</p>
          <Toggle label={copy.notifyPartnerStart} checked={profile?.notify.partner_start ?? false} disabled={pending} onChange={(checked) => setNotify('partner_start', checked)} />
          <Toggle label={copy.notifyPartnerPr} checked={profile?.notify.partner_pr ?? false} disabled={pending} onChange={(checked) => setNotify('partner_pr', checked)} />
          <Toggle label={copy.notifyNudge} checked={profile?.notify.nudge ?? false} disabled={pending} onChange={(checked) => setNotify('nudge', checked)} />
          <Toggle label={copy.notifyRecap} checked={profile?.notify.recap ?? false} disabled={pending} onChange={(checked) => setNotify('recap', checked)} />
          <Toggle label={copy.notifySpot} checked={profile?.notify.spot ?? false} disabled={pending} onChange={(checked) => setNotify('spot', checked)} />
          <h3>{copy.quietHours}</h3>
          <div className="settings-field">
            <label htmlFor="quiet-start">{copy.quietStart}</label>
            <input id="quiet-start" type="time" value={profile ? profile.quiet_start.slice(0, 5) : ''} disabled={pending} onChange={(event) => commitQuiet('quiet_start', event.currentTarget.value)} />
          </div>
          <div className="settings-field">
            <label htmlFor="quiet-end">{copy.quietEnd}</label>
            <input id="quiet-end" type="time" value={profile ? profile.quiet_end.slice(0, 5) : ''} disabled={pending} onChange={(event) => commitQuiet('quiet_end', event.currentTarget.value)} />
          </div>
          {quietError ? <p role="alert">{quietError}</p> : null}
        </section>
      )}

      {section === 'privacy' && (
        <section className="settings-section" aria-labelledby="settings-privacy">
          <h2 id="settings-privacy">{copy.x8Privacy}</h2>
          <Toggle label={copy.shareBodyweight} checked={profile?.show_bodyweight ?? false} disabled={pending} onChange={(show_bodyweight) => saveIfReady({ show_bodyweight })} />
          <Toggle label={copy.shareDots} checked={profile?.share_dots ?? false} disabled={pending} onChange={(share_dots) => saveIfReady({ share_dots })} />
        </section>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function SyncPanel({ repo }: { repo: Repo }) {
  const status = useSyncStatus(repo);
  const [revision, setRevision] = useState(0);
  const letters = useLiveQuery(() => repo.q.deadLetters(), [repo, status.deadCount, revision]);
  const count = letters?.length ?? status.deadCount;
  const bump = () => setRevision((value) => value + 1);
  const message = count > 0 ? count === 1 ? copy.deadOne : fill(copy.deadMany, { count })
    : status.pendingCount > 0 ? fill(copy.syncWaiting, { count: status.pendingCount })
    : status.state === 'offline' ? copy.x8SyncOffline
    : status.state === 'flushing' ? copy.x8Syncing
    : status.state === 'server_asleep' ? copy.serverAsleep : copy.x8Synced;
  return (
    <footer className="settings-sync" aria-label={copy.settingsSync}>
      <p role="status">{message}</p>
      {count > 0 && <details className="settings-sync-errors">
        <summary>{copy.x8ReviewSync}</summary>
        <ul className="settings-dead">
          {(letters ?? []).map((letter) => (
            <li key={letter.seq}>
              <p>{letter.last_error}</p>
              <div className="settings-actions">
                <Button variant="secondary" onClick={() => void repo.sync.retryDead(letter.seq).then(bump)}>{copy.retryEntry}</Button>
                <Button variant="secondary" onClick={() => void repo.sync.discardDead(letter.seq).then(bump)}>{copy.discardEntry}</Button>
              </div>
            </li>
          ))}
        </ul>
      </details>}
    </footer>
  );
}

function useSyncStatus(repo: Repo): SyncStatus {
  const cache = useRef<SyncStatus | null>(null);
  return useSyncExternalStore(
    (notify) => repo.sync.onStatus(() => notify()),
    () => {
      const next = repo.sync.status();
      const prev = cache.current;
      if (
        prev
        && prev.state === next.state
        && prev.pendingCount === next.pendingCount
        && prev.deadCount === next.deadCount
        && prev.lastSyncedAt === next.lastSyncedAt
      ) return prev;
      cache.current = next;
      return next;
    },
  );
}

function CrewPanel({ repo }: { repo: Repo }) {
  const online = useOnline(repo);
  const [revision, setRevision] = useState(0);
  const [invite, setInvite] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const data = useLiveQuery(async () => ({ membership: (await repo.q.myCrew()) ?? null }), [repo, revision]);
  const membership = data?.membership ?? null;
  const owner = membership?.members.some((member) => member.user_id === repo.auth.userId() && member.role === 'owner' && member.left_at === null) ?? false;

  async function inviteLink() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const result = await repo.crew.createInvite();
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error === 'not_crew_owner' ? copy.inviteOwnerOnly : copy.networkRetry);
      return;
    }
    const link = new URL(`/join/${encodeURIComponent(result.value)}`, window.location.origin).href;
    setInvite(result.value);
    setMessage(await copyText(link) ? copy.inviteCopied : copy.clipboardUnavailable);
  }

  async function leave() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const result = await repo.crew.leave();
    setBusy(false);
    if (!result.ok) {
      setMessage(copy.networkRetry);
      return;
    }
    setInvite(null);
    setRevision((value) => value + 1);
  }

  return (
    <section className="settings-section" aria-labelledby="settings-crew">
      <h2 id="settings-crew">{copy.settingsCrew}</h2>
      {!data ? <p>{copy.loading}</p> : !membership ? <p>{copy.noCrew}</p> : (
        <>
          <p>{membership.crew.name}</p>
          {owner ? (
            <Button disabled={busy || !online} onClick={() => void inviteLink()}>{copy.copyInvite}</Button>
          ) : <p>{copy.inviteOwnerOnly}</p>}
          {invite ? <code className="settings-code" aria-label={copy.inviteCodeLabel}>{invite}</code> : null}
          <HoldButton aria-label={copy.holdLeaveCrew} variant="secondary" className="settings-danger" disabled={busy || !online} onHoldComplete={() => void leave()}>
            <DangerMark />
            {copy.holdLeaveCrew}
          </HoldButton>
        </>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function AccountPanel({ repo }: { repo: Repo }) {
  const online = useOnline(repo);
  const [held, setHeld] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const ready = deleteReady(held, typed);

  async function confirmDelete() {
    if (!deleteReady(held, typed) || busy) return;
    setBusy(true);
    const result = await repo.auth.deleteAccount();
    if (!result.ok) {
      setBusy(false);
      setMessage(copy.deleteNeedsSignal);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-account">
      <h2 id="settings-account">{copy.settingsAccount}</h2>
      <Button variant="secondary" onClick={() => void repo.auth.signOut()}>{copy.signOut}</Button>
      <HoldButton aria-label={copy.holdDeleteAccount} variant="secondary" className="settings-danger" disabled={busy} onHoldComplete={() => { setHeld(true); setTyped(''); setMessage(''); }}>
        <DangerMark />
        {copy.holdDeleteAccount}
      </HoldButton>
      <Sheet open={held} title={copy.deleteAccount} onClose={() => { setHeld(false); setTyped(''); setMessage(''); }}>
        <div className="settings-field">
          <label htmlFor="delete-word">{copy.deleteTypeLabel}</label>
          <input
            id="delete-word"
            type="text"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="delete-hint"
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
        </div>
        <p id="delete-hint" className="settings-muted">{copy.deleteTypeHint}</p>
        <Button variant="secondary" className="settings-danger" disabled={!ready || busy || !online} onClick={() => void confirmDelete()}>
          <DangerMark />
          {copy.deleteAccount}
        </Button>
        {!online ? <p role="status">{copy.needsSignal}</p> : null}
        {message ? <p role="status">{message}</p> : null}
      </Sheet>
    </section>
  );
}

function FrozenStepper({ label }: { label: string }) {
  const id = useId();
  return (
    <div className="ui-stepper">
      <label id={`${id}-label`} htmlFor={id}>{label}</label>
      <div className="ui-stepper__controls">
        <Button size="xl" variant="secondary" disabled aria-label={fill(copy.decrease, { label })}>−</Button>
        <input id={id} type="number" value="" disabled readOnly />
        <Button size="xl" variant="secondary" disabled aria-label={fill(copy.increase, { label })}>+</Button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  const id = useId();
  return (
    <div className="settings-toggle">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function hueName(hue: number): string {
  if (hue === VOLT_HUE) return copy.colourVolt;
  if (hue === ICE_HUE) return copy.colourIce;
  return fill(copy.colourHue, { hue });
}

function themeLabel(theme: Theme): string {
  if (theme === 'light') return copy.themeLight;
  if (theme === 'system') return copy.themeSystem;
  return copy.themeDark;
}

function DangerMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
    </svg>
  );
}
