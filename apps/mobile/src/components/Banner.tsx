import { radius, space } from '@nokuzo/design-tokens';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { InfoIcon, WarningIcon, WarningOctagonIcon } from './icons';

export type BannerTone = 'info' | 'warning' | 'danger';

export interface BannerProps {
  tone?: BannerTone;
  message: string;
  testID?: string;
}

/**
 * Inline notice (e.g. the scam warning in §7.3). Meaning is carried by the
 * icon and the text, never by color alone (§12.5).
 */
export function Banner({ tone = 'info', message, testID }: BannerProps) {
  const { colors } = useTheme();
  const look = {
    info: { bg: colors.bgRaised, fg: colors.accentSecondary, Glyph: InfoIcon, role: undefined },
    warning: { bg: colors.bannerWarningBg, fg: colors.warning, Glyph: WarningIcon, role: 'alert' },
    danger: {
      bg: colors.bannerDangerBg,
      fg: colors.danger,
      Glyph: WarningOctagonIcon,
      role: 'alert',
    },
  } as const;
  const { bg, fg, Glyph, role } = look[tone];

  return (
    <View
      accessible
      accessibilityRole={role}
      accessibilityLabel={message}
      testID={testID}
      style={[styles.banner, { backgroundColor: bg, borderColor: fg }]}
    >
      <Icon icon={Glyph} color={fg} />
      <AppText style={styles.text}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(1.5),
    padding: space(2),
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1 },
});
