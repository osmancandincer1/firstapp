import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, Screen } from '@/components';
import { signOut } from '@/features/auth/session';
import { env } from '@/lib/env';
import { useMyProfile } from './queries';

const SECTIONS = [
  ['basics', '/profile/edit/basics'],
  ['photos', '/profile/edit/photos'],
  ['intent', '/profile/edit/intent'],
  ['door', '/profile/edit/door-question'],
  ['interests', '/profile/edit/interests'],
  ['location', '/profile/edit/location'],
  ['details', '/profile/details'],
  ['voice', '/profile/voice'],
] as const;

/**
 * Where an active account lands until the tabs arrive in Phase 3: preview and
 * edit every part of the profile (§8.1 "Ben" — partial).
 */
export function ProfileHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMyProfile();
  const pending = me.data?.pendingEdits.length ?? 0;

  return (
    <Screen
      title={t('profile.home.title')}
      subtitle={t('profile.home.active')}
      testID="profile-home"
      footer={
        <>
          {env.APP_ENV !== 'production' ? (
            <Button
              variant="ghost"
              label={t('done.foundation')}
              onPress={() => router.push('/dev/foundation')}
            />
          ) : null}
          <Button variant="ghost" label={t('common.signOut')} onPress={() => void signOut()} />
        </>
      }
    >
      {me.data?.name ? <AppText variant="heading">{me.data.name}</AppText> : null}
      {pending > 0 ? <Banner message={t('profile.home.pending', { count: pending })} /> : null}
      <Button label={t('profile.home.preview')} onPress={() => router.push('/profile/preview')} />
      {SECTIONS.map(([key, href]) => (
        <Button
          key={key}
          variant="secondary"
          label={t(`profile.home.sections.${key}`)}
          onPress={() => router.push(href as never)}
        />
      ))}
    </Screen>
  );
}
