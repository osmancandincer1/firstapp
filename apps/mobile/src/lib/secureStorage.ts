import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage for Supabase Auth (APP.md §13.1: tokens in the secure store).
 * SecureStore values should stay under ~2 KB, and a session is larger, so
 * values are split into chunks: `<key>.n` holds the count, `<key>.<i>` the parts.
 */
export const CHUNK_SIZE = 1800;

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** SecureStore keys allow only [A-Za-z0-9._-]. */
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export function chunkedStore(base: KeyValueStore): KeyValueStore {
  return {
    async getItem(key) {
      const k = safe(key);
      const count = Number(await base.getItem(`${k}.n`));
      if (!count) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await base.getItem(`${k}.${i}`);
        if (part === null) return null; // partial write: treat as signed out
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const k = safe(key);
      const previous = Number(await base.getItem(`${k}.n`)) || 0;
      const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < count; i++) {
        await base.setItem(`${k}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await base.setItem(`${k}.n`, String(count));
      for (let i = count; i < previous; i++) await base.removeItem(`${k}.${i}`);
    },
    async removeItem(key) {
      const k = safe(key);
      const count = Number(await base.getItem(`${k}.n`)) || 0;
      for (let i = 0; i < count; i++) await base.removeItem(`${k}.${i}`);
      await base.removeItem(`${k}.n`);
    },
  };
}

const secureStoreBase: KeyValueStore = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

/** Browser preview only (development); the mobile apps always use SecureStore. */
const webBase: KeyValueStore = {
  getItem: (k) => Promise.resolve(globalThis.localStorage?.getItem(k) ?? null),
  setItem: (k, v) => Promise.resolve(globalThis.localStorage?.setItem(k, v)),
  removeItem: (k) => Promise.resolve(globalThis.localStorage?.removeItem(k)),
};

export const secureStorage = chunkedStore(Platform.OS === 'web' ? webBase : secureStoreBase);
