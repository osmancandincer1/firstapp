import { radius as radii } from '@nokuzo/design-tokens';
import { useEffect } from 'react';
import { type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/design/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  testID?: string;
}

/**
 * Placeholder in the shape of the content being loaded (§12.3 "Yükleniyor").
 * The shimmer runs on the UI thread; with reduce-motion on it stays static.
 * Decorative: the surrounding container announces the loading state.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = radii.sm,
  testID,
}: SkeletonProps) {
  const { colors, reduceMotion } = useTheme();
  const opacity = useSharedValue(reduceMotion ? 0.6 : 0.4);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.border }, animated]}
    />
  );
}
