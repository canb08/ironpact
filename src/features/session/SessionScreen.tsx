import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Session } from '../../core/types.ts';
import { keepAwake, releaseKeepAwake } from '../../platform/wakeLock.ts';
import { Button, HoldButton, ToastProvider, copy, fill } from '../../ui';
import { MotionProvider } from '../../ui/motion/MotionProvider.tsx';
import { MomentHost } from '../../ui/moments/MomentHost.tsx';
import { skipRest } from '../timer/useRestTimer.ts';
import { ActiveSession } from './ActiveSession.tsx';
import { SessionSummary } from './SessionSummary.tsx';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';
import './session.css';

export default function SessionScreen() {
  return <ToastProvider><SessionContent /></ToastProvider>;
}

function SessionContent() {
  const repo = useRepo();
  const snapshot = useLiveQuery(async () => ({ session: await repo.q.openSession() }), [repo]);
  const profile = useLiveQuery(async () => repo.q.me(), [repo]);
  const [active, setActive] = useState<Session>();
  const [closedId, setClosedId] = useState<string>();
  const [finished, setFinished] = useState(false);
  const [summary, setSummary] = useState<Session>();
  const [openedAt] = useState(Date.now);
  const write = useSessionWrite();
  const open = snapshot?.session?.id === closedId ? undefined : snapshot?.session;
  const close = (session: Session) => {
    releaseKeepAwake();
    skipRest();
    setClosedId(session.id);
    setSummary(session);
    setActive(undefined);
    setFinished(true);
  };

  if (active) return (
    <MotionProvider reduced={profile?.reduce_motion === true}>
      <MomentHost screen={active.id} />
      <ActiveSession key={active.id} session={active} onReplace={setActive} onFinish={close} />
    </MotionProvider>
  );

  return (
    <MotionProvider reduced={profile?.reduce_motion === true}>
      <MomentHost screen="entry" />
      <main className="session-entry">
    <h1>{copy.sessionTitle}</h1>
    {!snapshot ? <p role="status">{copy.sessionLoading}</p> : open ? <>
      {open.kind === 'gym' && <p>{fill(copy.sessionResume, {
        minutes: Math.max(0, Math.floor((openedAt - Date.parse(open.started_at)) / 60000)),
      })}</p>}
      <p>{copy.openSession}</p>
      {open.kind === 'gym' && <Button size="xl" onClick={() => { void keepAwake(); setActive(open); }} disabled={write.busy}>
        {copy.sessionResumeAction}
      </Button>}
      <HoldButton size="xl" variant="secondary" holdMs={600} disabled={write.busy} aria-label={copy.sessionDiscard}
        onHoldComplete={() => { void write.run(() => repo.w.discardSession(open.id), () => setClosedId(open.id)); }}>
        {copy.sessionDiscard}
      </HoldButton>
    </> : <>
      {summary && <SessionSummary session={summary} onDone={() => setSummary(undefined)} />}
      <p role="status">{finished ? copy.sessionFinished : copy.sessionReady}</p>
      {!summary && <Button size="xl" disabled={write.busy} onClick={() => {
        void keepAwake();
        void write.run(() => repo.w.startSession({ kind: 'gym' }), (session) => {
          setFinished(false);
          setSummary(undefined);
          setActive(session);
        });
      }}>{copy.start}</Button>}
    </>}
    <WriteFeedback error={write.error} retry={write.retry} />
  </main>
    </MotionProvider>
  );
}
