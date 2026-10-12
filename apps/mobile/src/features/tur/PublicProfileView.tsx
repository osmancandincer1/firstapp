import { radius, space } from '@nokuzo/design-tokens';
import { useAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon } from '@/components';
import { CheckIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { useDetailText } from '@/features/profile/useDetailText';
import type { PublicProfile } from './api';
import { TwoTruthsGame } from './TwoTruthsGame';

/** Plays a signed voice URL; mounted only when there is something to play. */
export function PlayVoice({ url, label }: { url: string; label: string }) {
  const player = useAudioPlayer(url);
  return (
    <Button
      variant="secondary"
      label={label}
      onPress={() => {
        player.seekTo(0);
        player.play();
      }}
    />
  );
}

/**
 * The full public profile (§8.1 #19): what the server projected and signed,
 * nothing more. No blur and no paywall (§4.2).
 */
export function PublicProfileView({
  profile: p,
  below = false,
}: {
  profile: PublicProfile;
  /** Under a Round card that already shows photos, name and the door question. */
  below?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const detailText = useDetailText(p.details?.hometown_city_id !== undefined);
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const photos = p.photos ?? [];

  return (
    <View style={styles.root}>
      {!below && photos.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photos}
        >
          {photos.map((ph, i) => (
            <View key={ph.id} style={styles.photoBox}>
              <Image
                source={{ uri: ph.url }}
                style={[styles.photo, { backgroundColor: colors.bgSunken }]}
                contentFit="cover"
                accessibilityLabel={ph.caption ?? t('profile.photos.slot', { index: i + 1 })}
              />
              {ph.caption ? (
                <AppText variant="caption" tone="secondary">
                  {ph.caption}
                </AppText>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {below ? null : (
        <View style={styles.head}>
          <AppText variant="title">{p.name}</AppText>
          <AppText tone="secondary">
            {t('profile.preview.ageCity', { age: p.age, place: p.district ?? p.city ?? '' })}
          </AppText>
          {p.verified ? (
            <View style={styles.verified}>
              <Icon icon={CheckIcon} size={16} color={colors.success} />
              <AppText variant="label" tone="success">
                {t('profile.preview.verified')}
              </AppText>
            </View>
          ) : null}
          {p.intent ? <AppText>{t(`profile.intent.intents.${p.intent}`)}</AppText> : null}
          {p.mood ? (
            <AppText tone="accent">
              {t('mood.this_week', { mood: t(`mood.options.${p.mood}`) })}
            </AppText>
          ) : null}
        </View>
      )}
      {!below && p.doorQuestion ? (
        <Card>
          <AppText variant="label" tone="secondary">
            {t('profile.preview.door')}
          </AppText>
          <AppText variant="heading">{p.doorQuestion[lang]}</AppText>
        </Card>
      ) : null}
      {p.twoTruths ? (
        <TwoTruthsGame statements={p.twoTruths.statements} lie={p.twoTruths.lie} />
      ) : null}
      {p.voice ? (
        <Card>
          <AppText variant="label" tone="secondary">
            {lang === 'en' ? p.voice.promptEn : p.voice.promptTr}
          </AppText>
          <PlayVoice url={p.voice.url} label={t('tur.playVoice')} />
        </Card>
      ) : null}
      {p.interests?.length ? (
        <Card>
          <AppText variant="label" tone="secondary">
            {t('profile.preview.interests')}
          </AppText>
          <AppText>{p.interests.map((x) => x[lang]).join(' · ')}</AppText>
        </Card>
      ) : null}
      {p.details && Object.keys(p.details).length ? (
        <Card testID="profile-details">
          {Object.entries(p.details).map(([k, v]) => (
            <AppText key={k}>
              <AppText variant="label">{`${t(`profile.details.fields.${k}`)}: `}</AppText>
              {detailText(k, v)}
            </AppText>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space(2) },
  photos: { gap: space(1.5) },
  photoBox: { gap: space(0.5), width: 260 },
  photo: { width: 260, height: 320, borderRadius: radius.md },
  head: { gap: space(0.5) },
  verified: { flexDirection: 'row', alignItems: 'center', gap: space(0.5) },
});
