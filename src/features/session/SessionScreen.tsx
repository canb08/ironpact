import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import type { Session } from '../../core/types.ts';
import { Button, HoldButton, ToastProvider, copy, fill } from '../../ui';
import { ActiveSession } from './ActiveSession.tsx';
import { useSessionWrite } from './useSessionWrite.ts';
import { WriteFeedback } from './WriteFeedback.tsx';
import './session.css';

export default function SessionScreen() {
  return <ToastProvider><SessionContent /></ToastProvider>;
}

function SessionContent() {
  const repo = useRepo();
  const snapshot = useLiveQuery(async () => ({ session: await repo.q.openSession() }), [repo]);
  const [active, setActive] = useState<Session>();
  const [closedId, setClosedId] = useState<string>();
  const [finished, setFinished] = useState(false);
  const [openedAt] = useState(Date.now);
  const write = useSessionWrite();
  const open = snapshot?.session?.id === closedId ? undefined : snapshot?.session;

  if (active) return <ActiveSession session={active} onFinish={() => {
    setClosedId(active.id);
    setActive(undefined);
    setFinished(true);
  }} />;

  return <main className="session-entry">
    <h1>{copy.sessionTitle}</h1>
    {!snapshot ? <p role="status">{copy.sessionLoading}</p> : open ? <>
      <p>{open.kind === 'gym' ? fill(copy.sessionResume, {
        minutes: Math.max(0, Math.floor((openedAt - Date.parse(open.started_at)) / 60000)),
      }) : copy.openSession}</p>
      {open.kind === 'gym' && <Button size="xl" onClick={() => setActive(open)} disabled={write.busy}>
        {copy.sessionResumeAction}
      </Button>}
      <HoldButton size="xl" variant="secondary" holdMs={600} disabled={write.busy} aria-label={copy.sessionDiscard}
        onHoldComplete={() => { void write.run(() => repo.w.discardSession(open.id), () => setClosedId(open.id)); }}>
        {copy.sessionDiscard}
      </HoldButton>
    </> : <>
      <p role="status">{finished ? copy.sessionFinished : copy.sessionReady}</p>
      <Button size="xl" disabled={write.busy} onClick={() => {
        void write.run(() => repo.w.startSession({ kind: 'gym' }), (session) => {
          setFinished(false);
          setActive(session);
        });
      }}>{copy.start}</Button>
    </>}
    <WriteFeedback error={write.error} retry={write.retry} />
  </main>;
}
