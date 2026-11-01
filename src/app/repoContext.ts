import { createContext } from 'react';
import type { Repo } from '../data/adapter.ts';

export const RepoContext = createContext<Repo | null>(null);
