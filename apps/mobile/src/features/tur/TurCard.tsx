import { flame, motion, radius, space } from '@nokuzo/design-tokens';
import { LESS_LIKE_THIS_KEYS } from '@nokuzo/shared';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText, Button, FlameGradient, Icon, Sheet } from '@/components';
import {
  BookmarkSimpleIcon,
  ChatCircleIcon,
  SealCheckIcon,
  SparkleIcon,
  XIcon,
} from '@/components/icons';
import { useTheme } from '@/design/theme';
import { lessLikeThis, type PublicProfile, type TurCard as TurCardData } from './api';
import { useReasonText } from './turState';

const FLIP = { duration: 700, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };

/** Pill-shaped label over a photo or on the back of the card. */
export function Chip({ label, tone = 'glass' }: { label: string; tone?: 'glass' | 'flame' }) {
  return (
    <View style={[styles.chip, tone === 'flame' ? styles.chipFlame : styles.chipGlass]}>
      <AppText variant="caption" style={styles.chipText}>
        {label}
      </AppText>
    </View>
  );
}

/** The front: photos (tap left/right to move), and who this is over a soft dark fade. */
function PhotoFace({ profile, onWhy }: { profile: PublicProfile; onWhy: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const photos = profile.photos ?? [];
  const [photo, setPhoto] = useState(0);
  const current = photos[Math.min(photo, Math.max(0, photos.length - 1))];

  return (
    <View style={styles.face}>
      {current ? (
        <Image
          source={{ uri: current.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={250}
          accessibilityLabel={current.caption ?? t('profile.photos.slot', { index: photo + 1 })}
        />
      ) : (
        <FlameGradient style={StyleSheet.absoluteFill} />
      )}
      {photos.length > 1 ? (
        <>
          <View style={styles.photoBars} pointerEvents="none">
            {photos.map((p, i) => (
              <View key={p.id} style={[styles.photoBar, { opacity: i === photo ? 0.95 : 0.35 }]} />
            ))}
          </View>
          <View style={styles.tapZones}>
            <Pressable
              style={styles.flex}
              accessibilityRole="button"
              accessibilityLabel={t('tur.prevPhoto')}
              onPress={() => setPhoto(Math.max(0, photo - 1))}
            />
            <Pressable
              style={styles.flex}
              accessibilityRole="button"
              accessibilityLabel={t('tur.nextPhoto')}
              onPress={() => setPhoto(Math.min(photos.length - 1, photo + 1))}
            />
          </View>
        </>
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(14,9,7,0)', 'rgba(14,9,7,0.55)', 'rgba(14,9,7,0.94)']}
        locations={[0, 0.45, 1]}
        style={styles.fade}
      />
      <Pressable
        onPress={onWhy}
        accessibilityRole="button"
        accessibilityLabel={t('tur.why')}
        accessibilityHint={t('tur.whyHint')}
        style={styles.whyPill}
      >
        <Icon icon={SparkleIcon} size={16} color={colors.accentSecondary} />
        <AppText variant="caption" style={styles.whyText}>
          {t('tur.why')}
        </AppText>
      </Pressable>
      <View style={styles.who} pointerEvents="box-none">
        <View style={styles.nameRow}>
          <AppText variant="title" style={styles.name}>
            {profile.name}, {profile.age}
          </AppText>
          {profile.verified ? <Icon icon={SealCheckIcon} size={24} color={colors.warning} /> : null}
        </View>
        <View style={styles.chips}>
          {profile.mood ? (
            <Chip
              tone="flame"
              label={t('mood.this_week', { mood: t(`mood.options.${profile.mood}`) })}
            />
          ) : null}
          {(profile.district ?? profile.city) ? (
            <Chip label={(profile.district ?? profile.city)!} />
          ) : null}
          {profile.intent ? <Chip label={t(`profile.intent.intents.${profile.intent}`)} /> : null}
        </View>
      </View>
    </View>
  );
}

/** The back: the door question, "Neden bu kişi?" and "fewer like this". */
function WhyFace({ card, onBack }: { card: TurCardData; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const { reason, difference } = useReasonText();
  const [sheet, setSheet] = useState(false);
  const [done, setDone] = useState(false);
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const reasons = card.reasons.reasons ?? [];
  const lessKeys = (card.reasons.all ?? []).filter((k) =>
    (LESS_LIKE_THIS_KEYS as readonly string[]).includes(k),
  );
  const less = async (key: string) => {
    setSheet(false);
    const r = await lessLikeThis(key);
    if (r.ok) setDone(true);
  };

  return (
    <LinearGradient
      colors={['#2A160E', '#1A0F0B', '#120A07']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={[styles.face, styles.back]}
      testID="why"
    >
      {card.profile?.doorQuestion ? (
        <View style={styles.gapSm}>
          <AppText variant="caption" tone="accent" style={styles.kicker}>
            {t('tur.doorOf', { name: card.profile.name })}
          </AppText>
          <AppText variant="title" style={styles.question}>
            {card.profile.doorQuestion[lang]}
          </AppText>
        </View>
      ) : null}
      <View style={styles.rule} />
      <AppText variant="label">{t('tur.why')}</AppText>
      <View style={styles.gapSm}>
        {reasons.length ? (
          reasons.map((r) => (
            <View key={r.key} style={styles.reason}>
              <View style={styles.reasonDot} />
              <AppText style={styles.flex}>{reason(r)}</AppText>
            </View>
          ))
        ) : (
          <AppText tone="secondary">{t('tur.noReasons')}</AppText>
        )}
        {card.reasons.difference ? (
          <View style={styles.reason}>
            <View style={[styles.reasonDot, styles.reasonDotHollow]} />
            <AppText tone="secondary" style={styles.flex}>
              {difference(card.reasons.difference)}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.flex} />
      <AppText variant="caption" tone="secondary">
        {t('tur.howItWorks')}
      </AppText>
      {done ? (
        <AppText tone="success" accessibilityLiveRegion="polite">
          {t('tur.lessDone')}
        </AppText>
      ) : null}
      <View style={styles.backActions}>
        <View style={styles.flex}>
          <Button variant="secondary" label={t('tur.showProfile')} onPress={onBack} />
        </View>
        {!done && lessKeys.length ? (
          <View style={styles.flex}>
            <Button variant="ghost" label={t('tur.lessLikeThis')} onPress={() => setSheet(true)} />
          </View>
        ) : null}
      </View>
      <Sheet visible={sheet} title={t('tur.lessQuestion')} onClose={() => setSheet(false)}>
        {lessKeys.map((k) => (
          <Button
            key={k}
            variant="secondary"
            label={t(`tur.less.${k}`)}
            onPress={() => void less(k)}
          />
        ))}
      </Sheet>
    </LinearGradient>
  );
}

/**
 * The Round card: a photo face that flips in 3D to "Neden bu kişi?" (§4.6).
 * With reduce motion the faces cross-fade instead of turning.
 */
export function FlipCard({ card, height }: { card: TurCardData; height: number }) {
  const { t } = useTranslation();
  const { reduceMotion } = useTheme();
  const [back, setBack] = useState(false);
  const turn = useSharedValue(0);

  useEffect(() => {
    const to = back ? 1 : 0;
    turn.set(withTiming(to, reduceMotion ? { duration: motion.reducedCrossfade } : FLIP));
  }, [back, reduceMotion, turn]);

  const front = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 1 - turn.value }
      : { transform: [{ perspective: 1400 }, { rotateY: `${turn.value * 180}deg` }] },
  );
  const rear = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: turn.value }
      : { transform: [{ perspective: 1400 }, { rotateY: `${turn.value * 180 + 180}deg` }] },
  );

  return (
    <View style={[styles.cardBox, { height }]}>
      <Animated.View
        style={[styles.layer, front]}
        pointerEvents={back ? 'none' : 'auto'}
        importantForAccessibility={back ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={back}
      >
        {card.profile ? (
          <PhotoFace profile={card.profile} onWhy={() => setBack(true)} />
        ) : (
          <View style={[styles.face, styles.back]}>
            <AppText tone="secondary">{t('tur.unavailable')}</AppText>
          </View>
        )}
      </Animated.View>
      <Animated.View
        style={[styles.layer, rear]}
        pointerEvents={back ? 'auto' : 'none'}
        importantForAccessibility={back ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!back}
      >
        {back ? <WhyFace card={card} onBack={() => setBack(false)} /> : null}
      </Animated.View>
    </View>
  );
}

/** Pass · Answer · Save, floating over the bottom edge of the card. */
export function ActionPill({
  onPass,
  onAnswer,
  onSave,
  saved,
  busy,
}: {
  onPass: () => void;
  onAnswer: () => void;
  onSave: () => void;
  saved: boolean;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.pill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tur.pass')}
        disabled={busy}
        onPress={onPass}
        style={styles.round}
      >
        <Icon icon={XIcon} size={22} color={colors.textPrimary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tur.answer')}
        onPress={onAnswer}
        style={styles.roundBig}
      >
        <FlameGradient style={StyleSheet.absoluteFill} />
        <Icon icon={ChatCircleIcon} size={28} color={colors.textPrimary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saved ? t('tur.unsave') : t('tur.save')}
        accessibilityState={{ selected: saved }}
        disabled={busy}
        onPress={onSave}
        style={styles.round}
      >
        {saved ? <FlameGradient style={StyleSheet.absoluteFill} /> : null}
        <Icon icon={BookmarkSimpleIcon} size={22} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapSm: { gap: space(1) },
  cardBox: { marginHorizontal: space(2.5) },
  layer: { ...StyleSheet.absoluteFill, backfaceVisibility: 'hidden' },
  face: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#1C120D',
  },
  back: {
    padding: space(3),
    gap: space(1.5),
    borderWidth: 1,
    borderColor: 'rgba(255,170,120,0.18)',
  },
  photoBars: {
    position: 'absolute',
    top: space(1.75),
    left: space(2),
    right: space(2),
    flexDirection: 'row',
    gap: 4,
    zIndex: 2,
  },
  photoBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#FFF4EC' },
  tapZones: { ...StyleSheet.absoluteFill, flexDirection: 'row', zIndex: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  whyPill: {
    position: 'absolute',
    top: space(4),
    right: space(2),
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: space(1.75),
    borderRadius: 20,
    backgroundColor: 'rgba(14,9,7,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,190,150,0.25)',
  },
  whyText: { fontFamily: 'Manrope_600SemiBold', color: '#FFF4EC' },
  who: {
    position: 'absolute',
    left: space(2.75),
    right: space(2.75),
    bottom: space(7.5),
    gap: space(1.25),
    zIndex: 2,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  name: { fontSize: 34, lineHeight: 38 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1) },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chipGlass: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.12)' },
  chipFlame: { backgroundColor: 'rgba(255,122,26,0.30)', borderColor: 'rgba(255,170,120,0.35)' },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#FFF4EC' },
  kicker: { textTransform: 'uppercase', letterSpacing: 1 },
  question: { fontSize: 27, lineHeight: 31 },
  rule: { height: 1, backgroundColor: 'rgba(255,170,120,0.25)' },
  reason: { flexDirection: 'row', gap: space(1.25), alignItems: 'flex-start' },
  reasonDot: { marginTop: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: flame.start },
  reasonDotHollow: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#C9AFA3' },
  backActions: { flexDirection: 'row', gap: space(1), alignItems: 'center' },
  pill: {
    alignSelf: 'center',
    marginTop: -38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.75),
    padding: space(1),
    paddingHorizontal: space(1.25),
    borderRadius: 999,
    backgroundColor: flame.glass,
    borderWidth: 1,
    borderColor: flame.glassBorder,
    zIndex: 5,
  },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: flame.chip,
    borderWidth: 1,
    borderColor: flame.chipBorder,
  },
  roundBig: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
