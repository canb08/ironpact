import { useRef, useState } from 'react';
import type { Result } from '../../core/types.ts';
import type { WriteError } from '../../data/adapter.ts';

export type SessionError = WriteError | 'label_taken' | 'unexpected';

/** A synchronous lock also covers two taps before React has rendered busy. */
export function useSessionWrite() {
  const locked = useRef(false);
  const retryTask = useRef<() => void>(() => {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SessionError | null>(null);

  async function run<T>(task: () => Promise<Result<T, WriteError | 'label_taken'>>, done: (value: T) => void) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    retryTask.current = () => { void run(task, done); };
    try {
      const result = await task();
      if (result.ok) done(result.value);
      else setError(result.error);
    } catch {
      setError('unexpected');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return { busy, error, run, retry: () => retryTask.current() };
}
