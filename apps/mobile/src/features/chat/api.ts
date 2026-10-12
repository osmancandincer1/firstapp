import type { ChatMessage, FarewellKey } from '@nokuzo/shared';

import { callFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/** How many recent messages a chat opens with. */
export const PAGE_SIZE = 60;

interface MessageRow {
  id: string;
  table_id: string;
  sender_id: string;
  kind: ChatMessage['kind'];
  body: string | null;
  reply_to: string | null;
  flags: ChatMessage['flags'] | null;
  client_id: string | null;
  created_at: string;
}

/** Rows as Postgres and Realtime deliver them, in the shape the server function returns. */
export function fromRow(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    tableId: r.table_id,
    senderId: r.sender_id,
    kind: r.kind,
    body: r.body,
    replyTo: r.reply_to,
    flags: r.flags ?? {},
    clientId: r.client_id,
    createdAt: r.created_at,
  };
}

/** The latest messages of a table, oldest first. RLS lets only the two parties read them (SOH-03). */
export async function fetchMessages(tableId: string): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('id, table_id, sender_id, kind, body, reply_to, flags, client_id, created_at')
    .eq('table_id', tableId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MessageRow[]).map(fromRow).reverse();
}

export const sendMessage = (tableId: string, clientId: string, text: string, replyTo?: string) =>
  callFunction<{ ok: true; message: ChatMessage }>('chat', {
    action: 'send',
    tableId,
    clientId,
    text,
    ...(replyTo ? { replyTo } : {}),
  });
export const markRead = (tableId: string) =>
  callFunction<{ ok: true }>('chat', { action: 'read', tableId });
export const sayFarewell = (tableId: string, key: FarewellKey, note?: string) =>
  callFunction<{ ok: true }>('chat', {
    action: 'farewell',
    tableId,
    key,
    ...(note ? { note } : {}),
  });
export const reopenTable = (tableId: string) =>
  callFunction<{ ok: true; result: 'reopened' | 'waiting_other' | 'waiting_slot' }>('chat', {
    action: 'reopen',
    tableId,
  });
export const blockFromTable = (tableId: string) =>
  callFunction<{ ok: true }>('chat', { action: 'block', tableId });
export const startPause = (days: number) =>
  callFunction<{ ok: true; until: string }>('tables', { action: 'pause', days });
export const endPause = () => callFunction<{ ok: true }>('tables', { action: 'pause_end' });
