import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { ToastContext } from './ToastContext';
import type { ToastOptions } from './ToastContext';
import { copy } from './copy';

interface QueuedToast extends ToastOptions {
  id: number;
  origin: Element | null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedToast[]>([]);
  const nextId = useRef(0);
  const toastElement = useRef<HTMLDivElement>(null);
  const current = queue[0];
  const dismissToast = useCallback((id: number) => {
    setQueue((items) => items.filter((item) => item.id !== id));
  }, []);
  const showToast = useCallback((toast: ToastOptions) => {
    const id = ++nextId.current;
    setQueue((items) => [...items, { ...toast, id, origin: document.activeElement }]);
    return id;
  }, []);
  const controls = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      if (
        toastElement.current?.contains(document.activeElement) &&
        current.origin instanceof HTMLElement &&
        current.origin.isConnected
      )
        current.origin.focus();
      dismissToast(current.id);
    }, current.timeoutMs ?? 5000);
    return () => clearTimeout(timer);
  }, [current, dismissToast]);

  return (
    <ToastContext.Provider value={controls}>
      {children}
      <div ref={toastElement} className="ui-toast-region">
        <div role="status" aria-live="polite" aria-atomic="true">
          {current && <p key={current.id}>{current.message}</p>}
        </div>
        {current && (
          <div className="ui-toast__actions" key={current.id}>
            {current.action && (
              <Button
                size="xl"
                variant="secondary"
                onClick={() => {
                  try {
                    current.action?.onClick();
                  } finally {
                    dismissToast(current.id);
                  }
                }}
              >
                {current.action.label}
              </Button>
            )}
            <Button variant="quiet" onClick={() => dismissToast(current.id)}>
              {copy.dismiss}
            </Button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
