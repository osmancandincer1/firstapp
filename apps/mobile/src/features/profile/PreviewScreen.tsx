import { space, radius } from '@nokuzo/design-tokens';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, Icon, Screen, Skeleton } from '@/components';
import { CheckIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { useProfileView } from './queries';
import { useDetailText } from './useDetailText';

interface Preview {
  name?: string;
  age?: number;
  gender?: string;
  intent?: string;
  verified?: boolean;
  district?: string;
  city?: string;
  doorQuestion?: { tr: string; en: string };
  interests?: { tr: string; en: string }[];
  details?: Record<string, unknown>;
  photos?: { id: string; caption?: string }[];
}

/**
 * §6.4 "Başkası nasıl görüyor?": renders exactly the server's public
 * projection, so hidden fields can never appear here by mistake.
 */
export function PreviewScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const view = useProfileView();
  const p = (view.data?.preview ?? null) as Preview | null;
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const detailText = useDetailText();

  return (
    <Screen
      title={t('profile.preview.title')}
      testID="preview"
      footer={<Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />}
    >
      {view.isPending ? (
        <Skeleton height={320} />
      ) : !p ? (
        <AppText tone="secondary">{t('profile.preview.empty')}</AppText>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photos}
          >
            {(p.photos ?? []).map((ph, i) => {
              const url = view.data?.media[ph.id];
              return url ? (
                <View key={ph.id} style={styles.photoBox}>
                  <Image
                    source={{ uri: url }}
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
              ) : null;
            })}
          </ScrollView>
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
          </View>
          {p.doorQuestion ? (
            <Card>
              <AppText variant="label" tone="secondary">
                {t('profile.preview.door')}
              </AppText>
              <AppText variant="heading">{p.doorQuestion[lang]}</AppText>
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
            <Card testID="preview-details">
              {Object.entries(p.details).map(([k, v]) => (
                <AppText key={k}>
                  <AppText variant="label">{`${t(`profile.details.fields.${k}`)}: `}</AppText>
                  {detailText(k, v)}
                </AppText>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photos: { gap: space(1.5) },
  photoBox: { gap: space(0.5), width: 240 },
  photo: { width: 240, height: 300, borderRadius: radius.md },
  head: { gap: space(0.5) },
  verified: { flexDirection: 'row', alignItems: 'center', gap: space(0.5) },
});
