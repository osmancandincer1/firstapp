import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '@nokuzo/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ClientErrorCode } from '@/lib/api';
import { sendMessage } from './api';

/** A message written on this device that the server has not confirmed yet. */
export interface Pending {
  clientId: string;
  tableId: string;
  text: string;
  replyTo?: string;
  createdAt: string;
  state: 'sending' | 'failed';
  /** Why the last try failed; "network" is retried on its own. */
  error?: ClientErrorCode;
}

interface OutboxState {
  items: Pending[];
  add: (p: Omit<Pending, 'state'>) => void;
  patch: (clientId: string, change: Partial<Pending>) => void;
  remove: (clientId: string) => void;
}

/**
 * The optimistic outbox (§13.5): every message is stored on the device before
 * it is sent and stays until the server confirms it, so closing the app or
 * losing the connection never loses a message (SOH-01, SOH-02). The client id
 * makes a repeated send harmless on the server.
 */
export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      add: (p) => set((s) => ({ items: [...s.items, { ...p, state: 'sending' }] })),
      patch: (clientId, change) =>
        set((s) => ({
          items: s.items.map((x) => (x.clientId === clientId ? { ...x, ...change } : x)),
        })),
      remove: (clientId) => set((s) => ({ items: s.items.filter((x) => x.clientId !== clientId) })),
    }),
    {
      name: 'nokuzo-outbox',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

const running = new Set<string>();

/**
 * Sends a table's queued messages one by one, oldest first, so their order
 * never changes (SOH-01). Stops at the first network failure and leaves the
 * rest for the next try; other failures (closed table, refused link) are kept
 * on screen with their reason.
 */
export async function flushTable(
  tableId: string,
  onSent: (message: ChatMessage) => void,
): Promise<void> {
  if (running.has(tableId)) return;
  running.add(tableId);
  try {
    for (;;) {
      const next = useOutbox
        .getState()
        .items.filter(
          (x) => x.tableId === tableId && (x.state === 'sending' || x.error === 'network'),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) return;
      useOutbox.getState().patch(next.clientId, { state: 'sending', error: undefined });
      const r = await sendMessage(tableId, next.clientId, next.text, next.replyTo);
      if (r.ok) {
        useOutbox.getState().remove(next.clientId);
        onSent(r.data.message);
        continue;
      }
      useOutbox.getState().patch(next.clientId, { state: 'failed', error: r.error });
      if (r.error === 'network') return;
    }
  } finally {
    running.delete(tableId);
  }
}

/** Every table with something waiting to go out. */
export const tablesWithPending = () => [
  ...new Set(
    useOutbox
      .getState()
      .items.filter((x) => x.state === 'sending' || x.error === 'network')
      .map((x) => x.tableId),
  ),
];
