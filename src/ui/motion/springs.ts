/** Motion tokens from spec §3.7.1. Components use these; they do not invent spring numbers. */

export const UI = { type: 'spring', stiffness: 400, damping: 30 } as const;
export const SLAM = { type: 'spring', stiffness: 600, damping: 18 } as const;
export const HEAVY = { type: 'spring', stiffness: 220, damping: 26, mass: 1.4 } as const;

export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

export const MOTION_MS = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 420,
  heroMin: 1200,
  heroMax: 1800,
  tierGap: 400,
  plateDrop: 160,
  wdth: 240,
  reducedFade: 200,
} as const;
