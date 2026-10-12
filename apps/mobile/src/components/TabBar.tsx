import { flame, space } from '@nokuzo/design-tokens';
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { FlameGradient } from './Flame';
import { Icon } from './Icon';

export interface TabItem {
  key: string;
  label: string;
  icon: PhosphorIcon;
}

function TabButton({
  item,
  active,
  onPress,
}: {
  item: TabItem;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, reduceMotion } = useTheme();
  const scale = useSharedValue(active ? 1 : 0.9);
  useEffect(() => {
    const to = active ? 1 : 0.9;
    if (reduceMotion) scale.set(to);
    else scale.set(withSpring(to, { damping: 14, stiffness: 260 }));
  }, [active, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      testID={`tab-${item.key}`}
    >
      <Animated.View style={[styles.button, !active && styles.idle, style]}>
        {active ? <FlameGradient style={StyleSheet.absoluteFill} /> : null}
        <Icon
          icon={item.icon}
          size={24}
          color={active ? colors.textPrimary : colors.textSecondary}
        />
      </Animated.View>
    </Pressable>
  );
}

/**
 * Floating glass pill with the four tabs (§8, D-065). The active tab is a
 * flame circle that springs in; labels are for screen readers.
 */
export function TabBar({
  items,
  activeKey,
  onSelect,
}: {
  items: readonly TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.dock,
        { paddingBottom: Math.max(insets.bottom, space(2)), backgroundColor: colors.bgBase },
      ]}
    >
      <View accessibilityRole="tablist" style={styles.pill}>
        {items.map((item) => (
          <TabButton
            key={item.key}
            item={item}
            active={item.key === activeKey}
            onPress={() => onSelect(item.key)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { alignItems: 'center', paddingTop: space(1) },
  pill: {
    flexDirection: 'row',
    gap: space(1),
    padding: space(1),
    borderRadius: 999,
    backgroundColor: flame.glass,
    borderWidth: 1,
    borderColor: flame.glassBorder,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  idle: { backgroundColor: flame.chip },
});
