import { radius, space } from '@nokuzo/design-tokens';
import { useEffect, useRef } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';

export const WHEEL_ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PAD = WHEEL_ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

export interface WheelOption<T> {
  value: T;
  label: string;
}

export interface WheelPickerProps<T> {
  /** Column name, also the screen-reader label. */
  label: string;
  options: readonly WheelOption<T>[];
  /** null = nothing chosen yet; the wheel then rests on a "—" row. */
  value: T | null;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * Scroll-to-choose column (iOS-style wheel). The row in the middle band is the
 * value; tapping a row also picks it. Screen readers get an adjustable control
 * (swipe up/down). With reduce motion on, the wheel jumps instead of gliding.
 */
export function WheelPicker<T>({ label, options, value, onChange, testID }: WheelPickerProps<T>) {
  const { colors, reduceMotion } = useTheme();
  const ref = useRef<ScrollView>(null);
  // Row 0 is the empty "—" placeholder.
  const index = value === null ? 0 : options.findIndex((o) => o.value === value) + 1;
  const shown = index > 0 ? options[index - 1]!.label : '—';

  // Keep the wheel on the value when it changes from outside (e.g. day clamped to the month).
  useEffect(() => {
    ref.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: !reduceMotion });
  }, [index, reduceMotion]);

  const pick = (row: number) => {
    const clamped = Math.max(1, Math.min(options.length, row));
    const option = options[clamped - 1];
    if (option && option.value !== value) onChange(option.value);
    else ref.current?.scrollTo({ y: clamped * WHEEL_ITEM_HEIGHT, animated: !reduceMotion });
  };

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    pick(Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT));

  return (
    <View style={styles.column}>
      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          pick(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))
        }
        style={[styles.wheel, { backgroundColor: colors.bgSunken, borderColor: colors.border }]}
        testID={testID}
      >
        <View
          pointerEvents="none"
          style={[
            styles.band,
            { borderColor: colors.accentPrimary, backgroundColor: colors.bgRaised },
          ]}
        />
        <ScrollView
          ref={ref}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          contentContainerStyle={styles.content}
          contentOffset={{ x: 0, y: index * WHEEL_ITEM_HEIGHT }}
          onMomentumScrollEnd={onSettle}
          // A slow drag released without a fling never gets a momentum end.
          onScrollEndDrag={(e) => {
            if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) onSettle(e);
          }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {[{ label: '—' }, ...options].map((o, row) => (
            <Pressable
              key={`${row}-${o.label}`}
              onPress={() => pick(row)}
              style={styles.item}
              accessibilityElementsHidden
            >
              <AppText
                variant={row === index ? 'heading' : 'body'}
                tone={row === index ? 'primary' : 'secondary'}
              >
                {o.label}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, gap: space(1) },
  label: {},
  wheel: {
    height: WHEEL_ITEM_HEIGHT * VISIBLE_ROWS,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    left: space(0.5),
    right: space(0.5),
    top: PAD,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  content: { paddingVertical: PAD },
  item: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
});
