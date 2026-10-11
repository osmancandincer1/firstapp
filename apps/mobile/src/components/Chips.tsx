import { minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string> {
  label: string;
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** Single choice is announced as radio buttons, multiple choice as checkboxes. */
  multiple?: boolean;
  testID?: string;
}

/** Wrapping row of selectable chips; the selection is shown by fill and by the screen-reader state. */
export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
  multiple = false,
  testID,
}: ChipGroupProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole={multiple ? undefined : 'radiogroup'}
      accessibilityLabel={label}
      style={styles.group}
      testID={testID}
    >
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityLabel={o.label}
            accessibilityState={multiple ? { checked: on } : { selected: on, checked: on }}
            onPress={() => onToggle(o.value)}
            style={[
              styles.chip,
              { borderColor: on ? colors.accentPrimary : colors.border },
              on && { backgroundColor: colors.accentPrimary },
            ]}
          >
            <AppText variant="label" tone={on ? 'onAccent' : 'primary'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1) },
  chip: {
    minHeight: minTouchTarget,
    paddingHorizontal: space(2),
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
