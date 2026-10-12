import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { TabBar } from '@/components';
import { ChatCircleIcon, CoffeeIcon, FireIcon, UserIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { useGlobalOutboxFlush } from '@/features/chat/useChat';
import { useForegroundActivity } from '@/features/tur/useForegroundActivity';

const TABS = [
  ['tur', FireIcon],
  ['answers', ChatCircleIcon],
  ['tables', CoffeeIcon],
  ['me', UserIcon],
] as const;

/** §8: four tabs — Tur · Cevaplar · Masalar · Ben — in a floating flame pill (D-065). */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  useForegroundActivity();
  useGlobalOutboxFlush();
  const items = TABS.map(([key, icon]) => ({ key, icon, label: t(`tabs.${key}`) }));
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bgBase } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          items={items}
          activeKey={state.routes[state.index]?.name ?? 'tur'}
          onSelect={(key) => navigation.navigate(key)}
        />
      )}
    >
      {TABS.map(([name]) => (
        <Tabs.Screen key={name} name={name} options={{ title: t(`tabs.${name}`) }} />
      ))}
    </Tabs>
  );
}
