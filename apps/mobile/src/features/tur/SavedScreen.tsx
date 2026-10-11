import { space } from '@nokuzo/design-tokens';
import { countdown, SAVED_MAX } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Card, Screen, Skeleton } from '@/components';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import type { ClientErrorCode } from '@/lib/api';
import { cardAction, type SavedCard } from './api';
import { PublicProfileView } from './PublicProfileView';
import { isOffline, SAVED_KEY, TUR_KEY, useInvalidate, useSaved } from './queries';
import { useNow } from './useNow';

/** §8.1 #45 Sonraya sakladıklarım: at most 9 people for 7 days; they are never told. */
export function SavedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const query = useSaved();

  const footer = <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />;

  if (query.isPending) {
    return (
      <Screen title={t('saved.title')} testID="saved-loading" footer={footer}>
        <View accessible accessibilityLabel={t('common.loading')} style={styles.gap}>
          <Skeleton height={88} />
        </View>
      </Screen>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Screen
        title={t('saved.title')}
        subtitle={isOffline(query.error) ? t('common.offline') : t('saved.error')}
        testID="saved-error"
        footer={<Button label={t('common.retry')} onPress={() => void query.refetch()} />}
      />
    );
  }

  return (
    <Screen
      title={t('saved.title')}
      subtitle={t('saved.subtitle', { count: query.data.length, max: SAVED_MAX })}
      testID="saved"
      footer={footer}
    >
      {query.isError && isOffline(query.error) ? (
        <Banner tone="warning" message={t('common.offline')} />
      ) : null}
      {query.data.length === 0 ? (
        <AppText tone="secondary" testID="saved-empty">
          {t('saved.empty')}
        </AppText>
      ) : (
        query.data.map((s) => <SavedRow key={s.candidateId} item={s} />)
      )}
    </Screen>
  );
}

function SavedRow({ item }: { item: SavedCard }) {
  const { t } = useTranslation();
  const router = useRouter();
  const now = useNow();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [open, setOpen] = useState(false);
  const left = countdown(now, new Date(item.expiresAt));

  const unsave = async () => {
    if (!item.cardId || busy) return;
    setBusy(true);
    const r = await cardAction(item.cardId, 'unsave');
    setBusy(false);
    if (!r.ok) setError(r.error);
    else await invalidate(SAVED_KEY, TUR_KEY);
  };

  return (
    <Card testID="saved-row">
      <AppText variant="heading">{item.profile?.name ?? t('inbox.someone')}</AppText>
      <AppText variant="caption" tone="secondary">
        {t('saved.left', { days: Math.floor(left.hours / 24), hours: left.hours % 24 })}
      </AppText>
      {item.profile ? (
        <Button
          variant="secondary"
          label={open ? t('saved.hideProfile') : t('saved.showProfile')}
          onPress={() => setOpen(!open)}
        />
      ) : null}
      {open && item.profile ? <PublicProfileView profile={item.profile} /> : null}
      <Button
        label={t('tur.answer')}
        onPress={() =>
          router.push({ pathname: '/answer', params: { candidateId: item.candidateId } })
        }
      />
      {item.cardId ? (
        <Button
          variant="ghost"
          label={t('tur.unsave')}
          onPress={() => void unsave()}
          disabled={busy}
        />
      ) : null}
      <ErrorNotice error={error} />
    </Card>
  );
}

const styles = StyleSheet.create({ gap: { gap: space(2) } });
