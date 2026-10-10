import { act, renderHook } from '@testing-library/react-native';

import { resolveReduceMotion, resolveThemeName, useTheme } from './theme';

describe('resolveThemeName', () => {
  it('honours an explicit choice regardless of the OS', () => {
    expect(resolveThemeName('day', 'dark')).toBe('day');
    expect(resolveThemeName('night', 'light')).toBe('night');
  });

  it('follows the OS when set to system, defaulting to night', () => {
    expect(resolveThemeName('system', 'light')).toBe('day');
    expect(resolveThemeName('system', 'dark')).toBe('night');
    expect(resolveThemeName('system', null)).toBe('night');
    expect(resolveThemeName('system', undefined)).toBe('night');
  });
});

describe('resolveReduceMotion', () => {
  it('lets the user override the OS setting', () => {
    expect(resolveReduceMotion('on', false)).toBe(true);
    expect(resolveReduceMotion('off', true)).toBe(false);
    expect(resolveReduceMotion('system', true)).toBe(true);
    expect(resolveReduceMotion('system', false)).toBe(false);
  });
});

describe('useTheme', () => {
  it('throws outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useTheme())).rejects.toThrow(/inside <ThemeProvider>/);
  });
});

describe('useSystemReduceMotion', () => {
  it('reads the OS setting and follows live changes', async () => {
    const { AccessibilityInfo } = require('react-native') as typeof import('react-native');
    let listener: ((v: boolean) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (v: boolean) => void,
    ) => {
      listener = cb;
      return { remove };
    }) as unknown as typeof AccessibilityInfo.addEventListener);

    const { useSystemReduceMotion } =
      require('./useSystemReduceMotion') as typeof import('./useSystemReduceMotion');
    const { result, unmount } = await renderHook(() => useSystemReduceMotion());
    expect(result.current).toBe(true);
    await act(async () => listener?.(false));
    expect(result.current).toBe(false);
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
