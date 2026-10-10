import { space } from '@nokuzo/design-tokens';
import {
  CONSENT_TYPES,
  initialConsentState,
  REQUIRED_CONSENTS,
  type ConsentType,
} from '@nokuzo/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, Checkbox, Skeleton } from '@/components';
import { fetchLegalDocuments, submitConsents, type LegalDocument } from './api';
import { ErrorNotice } from './ErrorNotice';
import { OnboardingScreen } from './OnboardingScreen';
import { useAdvance } from './useAdvance';
import { useApiAction } from './useApiAction';

const HAS_HELP: ConsentType[] = ['biometric', 'special_category', 'cross_border_transfer'];

/** §6.1 step 6: each consent separately, nothing pre-checked, stored with its document version. */
export function ConsentsScreen() {
  const { t } = useTranslation();
  const advance = useAdvance();
  const [checked, setChecked] = useState(initialConsentState);
  const docs = useQuery({
    queryKey: ['legal-documents'],
    queryFn: async () => {
      const r = await fetchLegalDocuments();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const action = useApiAction(submitConsents, advance);

  const byType = new Map<ConsentType, LegalDocument>((docs.data ?? []).map((d) => [d.type, d]));
  const complete = CONSENT_TYPES.every((type) => byType.has(type));
  const ready = complete && REQUIRED_CONSENTS.every((type) => checked[type]);

  const submit = () =>
    void action.run(
      CONSENT_TYPES.map((type) => ({
        type,
        version: byType.get(type)!.version,
        granted: checked[type],
      })),
    );

  return (
    <OnboardingScreen
      step="consents"
      title={t('consents.title')}
      subtitle={t('consents.subtitle')}
      testID="consents"
      footer={
        <Button
          label={t('consents.submit')}
          onPress={submit}
          disabled={!ready}
          loading={action.pending}
        />
      }
    >
      {docs.isPending ? (
        <View accessible accessibilityLabel={t('common.loading')} style={styles.list}>
          {CONSENT_TYPES.map((type) => (
            <Skeleton key={type} height={44} />
          ))}
        </View>
      ) : docs.isError || !complete ? (
        <>
          <Banner
            tone="danger"
            message={docs.isError ? t('consents.loadError') : t('errors.service_unavailable')}
          />
          <Button
            variant="secondary"
            label={t('common.retry')}
            onPress={() => void docs.refetch()}
          />
        </>
      ) : (
        <View style={styles.list}>
          {CONSENT_TYPES.map((type) => {
            const doc = byType.get(type)!;
            const required = REQUIRED_CONSENTS.includes(type);
            return (
              <Checkbox
                key={type}
                testID={`consent-${type}`}
                label={t(`consents.items.${type}.label`)}
                checked={checked[type]}
                onChange={(value) => setChecked((c) => ({ ...c, [type]: value }))}
              >
                {HAS_HELP.includes(type) ? (
                  <AppText variant="caption" tone="secondary">
                    {t(`consents.items.${type}.help`)}
                  </AppText>
                ) : null}
                <AppText variant="caption" tone={required ? 'warning' : 'secondary'}>
                  {required ? t('common.required') : t('common.optional')}
                  {doc.is_draft ? ` · ${t('consents.draft')}` : ''}
                </AppText>
                {doc.url ? (
                  <Button
                    variant="ghost"
                    label={t('consents.read')}
                    onPress={() => void Linking.openURL(doc.url!)}
                  />
                ) : (
                  <AppText variant="caption" tone="secondary">
                    {t('consents.pending')}
                  </AppText>
                )}
              </Checkbox>
            );
          })}
        </View>
      )}
      <ErrorNotice error={action.error} />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space(2) },
});
