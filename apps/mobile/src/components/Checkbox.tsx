import { minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { CheckIcon } from './icons';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Extra lines under the label (help text, links, badges). */
  children?: ReactNode;
  testID?: string;
}

/** Large tappable checkbox row. State is shown by the tick icon, not by color alone (§12.5). */
export function Checkbox({ label, checked, onChange, children, testID }: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.row}
      testID={testID}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? colors.accentPrimary : colors.textSecondary },
          checked && { backgroundColor: colors.accentPrimary },
        ]}
      >
        {checked ? <Icon icon={CheckIcon} size={16} color={colors.onAccent} /> : null}
      </View>
      <View style={styles.text}>
        <AppText>{label}</AppText>
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space(1.5),
    minHeight: minTouchTarget,
    alignItems: 'flex-start',
  },
  box: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderRadius: radius.sm / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: space(0.5) },
});
