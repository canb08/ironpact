import { useEffect, useState, useSyncExternalStore } from 'react';
import { Share } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { dismissInstallGate } from '../auth/joinCode';
import { Button } from '../../ui/Button';
import { copy } from '../../ui/copy';
import {
  canPromptInstall, getInstallBrowser, isStandalone, promptInstall, subscribeInstall,
} from '../../platform/install';
import { persistStorageAfterInstall } from '../../platform/storage';
import './install.css';

const STEP_MS = 3200;

type StepKind = 'share' | 'add' | 'home';

interface WalkStep {
  kind: StepKind;
  text: string;
}

const IOS_STEPS: readonly WalkStep[] = [
  { kind: 'share', text: copy.installIosShare },
  { kind: 'add', text: copy.installIosAdd },
  { kind: 'home', text: copy.installOpen },
];

const ANDROID_STEPS: readonly WalkStep[] = [
  { kind: 'share', text: copy.installAndroidMenu },
  { kind: 'add', text: copy.installAndroidAdd },
  { kind: 'home', text: copy.installOpen },
];

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : undefined;
  media?.addEventListener?.('change', onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-reduced-motion'],
  });
  return () => {
    media?.removeEventListener?.('change', onChange);
    observer.disconnect();
  };
}

function reducedMotionNow(): boolean {
  if (document.documentElement.dataset.reducedMotion === 'on') return true;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false);
}

function StepVisual({ kind }: { kind: StepKind }) {
  if (kind === 'share') return <Share aria-hidden="true" size={48} strokeWidth={1.75} />;
  if (kind === 'add') return <span className="install-add" aria-hidden="true">+</span>;
  const mark = copy.appName.slice(0, 1);
  return (
    <span className="install-grid" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={index === 4 ? 'is-app' : undefined}>{index === 4 ? mark : ''}</span>
      ))}
    </span>
  );
}

function Walkthrough({
  steps, label, reduced,
}: {
  steps: readonly WalkStep[];
  label: string;
  reduced: boolean;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) return undefined;
    const id = window.setInterval(() => {
      setStep((current) => (current + 1) % steps.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [reduced, steps]);

  const visible = reduced ? steps : steps.filter((_, index) => index === step);
  return (
    <ol
      className="install-steps install-walk"
      data-testid="install-walkthrough"
      data-motion={reduced ? 'static' : 'loop'}
      data-step-ms={STEP_MS}
      aria-label={label}
      aria-live={reduced ? undefined : 'polite'}
    >
      {visible.map((item) => (
        <li key={item.text} className="install-step">
          <StepVisual kind={item.kind} />
          <span>{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

export default function InstallGate() {
  const navigate = useNavigate();
  const standalone = useSyncExternalStore(subscribeInstall, isStandalone, () => false);
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const reduced = useReducedMotion();
  const [promptUnavailable, setPromptUnavailable] = useState(false);
  const [replay, setReplay] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const browser = getInstallBrowser();

  useEffect(() => {
    if (standalone) void persistStorageAfterInstall();
  }, [standalone]);

  if (standalone) return <Navigate to="/" replace />;

  const unsupported = browser === 'ios-other' || (browser === 'other' && !canPrompt);
  const showPrompt = canPrompt && !promptUnavailable && (browser === 'android' || browser === 'other');
  const showWalk = !unsupported && !(browser === 'android' && showPrompt);
  const steps = browser === 'android' ? ANDROID_STEPS : IOS_STEPS;
  const walkLabel = browser === 'android' ? copy.installAndroid : copy.installSafari;

  function leaveGate() {
    dismissInstallGate();
    void navigate('/', { replace: true });
  }

  async function onCopyLink() {
    const url = window.location.href;
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      setCopyState('manual');
      return;
    }
    try {
      await clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  }

  return (
    <main className="install">
      <p className="install-mark">{copy.appName}</p>
      <h1>{copy.installTitle}</h1>
      <div className="install-body">
        {unsupported ? (
          <>
            <h2>{browser === 'ios-other' ? copy.installOpenInSafari : copy.installOpenInChrome}</h2>
            <p className="install-detail">{browser === 'ios-other' ? copy.installOpenSafari : copy.installOther}</p>
            <Button size="xl" onClick={() => { void onCopyLink(); }}>{copy.installCopyLink}</Button>
            {copyState === 'copied' && <p role="status">{copy.installLinkCopied}</p>}
            {copyState === 'manual' && (
              <>
                <p role="status">{copy.installCopyManual}</p>
                <input className="install-url" readOnly value={window.location.href} aria-label={copy.installCopyManual} />
              </>
            )}
          </>
        ) : null}
        {showWalk ? (
          <Walkthrough key={replay} steps={steps} label={walkLabel} reduced={reduced} />
        ) : null}
        {promptUnavailable && <p role="status">{copy.installPromptUnavailable}</p>}
        <p className="install-keep">{copy.installKeepData}</p>
      </div>
      <div className="install-thumb">
        {showPrompt ? (
          <Button size="xl" onClick={() => {
            void promptInstall().then((outcome) => setPromptUnavailable(outcome === 'unavailable'));
          }}
          >
            {copy.installButton}
          </Button>
        ) : null}
        {showWalk ? (
          <>
            <Button size="xl" onClick={leaveGate}>{copy.installDone}</Button>
            <Button variant="secondary" onClick={() => setReplay((value) => value + 1)}>{copy.installAgain}</Button>
          </>
        ) : null}
        <Link className="install-skip" to="/" replace onClick={() => dismissInstallGate()}>{copy.installSkip}</Link>
      </div>
    </main>
  );
}
