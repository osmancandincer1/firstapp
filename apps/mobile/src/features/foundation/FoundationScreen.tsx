import { serviceStatus } from '@nokuzo/shared';
import { space } from '@nokuzo/design-tokens';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Banner,
  Button,
  Card,
  Input,
  SegmentedControl,
  Sheet,
  Skeleton,
} from '@/components';
import { useTheme } from '@/design/theme';
import { env } from '@/lib/env';
import {
  usePreferences,
  type Language,
  type ReduceMotionPreference,
  type ThemePreference,
} from '@/stores/preferences';

const DOOR_QUESTION_MAX = 90;
const DOOR_QUESTION_MIN = 10;

/**
 * Phase 0 screen: shows the design system and the theme / language /
 * reduce-motion switches. Replaced by the real tab navigation in later phases.
 */
export function FoundationScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { theme, language, reduceMotion, setTheme, setLanguage, setReduceMotion } =
    usePreferences();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const services = serviceStatus(env);

  const tooShort = answer.length > 0 && answer.trim().length < DOOR_QUESTION_MIN;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bgBase }]} testID="foundation">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="display">{t('app.name')}</AppText>
          <AppText tone="secondary">{t('app.tagline')}</AppText>
          <AppText variant="caption" tone="secondary">
            {t('foundation.subtitle')} · {t('foundation.environment', { env: env.APP_ENV })}
          </AppText>
        </View>

        <Section title={t('foundation.themeSection')}>
          <SegmentedControl<ThemePreference>
            label={t('foundation.themeSection')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: t('theme.system') },
              { value: 'night', label: t('theme.night') },
              { value: 'day', label: t('theme.day') },
            ]}
          />
        </Section>

        <Section title={t('foundation.languageSection')}>
          <SegmentedControl<Language>
            label={t('foundation.languageSection')}
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'tr', label: t('language.tr') },
              { value: 'en', label: t('language.en') },
            ]}
          />
        </Section>

        <Section title={t('foundation.motionSection')}>
          <SegmentedControl<ReduceMotionPreference>
            label={t('foundation.motionSection')}
            value={reduceMotion}
            onChange={setReduceMotion}
            options={[
              { value: 'system', label: t('motion.system') },
              { value: 'on', label: t('motion.on') },
              { value: 'off', label: t('motion.off') },
            ]}
          />
        </Section>

        <Section title={t('foundation.componentsSection')}>
          <Button label={t('demo.primaryButton')} onPress={() => setSheetOpen(true)} />
          <Button variant="secondary" label={t('demo.secondaryButton')} onPress={() => {}} />
          <Button variant="danger" label={t('demo.dangerButton')} onPress={() => {}} />
          <Button label={t('demo.loadingButton')} loading onPress={() => {}} />
          <Input
            label={t('demo.inputLabel')}
            placeholder={t('demo.inputPlaceholder')}
            help={t('demo.inputHelp')}
            error={tooShort ? t('demo.inputError') : undefined}
            value={answer}
            onChangeText={setAnswer}
            maxLength={DOOR_QUESTION_MAX}
            showCounter
          />
          <Card>
            <AppText variant="heading">{t('demo.cardTitle')}</AppText>
            <AppText tone="secondary">{t('demo.cardBody')}</AppText>
          </Card>
          <Banner tone="info" message={t('demo.bannerInfo')} />
          <Banner tone="warning" message={t('demo.bannerWarning')} />
          <Banner tone="danger" message={t('demo.bannerDanger')} />
          <Card accessible accessibilityLabel={t('demo.skeletonLabel')}>
            <Skeleton height={160} />
            <Skeleton width="60%" />
            <Skeleton width="40%" />
          </Card>
          <Button variant="ghost" label={t('demo.openSheet')} onPress={() => setSheetOpen(true)} />
        </Section>

        <Section title={t('foundation.servicesSection')}>
          <Card>
            {Object.entries(services).map(([name, status]) => (
              <View key={name} style={styles.row}>
                <AppText>{name}</AppText>
                <AppText variant="label" tone={status === 'ready' ? 'success' : 'warning'}>
                  {status}
                </AppText>
              </View>
            ))}
            <AppText variant="caption" tone="secondary">
              {t('foundation.servicesHint')}
            </AppText>
          </Card>
        </Section>
      </ScrollView>

      <Sheet visible={sheetOpen} title={t('demo.sheetTitle')} onClose={() => setSheetOpen(false)}>
        <AppText tone="secondary">{t('demo.sheetBody')}</AppText>
      </Sheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(3), gap: space(4) },
  header: { gap: space(1) },
  section: { gap: space(1.5) },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
