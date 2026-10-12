import { space } from '@nokuzo/design-tokens';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { GlowBackdrop } from './Flame';

export interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Rendered above the title (e.g. the step progress). */
  header?: ReactNode;
  children?: ReactNode;
  /** Primary actions, kept at the bottom. */
  footer?: ReactNode;
  testID?: string;
}

/** Standard full-screen layout: safe area, keyboard avoidance, scrolling body, bottom actions. */
export function Screen({ title, subtitle, header, children, footer, testID }: ScreenProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bgBase }]} testID={testID}>
      <GlowBackdrop />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {header}
          <View style={styles.titles}>
            <AppText variant="title">{title}</AppText>
            {subtitle ? <AppText tone="secondary">{subtitle}</AppText> : null}
          </View>
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(2.5), paddingTop: space(3), gap: space(2.5), flexGrow: 1 },
  titles: { gap: space(1) },
  footer: { paddingHorizontal: space(2.5), paddingBottom: space(3), gap: space(1) },
});
