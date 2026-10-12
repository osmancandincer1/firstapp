import { fontFamily, fontSize } from '@nokuzo/design-tokens';
import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/design/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'onAccent';

const variantStyle: Record<
  Variant,
  { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number }
> = {
  display: { fontFamily: fontFamily.heading, fontSize: 44, lineHeight: 46, letterSpacing: -1.4 },
  title: { fontFamily: fontFamily.heading, fontSize: 32, lineHeight: 36, letterSpacing: -0.9 },
  heading: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.lg,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  body: { fontFamily: fontFamily.body, fontSize: fontSize.md, lineHeight: 24 },
  label: { fontFamily: fontFamily.bodyBold, fontSize: fontSize.sm, lineHeight: 20 },
  caption: { fontFamily: fontFamily.body, fontSize: fontSize.xs, lineHeight: 16 },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

/** Typography primitive. Dynamic type stays on (§12.5: up to 200% without breaking). */
export function AppText({ variant = 'body', tone = 'primary', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const color = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    accent: colors.accentSecondary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    onAccent: colors.onAccent,
  }[tone];
  const isHeading = variant === 'display' || variant === 'title' || variant === 'heading';
  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      maxFontSizeMultiplier={2}
      style={[variantStyle[variant], { color }, style]}
      {...rest}
    />
  );
}
