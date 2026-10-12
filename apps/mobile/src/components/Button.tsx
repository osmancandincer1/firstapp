import { flame, minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { FlameGradient } from './Flame';

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

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

/**
 * Pill button of the "Alev" look (D-065): primary = flame gradient, secondary =
 * glass, ghost = text, danger = outline. A soft spring on press; none with
 * reduce motion.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors, reduceMotion } = useTheme();
  const inactive = disabled || loading;
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = (to: number) => {
    if (!reduceMotion) scale.set(withSpring(to, SPRING));
  };

  const look = {
    primary: { fg: 'onAccent', bg: 'transparent', border: 'transparent' },
    secondary: { fg: 'primary', bg: flame.chip, border: flame.glassBorder },
    ghost: { fg: 'accent', bg: 'transparent', border: 'transparent' },
    danger: { fg: 'danger', bg: 'transparent', border: colors.danger },
  } as const;
  const { fg, bg, border } = look[variant];
  const spinnerColor = variant === 'primary' ? colors.onAccent : colors.textPrimary;

  const content = (
    <View style={styles.content}>
      {loading ? <ActivityIndicator color={spinnerColor} testID="button-spinner" /> : null}
      <AppText variant="label" tone={fg} style={styles.label}>
        {label}
      </AppText>
    </View>
  );

  return (
    <Animated.View style={[pressed, { opacity: inactive ? 0.45 : 1 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        testID={testID}
        style={[
          styles.base,
          variant === 'primary' && styles.primary,
          { backgroundColor: bg, borderColor: border },
        ]}
      >
        {variant === 'primary' ? (
          <FlameGradient angle="horizontal" style={styles.fill}>
            {content}
          </FlameGradient>
        ) : (
          content
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget + 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: {
    minHeight: 56,
    borderWidth: 0,
    shadowColor: flame.start,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  fill: { flex: 1, justifyContent: 'center', minHeight: 56 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1),
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
  },
  label: { fontSize: 15 },
});
