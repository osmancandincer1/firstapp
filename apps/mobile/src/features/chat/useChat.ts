import type { ChatMessage } from '@nokuzo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth/session';
import { TABLES_KEY } from '@/features/tur/queries';
import { supabase } from '@/lib/supabase';
import { fetchMessages, fromRow } from './api';
import { flushTable, tablesWithPending, useOutbox } from './outbox';

export const MESSAGES_KEY = 'messages';
const TYPING_MS = 4000;
const RETRY_MS = 15_000;

/** Adds messages to the cached list once each, keeping it in time order. */
export function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useAddMessage(tableId: string) {
  const qc = useQueryClient();
  const userId = useSession((s) => s.userId);
  return useCallback(
    (m: ChatMessage) =>
      qc.setQueryData<ChatMessage[]>([MESSAGES_KEY, tableId, userId], (old) =>
        mergeMessages(old ?? [], [m]),
      ),
    [qc, tableId, userId],
  );
}

/**
 * A table's messages: loaded once, then kept live through Realtime (§13.5).
 * New rows and table changes (turn, farewell, cooling) arrive without polling;
 * the other side's "typing…" comes over a broadcast on the same channel.
 */
export function useChat(tableId: string, myProfileId: string | undefined) {
  const qc = useQueryClient();
  const userId = useSession((s) => s.userId);
  const add = useAddMessage(tableId);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const lastTypingSent = useRef(0);

  const query = useQuery({
    queryKey: [MESSAGES_KEY, tableId, userId],
    queryFn: () => fetchMessages(tableId),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!supabase || !userId) return;
    const ch = supabase
      .channel(`table:${tableId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `table_id=eq.${tableId}` },
        (payload) => {
          add(fromRow(payload.new as Parameters<typeof fromRow>[0]));
          setOtherTyping(false);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` },
        () => void qc.invalidateQueries({ queryKey: TABLES_KEY }),
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if ((payload as { from?: string }).from === myProfileId) return;
        setOtherTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_MS);
      })
      .subscribe();
    channel.current = ch;
    return () => {
      channel.current = null;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void supabase?.removeChannel(ch);
    };
  }, [tableId, userId, myProfileId, add, qc]);

  /** Tells the other side we are typing, at most every 2 seconds. */
  const typing = useCallback(() => {
    const now = Date.now();
    if (!channel.current || now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    void channel.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: myProfileId },
    });
  }, [myProfileId]);

  return { query, otherTyping, typing };
}

/** Sends a table's outbox now, on return to the app, and every 15 s while something waits. */
export function useOutboxFlush(tableId: string) {
  const add = useAddMessage(tableId);
  const qc = useQueryClient();
  const hasPending = useOutbox((s) =>
    s.items.some((x) => x.tableId === tableId && (x.state === 'sending' || x.error === 'network')),
  );
  const flush = useCallback(
    () =>
      flushTable(tableId, (m) => {
        add(m);
        void qc.invalidateQueries({ queryKey: TABLES_KEY });
      }),
    [tableId, add, qc],
  );

  useEffect(() => {
    if (!hasPending) return;
    void flush();
    const timer = setInterval(() => void flush(), RETRY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void flush());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [hasPending, flush]);

  return flush;
}

/**
 * Mounted with the tabs: messages queued in any chat go out when the app comes
 * back, even if their chat is not open (SOH-02).
 */
export function useGlobalOutboxFlush() {
  const qc = useQueryClient();
  useEffect(() => {
    const run = () => {
      for (const tableId of tablesWithPending()) {
        void flushTable(
          tableId,
          () => void qc.invalidateQueries({ queryKey: [MESSAGES_KEY, tableId] }),
        );
      }
    };
    // The outbox loads from disk asynchronously; send once it is there.
    const unhydrated = useOutbox.persist.hasHydrated()
      ? (run(), undefined)
      : useOutbox.persist.onFinishHydration(run);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => {
      unhydrated?.();
      sub.remove();
    };
  }, [qc]);
}
