import { copy } from '../../ui/copy.ts';

/** Match Crew and Progress for profiles saved before names were required. */
export function proofDisplayName(name: string | undefined, fallback: string = copy.x3Partner): string {
  const trimmed = name?.trim();
  return trimmed && trimmed !== copy.x3LegacyName ? trimmed : fallback;
}
