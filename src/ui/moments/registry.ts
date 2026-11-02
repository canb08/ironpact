import type { ReactNode } from 'react';

const views = new Map<string, () => ReactNode>();

/** Paint for a registered moment id. Returns an unregister function. */
export function registerMomentView(id: string, view: () => ReactNode): () => void {
  views.set(id, view);
  return () => {
    if (views.get(id) === view) views.delete(id);
  };
}

export function momentView(id: string): (() => ReactNode) | undefined {
  return views.get(id);
}
