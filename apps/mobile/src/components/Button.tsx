import { minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Extra context for screen readers when the label alone is ambiguous. */
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.accentPrimary, fg: 'onAccent', border: colors.accentPrimary },
    secondary: { bg: colors.bgRaised, fg: 'primary', border: colors.border },
    ghost: { bg: 'transparent', fg: 'accent', border: 'transparent' },
    danger: { bg: colors.bgRaised, fg: 'danger', border: colors.danger },
  } as const;
  const { bg, fg, border } = palette[variant];
  const spinnerColor = variant === 'primary' ? colors.onAccent : colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={spinnerColor} testID="button-spinner" /> : null}
        <AppText variant="label" tone={fg}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1),
  },
});
