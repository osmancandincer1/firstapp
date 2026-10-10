export * from './colors';

/** APP.md §12.1 — type scale. */
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 40 } as const;

/** Families are loaded in the app (Fraunces + Inter, both OFL). */
export const fontFamily = {
  heading: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
} as const;

/** 8-point grid. */
export const space = (steps: number): number => steps * 8;

export const radius = { sm: 12, md: 20, lg: 28 } as const;

/** Minimum touch target (pt / dp) — §12.5, §16.7. */
export const minTouchTarget = 44;

/** APP.md §12.2 — motion. */
export const motion = {
  /** UI transitions. */
  durationFast: 180,
  durationBase: 220,
  durationSlow: 280,
  /** Celebration moments (always skippable). */
  celebrateMin: 600,
  celebrateMax: 1200,
  spring: { damping: 18, stiffness: 180, mass: 1 },
  /** Exits are 20% faster than entrances. */
  exitFactor: 0.8,
  /** With reduce-motion on, transitions become a cross-fade of this length. */
  reducedCrossfade: 150,
} as const;

export const exitDuration = (enterMs: number): number => Math.round(enterMs * motion.exitFactor);
