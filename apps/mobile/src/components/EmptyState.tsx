import { flame, radius, space } from '@nokuzo/design-tokens';
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { FlameGradient } from './Flame';
import { Icon } from './Icon';

/** A calm "nothing here yet" panel: a glowing icon and one sentence of what to do. */
export function EmptyState({
  icon,
  message,
  testID,
}: {
  icon: PhosphorIcon;
  message: string;
  testID?: string;
}) {
  const { colors, reduceMotion } = useTheme();
  return (
    <View style={styles.box}>
      <Animated.View
        entering={reduceMotion ? FadeIn : ZoomIn.springify().damping(14)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.halo}>
          <FlameGradient style={styles.icon}>
            <Icon icon={icon} size={30} color={colors.onAccent} />
          </FlameGradient>
        </View>
      </Animated.View>
      <AppText tone="secondary" style={styles.text} testID={testID}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: space(2),
    paddingVertical: space(5),
    paddingHorizontal: space(2),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: flame.glassBorder,
  },
  halo: {
    padding: space(1.25),
    borderRadius: 999,
    backgroundColor: 'rgba(255,138,42,0.12)',
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { textAlign: 'center' },
});
