import { flame, minTouchTarget, motion, radius, space } from '@nokuzo/design-tokens';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { AppText, Card, FlameGradient, Icon } from '@/components';
import { CheckIcon, XIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';

/**
 * "İki doğru, bir yalan" on a public profile (D-066): tap the sentence you
 * think is the lie, then all three are revealed. Only on this device; the
 * guess is not sent anywhere.
 */
export function TwoTruthsGame({ statements, lie }: { statements: string[]; lie: number }) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const [guess, setGuess] = useState<number | null>(null);
  const revealed = guess !== null;
  const reveal = reduceMotion ? FadeIn.duration(motion.reducedCrossfade) : ZoomIn.springify();

  return (
    <Card testID="two-truths-game">
      <AppText variant="caption" tone="accent" style={styles.kicker}>
        {t('games.twoTruths.title')}
      </AppText>
      <AppText tone="secondary">{t('games.twoTruths.guess')}</AppText>
      <View style={styles.list}>
        {statements.map((s, i) => {
          const isLie = i === lie;
          const picked = guess === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={
                revealed
                  ? `${s}. ${isLie ? t('games.twoTruths.lie') : t('games.twoTruths.truth')}`
                  : s
              }
              accessibilityState={{ disabled: revealed, selected: picked }}
              disabled={revealed}
              onPress={() => setGuess(i)}
              style={[
                styles.row,
                revealed && isLie
                  ? { borderColor: 'transparent' }
                  : {
                      borderColor: picked ? colors.danger : flame.chipBorder,
                      backgroundColor: flame.chip,
                    },
              ]}
            >
              {revealed && isLie ? <FlameGradient style={StyleSheet.absoluteFill} /> : null}
              <AppText style={styles.text} tone={revealed && isLie ? 'onAccent' : 'primary'}>
                {s}
              </AppText>
              {revealed ? (
                <Animated.View entering={reveal} style={styles.tag}>
                  <Icon
                    icon={isLie ? XIcon : CheckIcon}
                    size={18}
                    color={isLie ? colors.onAccent : colors.success}
                  />
                  <AppText variant="caption" tone={isLie ? 'onAccent' : 'success'}>
                    {isLie ? t('games.twoTruths.lie') : t('games.twoTruths.truth')}
                  </AppText>
                </Animated.View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {revealed ? (
        <Animated.View
          entering={FadeIn.duration(reduceMotion ? motion.reducedCrossfade : 400)}
          accessibilityLiveRegion="polite"
        >
          <AppText variant="label" tone={guess === lie ? 'accent' : 'secondary'}>
            {guess === lie ? t('games.twoTruths.right') : t('games.twoTruths.wrong')}
          </AppText>
        </Animated.View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { textTransform: 'uppercase', letterSpacing: 1 },
  list: { gap: space(1) },
  row: {
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    overflow: 'hidden',
  },
  text: { flex: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
