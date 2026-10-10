import { fontFamily, fontSize, minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { useId } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { WarningCircleIcon } from './icons';

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /** Shown under the field when there is no error. */
  help?: string;
  error?: string;
  /** When set together with maxLength, shows a live "n / max" counter. */
  showCounter?: boolean;
}

export function Input({ label, help, error, showCounter, value, maxLength, ...rest }: InputProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const id = useId();
  const count = value?.length ?? 0;
  const describedBy = error ?? help;

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" nativeID={`${id}-label`}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={`${id}-label`}
        accessibilityHint={describedBy}
        accessibilityState={{ disabled: rest.editable === false }}
        aria-invalid={Boolean(error)}
        value={value}
        maxLength={maxLength}
        placeholderTextColor={colors.textSecondary}
        maxFontSizeMultiplier={2}
        style={[
          styles.input,
          {
            backgroundColor: colors.bgSunken,
            color: colors.textPrimary,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
        {...rest}
      />
      <View style={styles.footer}>
        <View style={styles.help}>
          {error ? <Icon icon={WarningCircleIcon} size={16} color={colors.danger} /> : null}
          {describedBy ? (
            <AppText variant="caption" tone={error ? 'danger' : 'secondary'} style={styles.flex}>
              {describedBy}
            </AppText>
          ) : null}
        </View>
        {showCounter && maxLength ? (
          <AppText
            variant="caption"
            tone={count >= maxLength ? 'warning' : 'secondary'}
            accessibilityLabel={t('common.characterCount', { count, max: maxLength })}
          >
            {count}/{maxLength}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space(1) },
  input: {
    minHeight: minTouchTarget,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    fontFamily: fontFamily.body,
    fontSize: fontSize.md,
  },
  footer: { flexDirection: 'row', gap: space(1) },
  help: { flex: 1, flexDirection: 'row', gap: space(0.5) },
  flex: { flex: 1 },
});
