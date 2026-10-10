import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { space } from '@nokuzo/design-tokens';

import { Button, Screen, Skeleton } from '@/components';
import { signOut, useSession } from '@/features/auth/session';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { resolveGate, STEP_ROUTES, useOnboardingState } from './gate';

/** App entry: sends the user to the screen that matches what the server knows (AUTH-06). */
export function GateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useSession((s) => s.status);
  const query = useOnboardingState();
  const gate = resolveGate({
    configured: Boolean(supabase),
    session,
    query: { isPending: query.isPending, isError: query.isError, data: query.data },
  });

  switch (gate.kind) {
    case 'signed_out':
      return <Redirect href="/welcome" />;
    case 'blocked':
      return <Redirect href="/blocked" />;
    case 'step':
      return <Redirect href={STEP_ROUTES[gate.step] as never} />;
    case 'not_configured':
      return (
        <Screen
          title={t('gate.notConfiguredTitle')}
          subtitle={t('gate.notConfiguredBody')}
          testID="gate-not-configured"
          footer={
            env.APP_ENV !== 'production' ? (
              <Button
                variant="secondary"
                label={t('done.foundation')}
                onPress={() => router.push('/dev/foundation')}
              />
            ) : null
          }
        />
      );
    case 'error':
      return (
        <Screen
          title={t('gate.error')}
          testID="gate-error"
          footer={
            <>
              <Button label={t('common.retry')} onPress={() => void query.refetch()} />
              <Button variant="ghost" label={t('common.signOut')} onPress={() => void signOut()} />
            </>
          }
        />
      );
    default:
      return (
        <Screen title={t('app.name')} testID="gate-loading">
          <View accessible accessibilityLabel={t('gate.loading')} style={styles.skeletons}>
            <Skeleton height={24} width="60%" />
            <Skeleton height={120} />
          </View>
        </Screen>
      );
  }
}

const styles = StyleSheet.create({ skeletons: { gap: space(2) } });
