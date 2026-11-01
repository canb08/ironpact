import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, copy } from '../../ui';
import type { SessionError } from './useSessionWrite.ts';

export function WriteFeedback({ error, retry }: { error: SessionError | null; retry: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    if (error !== 'storage_full') return;
    const previous = document.activeElement;
    const modal = dialog.current;
    modal?.showModal();
    return () => {
      modal?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [error]);

  if (!error) return null;
  if (error === 'storage_full') return createPortal(
    <dialog ref={dialog} className="session-storage" role="alertdialog" aria-modal="true" aria-labelledby={title}
      onCancel={(event) => event.preventDefault()} onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          dialog.current?.querySelector('button')?.focus();
        }
      }}>
      <p id={title}>{copy.storageFull}</p>
      <Button size="xl" onClick={retry}>{copy.retry}</Button>
    </dialog>, document.body,
  );
  const message = error === 'world_record' ? copy.outOfRange
    : error === 'label_taken' ? copy.pickerDuplicate
    : error === 'session_already_open' || error === 'no_open_session' ? copy.openSession
    : copy.sessionSaveError;
  return <p role="alert" className="session-error">{message}</p>;
}
