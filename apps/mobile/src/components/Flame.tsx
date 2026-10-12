import { flame } from '@nokuzo/design-tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/design/theme';

/** The flame gradient (orange → red-orange → ember), used for primary actions (D-065). */
export function FlameGradient({
  children,
  style,
  angle = 'diagonal',
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  angle?: 'diagonal' | 'horizontal';
}) {
  return (
    <LinearGradient
      colors={[flame.start, flame.mid, flame.end]}
      start={{ x: 0, y: 0 }}
      end={angle === 'horizontal' ? { x: 1, y: 0 } : { x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

/** One soft, round glow: a radial gradient that fades to nothing, so it has no edge. */
function Glow({ size, color, id }: { size: number; color: string; id: string }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={1} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

export type GlowPlacement = 'top-left' | 'top-right' | 'center';

/**
 * Decorative ember glow behind a screen. It drifts very slowly; with reduce
 * motion it stays still. Hidden from screen readers.
 */
export function GlowBackdrop({ placement = 'top-left' }: { placement?: GlowPlacement }) {
  const { reduceMotion } = useTheme();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(drift);
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(drift);
  }, [reduceMotion, drift]);

  const warm = useAnimatedStyle(() => ({
    transform: [{ translateX: -24 * drift.value }, { translateY: 30 * drift.value }],
  }));
  const ember = useAnimatedStyle(() => ({
    transform: [{ translateX: 28 * drift.value }, { translateY: -22 * drift.value }],
  }));

  const pos = {
    'top-left': { warm: { left: -160, top: -200 }, ember: { right: -260, top: 200 } },
    'top-right': { warm: { right: -200, top: -220 }, ember: { left: -280, top: 260 } },
    center: { warm: { left: -100, top: 40 }, ember: { right: -260, top: 340 } },
  }[placement];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Animated.View style={[styles.glow, pos.warm, warm]}>
        <Glow size={560} color={flame.start} id="nk-glow-warm" />
      </Animated.View>
      <Animated.View style={[styles.glow, pos.ember, ember, styles.faint]}>
        <Glow size={520} color={flame.end} id="nk-glow-ember" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', opacity: 0.42 },
  faint: { opacity: 0.32 },
});
