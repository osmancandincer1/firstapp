import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type AppPlatform = 'ios' | 'android' | 'web';

export const platform: AppPlatform =
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

export const appVersion: string | undefined = Application.nativeApplicationVersion ?? undefined;

const FALLBACK_KEY = 'nokuzo.device_id';

/**
 * Install-level device identifier used for rate limits and ban signals
 * (§7.3, §7.5). The server only stores its HMAC. iOS: identifierForVendor,
 * Android: ANDROID_ID; otherwise a random id kept in the secure store.
 */
export async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === 'ios') {
      const id = await Application.getIosIdForVendorAsync();
      if (id) return `ios:${id}`;
    } else if (Platform.OS === 'android') {
      const id = Application.getAndroidId();
      if (id) return `android:${id}`;
    }
  } catch {
    // fall back below
  }
  const existing = await SecureStore.getItemAsync(FALLBACK_KEY).catch(() => null);
  if (existing) return existing;
  const created = `install:${Crypto.randomUUID()}`;
  await SecureStore.setItemAsync(FALLBACK_KEY, created).catch(() => undefined);
  return created;
}
