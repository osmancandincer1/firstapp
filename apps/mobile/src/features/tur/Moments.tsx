import { flame, motion, radius, space } from '@nokuzo/design-tokens';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, Keyframe } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { AppText, Icon } from '@/components';
import { PaperPlaneTiltIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';

/** The door question in a softly flame-tinted card (answer and inbox screens). */
export function QuestionCard({ kicker, question }: { kicker: string; question: string }) {
  return (
    <LinearGradient
      colors={['rgba(255,138,42,0.24)', 'rgba(226,65,47,0.12)', 'rgba(255,255,255,0.03)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.question}
    >
      <AppText variant="caption" tone="accent" style={styles.kicker}>
        {kicker}
      </AppText>
      <AppText variant="title" style={styles.questionText}>
        {question}
      </AppText>
    </LinearGradient>
  );
}

const planeFlight = new Keyframe({
  0: {
    transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 1 }],
    opacity: 1,
  },
  60: { opacity: 1 },
  100: {
    transform: [{ translateX: 170 }, { translateY: -420 }, { rotate: '-18deg' }, { scale: 0.4 }],
    opacity: 0,
  },
}).duration(1400);

/** "Cevabın uçtu": the answer leaves as a paper plane; plain fade with reduce motion. */
export function PaperPlaneMoment({ children }: { children: ReactNode }) {
  const { reduceMotion } = useTheme();
  return (
    <View style={styles.moment}>
      {reduceMotion ? null : (
        <Animated.View entering={planeFlight} style={styles.plane}>
          <Icon icon={PaperPlaneTiltIcon} size={110} color={flame.start} />
        </Animated.View>
      )}
      <Animated.View
        entering={FadeIn.duration(reduceMotion ? motion.reducedCrossfade : 500).delay(
          reduceMotion ? 0 : 900,
        )}
        style={styles.momentText}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const CUP = 'M10 34h52v26a24 24 0 0 1-24 24h-4a24 24 0 0 1-24-24Z';
const HANDLE = 'M62 40h6a10 10 0 0 1 0 20h-6';

function Cup({ color, mirrored }: { color: string; mirrored?: boolean }) {
  return (
    <Svg width={88} height={96} viewBox="0 0 88 96" style={mirrored ? styles.mirror : undefined}>
      <Path d={CUP} fill={color} />
      <Path d={HANDLE} stroke={color} strokeWidth={6} fill="none" />
      <Path
        d="M26 8c0 8 6 8 6 16M40 8c0 8 6 8 6 16"
        stroke="rgba(255,244,236,0.6)"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const cupFromLeft = new Keyframe({
  0: { transform: [{ translateX: -70 }, { rotate: '-14deg' }] },
  55: { transform: [{ translateX: 6 }, { rotate: '6deg' }] },
  75: { transform: [{ translateX: 0 }, { rotate: '0deg' }] },
  100: { transform: [{ translateX: 0 }, { rotate: '0deg' }] },
}).duration(1100);
const cupFromRight = new Keyframe({
  0: { transform: [{ translateX: 70 }, { rotate: '14deg' }] },
  55: { transform: [{ translateX: -6 }, { rotate: '-6deg' }] },
  75: { transform: [{ translateX: 0 }, { rotate: '0deg' }] },
  100: { transform: [{ translateX: 0 }, { rotate: '0deg' }] },
}).duration(1100);

/** "Masa açıldı": two cups meet and clink (§8.1 #27); a fade with reduce motion. */
export function CupsMoment({ children }: { children: ReactNode }) {
  const { reduceMotion, colors } = useTheme();
  return (
    <View style={styles.moment}>
      <View
        style={styles.cups}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View entering={reduceMotion ? undefined : cupFromLeft}>
          <Cup color={flame.start} />
        </Animated.View>
        <Animated.View entering={reduceMotion ? undefined : cupFromRight}>
          <Cup color={colors.accentDeep} mirrored />
        </Animated.View>
      </View>
      <Animated.View
        entering={FadeIn.duration(reduceMotion ? motion.reducedCrossfade : 500).delay(
          reduceMotion ? 0 : 800,
        )}
        style={styles.momentText}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  question: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,170,120,0.24)',
    padding: space(2.75),
    gap: space(1.25),
  },
  kicker: { textTransform: 'uppercase', letterSpacing: 1 },
  questionText: { fontSize: 28, lineHeight: 32 },
  moment: { alignItems: 'center', gap: space(3), paddingVertical: space(4) },
  plane: { alignItems: 'center' },
  momentText: { alignSelf: 'stretch', gap: space(1.5), alignItems: 'center' },
  cups: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110 },
  mirror: { transform: [{ scaleX: -1 }] },
});
