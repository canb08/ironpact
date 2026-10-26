import type { BodyweightEntry, CardioEntry, Crew, CrewMember, Exercise, MartialEntry, MinEntry, Profile, Session, SetRow } from '../../../src/core/types.ts';

export const id = (n: number) => `00000000-0000-5000-8000-${n.toString().padStart(12, '0')}`;
export const instant = '2026-10-25T22:30:00.000Z';
export const sync = {
  id: id(1), user_id: id(2), local_date: '2026-10-25', client_updated_at: instant,
  deleted_at: null, created_at: instant, updated_at: instant,
};
export const profile: Profile = {
  id: id(2), display_name: 'A', initial: 'A', color_hue: 125, tz: 'Europe/Amsterdam',
  weekly_target: 3, show_bodyweight: false, share_dots: false, sound_on: false, haptics_on: true,
  reduce_motion: false, battery_saver: false, big_jumps: false, theme: 'dark',
  quiet_start: '22:00', quiet_end: '08:00',
  notify: { partner_start: false, partner_pr: true, nudge: true, recap: true, spot: true },
  min_default_label: '20m walk', gym_treat_url: null, bar_kg: 20, plates_kg: [20, 2.5], export_format: 'lines',
};
export const crew: Crew = { id: id(3), name: 'Crew', tz: 'Europe/Amsterdam', max_members: 8, created_by: null };
export const member: CrewMember = { crew_id: id(3), user_id: id(2), role: 'owner', joined_at: instant, left_at: null };
export const exercise: Exercise = {
  id: id(4), owner_id: null, name: 'Bench press', export_label: 'Bench', aliases: [], kind: 'lift',
  category: 'compound', lower_body: false, equipment: null, increment_kg: 2.5, rep_target: 5,
  client_updated_at: instant, deleted_at: null,
};
export const session: Session = {
  ...sync, kind: 'gym', mode: 'full', started_at: instant, ended_at: null, tz: 'Europe/Amsterdam',
  readiness: null, together_id: null, note: null,
};
export const set: SetRow = {
  ...sync, id: id(5), session_id: session.id, exercise_id: exercise.id, set_index: 1,
  reps: 5, weight_kg: 100, rpe: null, is_warmup: false, note: null, logged_at: instant,
};
export const cardio: CardioEntry = {
  ...sync, id: id(6), session_id: session.id, activity: 'Run', distance_m: 5000, duration_s: 1500,
  rpe: null, note: null, logged_at: instant,
};
export const martial: MartialEntry = {
  ...sync, id: id(7), session_id: session.id, discipline: 'BJJ', duration_min: 45, rounds: null,
  rpe: null, note: null, logged_at: instant,
};
export const min: MinEntry = {
  ...sync, id: id(8), session_id: session.id, description: '20m walk', duration_min: null, logged_at: instant,
};
export const bodyweight: BodyweightEntry = { ...sync, id: id(9), weight_kg: 78, measured_at: instant };
