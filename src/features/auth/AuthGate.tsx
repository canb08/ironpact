import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import { isStandalone } from '../../platform/install.ts';
import { router } from '../../router.tsx';
import { dismissInstallGate, installDismissed, joinCodeFromPath, readJoinCode, rememberJoinCode } from './joinCode.ts';

function destination(userId: string | null, path: string, hasCrew: boolean): string | null {
  const join = joinCodeFromPath(path);
  if (join) rememberJoinCode(join);
  if (!isStandalone() && !installDismissed() && path !== '/install' && !join) return '/install';
  if (!userId) {
    if (path === '/sign-in' || path === '/install' || join) return null;
    return '/sign-in';
  }
  if (!hasCrew) {
    if (join || path === '/crew/new' || path === '/install') return null;
    if (path === '/sign-in') {
      const code = readJoinCode();
      return code ? `/join/${code}` : '/crew/new';
    }
    return '/crew/new';
  }
  if (path === '/sign-in' || path === '/crew/new') return '/';
  return null;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const [userId, setUserId] = useState<string | null>(repo.auth.userId());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    // Bound the first-paint wait even if the local crew read never settles.
    const timeout = setTimeout(() => setReady(true), 3_000);
    return () => clearTimeout(timeout);
  }, [ready]);

  useEffect(() => repo.auth.onChange(setUserId), [repo]);

  useEffect(() => {
    let cancel = false;
    let running = false;
    let again = false;
    let lastTarget: string | null = null;
    let previous = router.state.location.pathname;
    const run = () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      void (async () => {
        try {
          for (let hop = 0; hop < 4 && !cancel; hop += 1) {
            again = false;
            const path = router.state.location.pathname;
            if (previous === '/install' && path !== '/install') dismissInstallGate();
            previous = path;
            const id = repo.auth.userId();
            const crew = id ? await repo.q.myCrew() : undefined;
            if (cancel) return;
            const here = router.state.location.pathname;
            const next = destination(id, here, crew !== undefined);
            if (!next || next === here || next === lastTarget) return;
            lastTarget = next;
            await router.navigate(next, { replace: true });
            if (router.state.location.pathname === next) lastTarget = null;
            if (!again) return;
          }
        } catch {
          // A failed gate read must not leave the router hidden.
        } finally {
          running = false;
          if (!cancel) setReady(true);
        }
      })();
    };
    run();
    const unsubscribe = router.subscribe(() => {
      if (!cancel) run();
    });
    return () => {
      cancel = true;
      unsubscribe();
    };
  }, [repo, userId]);

  return ready ? children : null;
}
