import { space } from '@nokuzo/design-tokens';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, FlameGradient, Icon, Screen } from '@/components';
import { ChatCircleIcon, CoffeeIcon, SealCheckIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';

const POINTS = [
  ['verified', SealCheckIcon],
  ['answers', ChatCircleIcon],
  ['tables', CoffeeIcon],
] as const;

/**
 * §6.1 step 2. Apple and Google sign-in appear once their client ids are
 * configured (NEEDS_SETUP, docs/SETUP.md); Apple is then mandatory on iOS
 * whenever Google is offered (App Store 4.8, §18.1).
 */
export function SignInScreen() {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const router = useRouter();
  return (
    <Screen
      title={t('signIn.title')}
      subtitle={t('signIn.subtitle')}
      testID="sign-in"
      footer={<Button label={t('signIn.email')} onPress={() => router.push('/email')} />}
    >
      <Card>
        {POINTS.map(([key, icon], i) => (
          <Animated.View
            key={key}
            entering={reduceMotion ? undefined : FadeInDown.delay(80 * i).springify()}
            style={styles.point}
          >
            <FlameGradient style={styles.icon}>
              <Icon icon={icon} size={20} color={colors.onAccent} />
            </FlameGradient>
            <AppText style={styles.text}>{t(`signIn.points.${key}`)}</AppText>
          </Animated.View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { flex: 1 },
});
