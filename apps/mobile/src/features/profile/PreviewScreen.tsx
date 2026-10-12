import { space } from '@nokuzo/design-tokens';
import { useRouter } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState, Screen, Skeleton } from '@/components';
import { EyeIcon } from '@/components/icons';
import type { PublicProfile } from '@/features/tur/api';
import { QuestionCard } from '@/features/tur/Moments';
import { PublicProfileView } from '@/features/tur/PublicProfileView';
import { PhotoFace } from '@/features/tur/TurCard';
import { useProfileView } from './queries';

type Preview = Omit<PublicProfile, 'photos' | 'voice'> & {
  photos?: { id: string; caption?: string }[];
};

/**
 * §6.4 "Başkası nasıl görüyor?": the server's public projection drawn with the
 * same card as the Round, so hidden fields can never appear here by mistake.
 */
export function PreviewScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const view = useProfileView();
  const raw = (view.data?.preview ?? null) as Preview | null;
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const media = view.data?.media ?? {};
  // Own media come as signed URLs keyed by id (PRO-05); the voice card is not previewed here.
  const p: PublicProfile | null = raw
    ? {
        ...raw,
        photos: (raw.photos ?? []).flatMap((ph) =>
          media[ph.id] ? [{ ...ph, url: media[ph.id]! }] : [],
        ),
      }
    : null;

  return (
    <Screen
      title={t('profile.preview.title')}
      testID="preview"
      footer={<Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />}
    >
      {view.isPending ? (
        <Skeleton height={320} />
      ) : !p ? (
        <EmptyState icon={EyeIcon} message={t('profile.preview.empty')} />
      ) : (
        <>
          <View style={[styles.card, { height: Math.round(height * 0.62) }]}>
            <PhotoFace profile={p} />
          </View>
          {p.doorQuestion ? (
            <QuestionCard
              kicker={t('tur.doorOf', { name: p.name ?? '' })}
              question={p.doorQuestion[lang]}
            />
          ) : null}
          <PublicProfileView profile={p} below />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { marginHorizontal: -space(0.5) } });
