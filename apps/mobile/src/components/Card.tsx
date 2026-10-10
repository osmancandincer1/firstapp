import { radius, space } from '@nokuzo/design-tokens';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/design/theme';

export interface CardProps extends ViewProps {
  children: ReactNode;
}

/** Raised content surface. No glass/blur on content cards (§12.1). */
export function Card({ children, style, ...rest }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.bgRaised, borderColor: colors.border }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space(2),
    gap: space(1),
  },
});
