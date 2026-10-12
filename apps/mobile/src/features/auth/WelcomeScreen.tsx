import { flame, motion, radius, space } from '@nokuzo/design-tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppText, Button, FlameGradient, GlowBackdrop, Icon, StepProgress } from '@/components';
import { ChatCircleIcon, CoffeeIcon, FireIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';

const CARDS = [FireIcon, ChatCircleIcon, CoffeeIcon] as const;

/** §6.1 step 1: three short cards (Tur, Kapı Sorusu, Masa); skippable. */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last = index === CARDS.length - 1;
  const goSignIn = () => router.push('/sign-in');
  const enter = reduceMotion
    ? FadeIn.duration(motion.reducedCrossfade)
    : FadeInRight.springify().damping(18);
  const exit = FadeOut.duration(reduceMotion ? motion.reducedCrossfade : motion.durationFast);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bgBase }]} testID="welcome">
      <GlowBackdrop placement="top-right" />
      <View style={styles.body}>
        <View style={styles.brand}>
          <FlameGradient style={styles.mark}>
            <Icon icon={FireIcon} size={22} color={colors.onAccent} />
          </FlameGradient>
          <AppText variant="heading">{t('app.name')}</AppText>
        </View>

        <View style={styles.hero}>
          <AppText variant="display">{t('app.tagline')}</AppText>
        </View>

        <Animated.View key={index} entering={enter} exiting={exit}>
          <LinearGradient
            colors={['rgba(255,138,42,0.26)', 'rgba(226,65,47,0.12)', 'rgba(255,255,255,0.03)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
            accessible
            accessibilityLabel={`${t('welcome.cardLabel', {
              index: index + 1,
              total: CARDS.length,
            })}. ${t(`welcome.cards.${index}.title`)}. ${t(`welcome.cards.${index}.body`)}`}
          >
            <FlameGradient style={styles.cardIcon}>
              <Icon icon={CARDS[index] ?? FireIcon} size={30} color={colors.onAccent} />
            </FlameGradient>
            <AppText variant="title">{t(`welcome.cards.${index}.title`)}</AppText>
            <AppText tone="secondary">{t(`welcome.cards.${index}.body`)}</AppText>
          </LinearGradient>
        </Animated.View>

        <View style={styles.row}>
          <StepProgress index={index + 1} total={CARDS.length} />
          {index > 0 ? (
            <Button variant="ghost" label={t('common.back')} onPress={() => setIndex(index - 1)} />
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          label={last ? t('welcome.start') : t('common.next')}
          onPress={last ? goSignIn : () => setIndex(index + 1)}
        />
        {last ? null : <Button variant="ghost" label={t('common.skip')} onPress={goSignIn} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, padding: space(3), gap: space(3), justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space(1.25) },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hero: { flex: 1, justifyContent: 'center' },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: flame.glassBorder,
    padding: space(3),
    gap: space(1.5),
  },
  cardIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: space(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
    minHeight: 48,
  },
  footer: { paddingHorizontal: space(3), paddingBottom: space(2), gap: space(1) },
});
