// Isolated onboarding fixture: real AppShell/AuthGate, deterministic Repo contract.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RepoProvider } from '../../../src/app/RepoProvider.tsx';
import { TodayNamePrompt } from '../../../src/features/onboarding/TodayNamePrompt.tsx';
import { createRoot } from 'react-dom/client';
import { AppShell } from '../../../src/App.tsx';
import { router } from '../../../src/router.tsx';
import type { Profile } from '../../../src/core/types.ts';
import { mockRepo, testCrew, testMember, testProfile } from '../../unit/features/auth/mockRepo.ts';
import '../../../src/ui/tokens.css';

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'crew';
const returning = scenario === 'today';
let profile: Profile | undefined = returning ? testProfile({ display_name: '', initial: '' }) : undefined;
let membership = returning;
const crewListeners = new Set<() => void>();
const repo = mockRepo({
  userId: scenario === 'signin' || scenario === 'install' ? null : 'user-1',
  q: {
    me: async () => profile,
    myCrew: async () => membership ? { crew: testCrew(), members: [testMember()] } : undefined,
    profiles: async () => profile ? [profile] : [],
  },
  w: { upsertMyProfile: async (patch) => {
    profile = testProfile({ ...profile, ...patch });
    return { ok: true, value: profile };
  } },
  crew: {
    create: async () => {
      membership = true;
      queueMicrotask(() => crewListeners.forEach((listener) => listener()));
      return { ok: true, value: testCrew() };
    },
    redeem: async () => {
      membership = true;
      queueMicrotask(() => crewListeners.forEach((listener) => listener()));
      return { ok: true, value: testCrew() };
    },
  },
});
repo.duo.onCrewChange = (listener) => { crewListeners.add(listener); return () => { crewListeners.delete(listener); }; };
if (scenario !== 'install') localStorage.setItem('ironpact.install-dismissed', '1');
await router.navigate(scenario === 'signin' ? '/sign-in' : scenario === 'install' ? '/install'
  : scenario === 'today' ? '/' : scenario === 'join' ? '/join/ABCDEFGHJK' : '/crew/new');
// Preview only: the production Today mount is outside X9's file allowlist.
function NamePromptPreview() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const slot = document.createElement('div');
    const attach = () => {
      const floor = document.querySelector('main.floor');
      if (!floor || slot.isConnected) return;
      floor.prepend(slot);
      setTarget(slot);
    };
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    attach();
    return () => { observer.disconnect(); slot.remove(); };
  }, []);
  return target ? createPortal(<RepoProvider repo={repo}><TodayNamePrompt /></RepoProvider>, target) : null;
}
createRoot(document.getElementById('root')!).render(<><AppShell repo={repo} />{returning && <NamePromptPreview />}</>);
