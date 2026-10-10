import { space } from '@nokuzo/design-tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, Screen, StepProgress } from '@/components';

const CARD_COUNT = 3;

/** §6.1 step 1: three short cards (Tur, Kapı Sorusu, Masa); skippable. */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last = index === CARD_COUNT - 1;
  const goSignIn = () => router.push('/sign-in');

  return (
    <Screen
      title={t('app.name')}
      subtitle={t('app.tagline')}
      testID="welcome"
      footer={
        <>
          <Button
            label={last ? t('welcome.start') : t('common.next')}
            onPress={last ? goSignIn : () => setIndex(index + 1)}
          />
          {last ? null : <Button variant="ghost" label={t('common.skip')} onPress={goSignIn} />}
        </>
      }
    >
      <Card
        accessible
        accessibilityLabel={`${t('welcome.cardLabel', { index: index + 1, total: CARD_COUNT })}. ${t(
          `welcome.cards.${index}.title`,
        )}. ${t(`welcome.cards.${index}.body`)}`}
      >
        <AppText variant="heading">{t(`welcome.cards.${index}.title`)}</AppText>
        <AppText tone="secondary">{t(`welcome.cards.${index}.body`)}</AppText>
      </Card>
      <View style={styles.row}>
        <StepProgress index={index + 1} total={CARD_COUNT} />
        {index > 0 ? (
          <Button variant="ghost" label={t('common.back')} onPress={() => setIndex(index - 1)} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
  },
});
