/**
 * Color tokens — APP.md §12.1.
 *
 * Night is the default theme. Values given in APP.md are used verbatim; the
 * remaining Day values (marked "derived") were chosen to pass WCAG AA and are
 * logged in docs/DECISIONS.md so the owner can override them.
 */

export type ThemeName = 'night' | 'day';

export interface ColorTokens {
  bgBase: string;
  bgRaised: string;
  bgSunken: string;
  accentPrimary: string;
  accentSecondary: string;
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
    bgBase: '#0F1021',
    bgRaised: '#1A1B33',
    bgSunken: '#0A0B18',
    accentPrimary: '#FFB37A',
    accentSecondary: '#B9A5FF',
    onAccent: '#0F1021', // derived: bgBase on apricot
    textPrimary: '#F5F3FF',
    textSecondary: '#A9A8C7',
    success: '#7EE0B5',
    warning: '#FFD166',
    danger: '#FF6B7A',
    bannerWarningBg: '#3A3018', // derived
    bannerDangerBg: '#3D1A24', // derived
    border: '#2C2D4A', // derived
  },
  day: {
    bgBase: '#FBF8F4',
    bgRaised: '#FFFFFF', // derived
    bgSunken: '#F1ECE5', // derived
    accentPrimary: '#E8843C',
    accentSecondary: '#5B45B8', // derived: darker lilac for light backgrounds
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
