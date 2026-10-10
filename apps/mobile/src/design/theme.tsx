import { colors, type ColorTokens, type ThemeName } from '@nokuzo/design-tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  usePreferences,
  type ReduceMotionPreference,
  type ThemePreference,
} from '@/stores/preferences';
import { useSystemReduceMotion } from './useSystemReduceMotion';

interface Theme {
  name: ThemeName;
  colors: ColorTokens;
  reduceMotion: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

/** Maps the user's choice and the OS scheme to a theme. Night is the default (§12.1). */
export function resolveThemeName(
  preference: ThemePreference,
  systemScheme: string | null | undefined,
): ThemeName {
  if (preference !== 'system') return preference;
  return systemScheme === 'light' ? 'day' : 'night';
}

export function resolveReduceMotion(preference: ReduceMotionPreference, system: boolean): boolean {
  if (preference === 'on') return true;
  if (preference === 'off') return false;
  return system;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const systemReduceMotion = useSystemReduceMotion();
  const themePref = usePreferences((s) => s.theme);
  const motionPref = usePreferences((s) => s.reduceMotion);

  const value = useMemo<Theme>(() => {
    const name = resolveThemeName(themePref, systemScheme);
    return {
      name,
      colors: colors[name],
      reduceMotion: resolveReduceMotion(motionPref, systemReduceMotion),
    };
  }, [themePref, systemScheme, motionPref, systemReduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
