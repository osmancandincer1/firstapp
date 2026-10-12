import { minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { FlameGradient } from './Flame';

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Single choice among a few options, exposed to screen readers as radio buttons. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, { backgroundColor: colors.bgSunken, borderColor: colors.border }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(o.value)}
            style={styles.option}
          >
            {selected ? <FlameGradient style={StyleSheet.absoluteFill} /> : null}
            <AppText variant="label" tone={selected ? 'onAccent' : 'primary'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: space(0.625),
    gap: space(0.5),
  },
  option: {
    flex: 1,
    minHeight: minTouchTarget,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1),
  },
});
