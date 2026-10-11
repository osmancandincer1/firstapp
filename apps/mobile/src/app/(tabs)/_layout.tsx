import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components';
import { CardsIcon, ChatsCircleIcon, CoffeeIcon, UserIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { useForegroundActivity } from '@/features/tur/useForegroundActivity';

const TABS = [
  ['tur', CardsIcon],
  ['answers', ChatsCircleIcon],
  ['tables', CoffeeIcon],
  ['me', UserIcon],
] as const;

/** §8: four tabs — Tur · Cevaplar · Masalar · Ben. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  useForegroundActivity();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentPrimary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.bgRaised, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bgBase },
      }}
    >
      {TABS.map(([name, glyph]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(`tabs.${name}`),
            tabBarIcon: ({ color, size }) => (
              <Icon icon={glyph} color={String(color)} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
