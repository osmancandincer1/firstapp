import { minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';

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
            style={[styles.option, selected && { backgroundColor: colors.accentPrimary }]}
          >
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
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: space(0.5),
    gap: space(0.5),
  },
  option: {
    flex: 1,
    minHeight: minTouchTarget,
    borderRadius: radius.sm - 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1),
  },
});
