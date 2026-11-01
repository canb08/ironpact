import type { Profile } from '../core/types.ts';
export function defaultProfile(id: string, tz: string): Profile {
  return {
    id, display_name: 'Athlete', initial: 'A', color_hue: 125, tz, weekly_target: 3,
    show_bodyweight: false, share_dots: false, sound_on: false, haptics_on: true,
    reduce_motion: false, battery_saver: false, big_jumps: false, theme: 'dark',
    quiet_start: '22:00', quiet_end: '08:00',
    notify: { partner_start: false, partner_pr: true, nudge: true, recap: true, spot: true },
    min_default_label: '20m walk', gym_treat_url: null, bar_kg: 20,
    plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25], export_format: 'lines',
  };
}
