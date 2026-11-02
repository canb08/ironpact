import type { Instant, LocalDate, Result, SessionKind, SyncFields, Uuid } from '../core/types.ts';
import type { Unsubscribe } from './adapter.ts';

/** P3B / L10: server-owned week and spot rows; no two-member assumption. */
export interface CrewWeek {
  crew_id: Uuid;
  week_start: LocalDate;
  statuses: Record<Uuid, { credits: number; target: number; status: 'FULL' | 'HELD' | 'REST'; spotted_by: Uuid | null }>;
  plate_delta: -1 | 0 | 1;
  plates_after: number;
  adjusted_after_edit: boolean;
  computed_at: Instant;
}
export interface Spot extends SyncFields {
  crew_id: Uuid;
  kind: 'spot';
  week_start: LocalDate;
  covers_user_id: Uuid;
  created_at: Instant;
}
export interface CrewPresence {
  user_id: Uuid;
  session_id: Uuid;
  kind: SessionKind;
  exercise_label: string | null;
  set_no: number;
  planned_sets: number;
  started_at: Instant;
  last_active_at: Instant;
}
export const SPOT_ERRORS = ['unauthenticated', 'invalid_week_start', 'not_in_crew', 'crew_archived',
  'spot_window_closed', 'week_closed', 'spot_monthly_limit', 'spot_needs_extra_credit', 'no_partner_needs_spot'] as const;
export type SpotError = (typeof SPOT_ERRORS)[number] | 'network';

export interface CrewRealtimeCallbacks {
  onPresence(rows: CrewPresence[]): void;
  /** Notification only: canonical rows always arrive through the normal delta pull. */
  onChange(): void;
}
export interface CrewRealtime {
  setPresence(row: CrewPresence | null): void;
  reconnect(): void;
  close(): void;
}
export interface RepoDuo {
  /** Local mirror reads, safe inside Dexie liveQuery. Oldest week first. */
  weeks(fromWeekStart: LocalDate): Promise<CrewWeek[]>;
  bar(): Promise<{ value: number; history: CrewWeek[] }>;
  spots(): Promise<Spot[]>;
  useSpot(weekStart: LocalDate): Promise<Result<Uuid, SpotError>>;
  presence: { onChange(cb: (rows: CrewPresence[]) => void): Unsubscribe };
  /** Fires after the notified delta pull has completed. */
  onCrewChange(cb: () => void): Unsubscribe;
}
