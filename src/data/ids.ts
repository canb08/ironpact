import { v5 } from 'uuid';
export const NS_BODYWEIGHT = 'd188af2e-e717-4b89-86a4-bf30e766a21b';
export function newId(): string { return crypto.randomUUID(); }
export function bodyweightId(userId: string, localDate: string): string {
  return v5(`${userId}:${localDate}`, NS_BODYWEIGHT);
}
