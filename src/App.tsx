import { RouterProvider } from 'react-router/dom';
import { RepoProvider } from './app/RepoProvider.tsx';
import { createRepo } from './data/index.ts';
import type { Repo } from './data/adapter.ts';
import { AuthGate } from './features/auth/AuthGate.tsx';
import './platform/install.ts';
import './platform/storage.ts';
import { router } from './router.tsx';

/** Signed-in shell. Tests pass a mock repo; production uses createRepo(). */
export function AppShell({ repo }: { repo: Repo }) {
  return (
    <RepoProvider repo={repo}>
      <AuthGate />
      <RouterProvider router={router} />
    </RepoProvider>
  );
}

export default function App() {
  return <AppShell repo={createRepo()} />;
}
