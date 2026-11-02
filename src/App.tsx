import { Suspense, lazy, use } from 'react';
import { RouterProvider } from 'react-router/dom';
import { RepoProvider } from './app/RepoProvider.tsx';
import { StatusBanners } from './app/StatusBanners.tsx';
import { UpdateChip } from './app/UpdateChip.tsx';
import type { Repo } from './data/adapter.ts';
import { AuthGate } from './features/auth/AuthGate.tsx';
import './platform/install.ts';
import './platform/storage.ts';
import { router } from './router.tsx';

// Lazy so Dexie (live query) stays out of initial JS.
const ProfileFeel = lazy(() => import('./app/ProfileFeel.tsx'));

/** Signed-in shell. Tests pass a mock repo; production uses createRepo(). */
export function AppShell({ repo }: { repo: Repo }) {
  return (
    <RepoProvider repo={repo}>
      <Suspense fallback={null}><ProfileFeel /></Suspense>
      <StatusBanners />
      <UpdateChip />
      <AuthGate />
      <RouterProvider router={router} />
    </RepoProvider>
  );
}

// The data layer (Dexie, zod, sync, backend adapter) loads right after the shell, outside the initial JS budget.
let repoPromise: Promise<Repo> | undefined;
function loadRepo(): Promise<Repo> {
  repoPromise ??= import('./data/index.ts').then(({ createRepo }) => createRepo());
  return repoPromise;
}

function LoadedApp() {
  return <AppShell repo={use(loadRepo())} />;
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <LoadedApp />
    </Suspense>
  );
}
