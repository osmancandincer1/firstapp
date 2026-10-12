import { flame, motion, space } from '@nokuzo/design-tokens';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/design/theme';
import { FlameGradient } from './Flame';

export interface StepProgressProps {
  index: number;
  total: number;
}

const DOT = 8;
const CURRENT = 26;

/** One step: the current one stretches into a flame pill. */
function Step({ state }: { state: 'done' | 'current' | 'todo' }) {
  const { colors, reduceMotion } = useTheme();
  const width = useSharedValue(state === 'current' ? CURRENT : DOT);
  useEffect(() => {
    const to = state === 'current' ? CURRENT : DOT;
    width.set(reduceMotion ? to : withTiming(to, { duration: motion.durationBase }));
  }, [state, reduceMotion, width]);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  return (
    <Animated.View
      style={[
        styles.dot,
        style,
        state === 'done' && { backgroundColor: colors.accentPrimary },
        state === 'todo' && { backgroundColor: flame.chip, borderColor: flame.chipBorder },
      ]}
    >
      {state === 'current' ? <FlameGradient style={StyleSheet.absoluteFill} /> : null}
    </Animated.View>
  );
}

/** Sign-up progress as a row of dots (the nine-dot motif, §12.1); announced as "Step x of y". */
export function StepProgress({ index, total }: StepProgressProps) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.progress', { index, total })}
      accessibilityValue={{ min: 1, max: total, now: index }}
      style={styles.row}
      testID="step-progress"
    >
      {Array.from({ length: total }, (_, i) => (
        <Step key={i} state={i + 1 < index ? 'done' : i + 1 === index ? 'current' : 'todo'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(0.75) },
  dot: {
    height: DOT,
    borderRadius: DOT / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
});
