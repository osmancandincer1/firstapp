import { space } from '@nokuzo/design-tokens';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/design/theme';

export interface StepProgressProps {
  index: number;
  total: number;
}

/** Sign-up progress as a row of dots (the nine-dot motif, §12.1); announced as "Step x of y". */
export function StepProgress({ index, total }: StepProgressProps) {
  const { colors } = useTheme();
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
        <View
          key={i}
          style={[
            styles.dot,
            i < index
              ? { backgroundColor: colors.accentPrimary }
              : { borderColor: colors.textSecondary, borderWidth: 1 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space(1) },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
