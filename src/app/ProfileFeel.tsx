import { useEffect } from 'react';
import { useRepoQuery } from '../features/floor/useRepoQuery.ts';
import { applyDocumentFeel } from '../features/settings/feel.ts';
import { useRepo } from './useRepo.ts';

/** Applies saved theme / reduce motion / battery saver / sound / haptics on every launch, not only after Settings opens. */
export default function ProfileFeel() {
  const repo = useRepo();
  const me = useRepoQuery(() => repo.q.me(), [repo]);
  useEffect(() => { if (me) applyDocumentFeel(me); }, [me]);
  return null;
}
