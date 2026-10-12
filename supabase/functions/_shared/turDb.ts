/** TurDb on the srv_* functions of the tur migration (service role). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TurDb } from './types.ts';

async function rpc<T>(c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.code ?? ''} ${error.message}`);
  return data as T;
}

export class SupabaseTurDb implements TurDb {
  constructor(private c: SupabaseClient) {}

  currentTur(userId: string) {
    return rpc<Record<string, unknown> | null>(this.c, 'srv_current_tur', { p_user_id: userId });
  }
  nextTur(userId: string) {
    return rpc<{ result: string; batchId?: string }>(this.c, 'srv_next_tur', { p_user_id: userId });
  }
  saved(userId: string) {
    return rpc<Record<string, unknown>[]>(this.c, 'srv_saved', { p_user_id: userId });
  }
  turAction(userId: string, cardId: string, action: 'pass' | 'save' | 'unsave') {
    return rpc<'ok' | 'not_found' | 'saved_limit'>(this.c, 'srv_tur_action', {
      p_user_id: userId,
      p_card_id: cardId,
      p_action: action,
    });
  }
  async lessLikeThis(userId: string, reasonKey: string) {
    await rpc(this.c, 'srv_less_like_this', { p_user_id: userId, p_reason_key: reasonKey });
  }
  recentAnswerTexts(userId: string) {
    return rpc<string[]>(this.c, 'srv_recent_answer_texts', { p_user_id: userId });
  }
  answerCreate(i: Parameters<TurDb['answerCreate']>[0]) {
    return rpc<{ result: string; answerId?: string }>(this.c, 'srv_answer_create', {
      p_user_id: i.userId,
      p_candidate: i.candidateId,
      p_text: i.text,
      p_voice_path: i.voicePath,
      p_voice_ms: i.voiceMs,
    });
  }
  answerRespond(
    userId: string,
    answerId: string,
    action: 'reciprocate' | 'pass',
    message: string | null,
  ) {
    return rpc<{ result: string; tableId?: string; tableStatus?: 'active' | 'waiting_slot' }>(
      this.c,
      'srv_answer_respond',
      { p_user_id: userId, p_answer_id: answerId, p_action: action, p_message: message },
    );
  }
  inbox(userId: string) {
    return rpc<{ incoming: Record<string, unknown>[]; outgoing: Record<string, unknown>[] }>(
      this.c,
      'srv_inbox',
      {
        p_user_id: userId,
      },
    );
  }
  myTables(userId: string) {
    return rpc<Record<string, unknown>[]>(this.c, 'srv_my_tables', { p_user_id: userId });
  }
}
