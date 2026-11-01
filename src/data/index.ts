import type { Repo } from './adapter.ts';
import { createMockRemote } from './adapter.mock.ts';
import { createDataRepo } from './repo.ts';

let singleton: Repo | undefined;

export function createRepo(): Repo {
  const backend = import.meta.env.VITE_BACKEND ?? 'mock';
  if (backend === 'supabase') throw new Error('A7 not merged');
  if (backend !== 'mock') throw new Error(`Unknown backend: ${backend}`);
  singleton ??= createDataRepo(createMockRemote());
  return singleton;
}
export type * from './adapter.ts';
export type * from '../core/types.ts';
