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

/** Step-response samples of UI / SLAM / HEAVY. Same strings as `springs.css`. */
export const SPRING_EASE = {
  ui: 'linear(0, 0.113, 0.34, 0.571, 0.759, 0.889, 0.969, 1.01, 1.026, 1.028, 1.023, 1.017, 1.01, 1.005, 1.002, 1, 1)',
  slam: 'linear(0, 0.386, 0.986, 1.277, 1.224, 1.046, 0.931, 0.924, 0.973, 1.014, 1.024, 1.012, 0.998, 0.993, 0.995, 1, 1.002)',
  heavy: 'linear(0, 0.107, 0.324, 0.552, 0.74, 0.876, 0.961, 1.008, 1.027, 1.031, 1.027, 1.02, 1.013, 1.007, 1.003, 1.001, 1)',
  fallback: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

/** Settle time of those samples, in milliseconds. */
export const SPRING_MS = { ui: 438, slam: 674, heavy: 674 } as const;
