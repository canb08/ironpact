import { useContext } from 'react';
import type { Repo } from '../data/adapter.ts';
import { RepoContext } from './repoContext.ts';

export function useRepo(): Repo {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error('useRepo() needs a <RepoProvider> above it');
  return repo;
}
