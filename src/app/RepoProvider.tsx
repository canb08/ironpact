import type { ReactNode } from 'react';
import type { Repo } from '../data/adapter.ts';
import { RepoContext } from './repoContext.ts';

// Screens get the Repo from here; tests wrap screens with a mock Repo.
export function RepoProvider({ repo, children }: { repo: Repo; children: ReactNode }) {
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}
