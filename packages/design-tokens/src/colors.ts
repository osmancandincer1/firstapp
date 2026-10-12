/**
 * Color tokens — APP.md §12.1, "Alev" palette (D-065).
 *
 * Night ("Alev": black ground, ember and flame tones) is the only theme the
 * app shows; Day is kept for later and is not offered in the UI. Every
 * foreground/background pair below passes WCAG AA (tested).
 */

export type ThemeName = 'night' | 'day';

export interface ColorTokens {
  bgBase: string;
  bgRaised: string;
  bgSunken: string;
  accentPrimary: string;
  accentSecondary: string;
  /** Far end of the flame gradient (accentPrimary → accentDeep). */
  accentDeep: string;
  /** Text/icon drawn on top of accentPrimary (e.g. primary button label). */
  onAccent: string;
  textPrimary: string;
  textSecondary: string;
  success: string;
  warning: string;
  danger: string;
  /** Background of a warning/danger banner; text on it is textPrimary. */
  bannerWarningBg: string;
  bannerDangerBg: string;
  border: string;
}

export const colors: Record<ThemeName, ColorTokens> = {
  night: {
    bgBase: '#0E0907',
    bgRaised: '#1C120D',
    bgSunken: '#080504',
    accentPrimary: '#FF8A2A',
    accentSecondary: '#FFB48A',
    accentDeep: '#E2412F',
    onAccent: '#1A0B06',
    textPrimary: '#FFF4EC',
    textSecondary: '#C9AFA3',
    success: '#6BD39A',
    warning: '#FFB43A',
    danger: '#FF7A6B',
    bannerWarningBg: '#33240F',
    bannerDangerBg: '#3A1512',
    border: '#3A2820',
  },
  day: {
    bgBase: '#FBF8F4',
    bgRaised: '#FFFFFF', // derived
    bgSunken: '#F1ECE5', // derived
    accentPrimary: '#E8843C',
    accentSecondary: '#5B45B8', // derived: darker lilac for light backgrounds
    accentDeep: '#B8321F', // derived
    onAccent: '#171830', // derived: textPrimary on apricot
    textPrimary: '#171830',
    textSecondary: '#55546E', // derived
    success: '#1D6B4A', // derived
    warning: '#7A5200', // derived
    danger: '#B4233A', // derived
    bannerWarningBg: '#FFF1CC', // derived
    bannerDangerBg: '#FDE2E5', // derived
    border: '#E3DCD2', // derived
  },
};

/**
 * Foreground/background pairs that must reach WCAG AA (4.5:1) in every theme.
 * Any new pairing used in UI must be added here; the test enforces it.
 */
export const contrastPairs: readonly (readonly [keyof ColorTokens, keyof ColorTokens])[] = [
  ['textPrimary', 'bgBase'],
  ['textPrimary', 'bgRaised'],
  ['textPrimary', 'bgSunken'],
  ['textSecondary', 'bgBase'],
  ['textSecondary', 'bgRaised'],
  ['textSecondary', 'bgSunken'],
  ['onAccent', 'accentPrimary'],
  ['accentSecondary', 'bgBase'],
  ['accentSecondary', 'bgRaised'],
  ['success', 'bgBase'],
  ['success', 'bgRaised'],
  ['warning', 'bgBase'],
  ['danger', 'bgBase'],
  ['danger', 'bgRaised'],
  ['textPrimary', 'bannerWarningBg'],
  ['textPrimary', 'bannerDangerBg'],
];

function channel(hex: string, offset: number): number {
  const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Invalid color: ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG 2.x contrast ratio between two #RRGGBB colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The flame gradient and soft glows of the "Alev" look (D-065). Glows are
 * translucent and only ever drawn behind content, never as text backgrounds.
 */
export const flame = {
  start: '#FF8A2A',
  mid: '#F2552C',
  end: '#D63A26',
  glowWarm: 'rgba(255,122,26,0.42)',
  glowEmber: 'rgba(226,65,47,0.30)',
  glass: 'rgba(28,17,12,0.86)',
  glassBorder: 'rgba(255,190,150,0.14)',
  chip: 'rgba(255,255,255,0.07)',
  chipBorder: 'rgba(255,255,255,0.10)',
} as const;
