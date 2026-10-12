import type {
  AnswerSendResponse,
  Preferences,
  ReciprocateResponse,
  UploadTarget,
} from '@nokuzo/shared';

import { callFunction, type ApiResult } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type Localized = { tr: string; en: string };

/** A public profile as the server signs it: media come as short-lived URLs (PRO-05). */
export interface PublicProfile {
  name?: string;
  age?: number;
  gender?: string;
  intent?: string;
  tempo?: string;
  verified?: boolean;
  district?: string;
  city?: string;
  doorQuestion?: Localized;
  interests?: Localized[];
  details?: Record<string, unknown>;
  photos?: { id: string; caption?: string; url: string }[];
  voice?: { url: string; durationMs?: number; promptTr?: string; promptEn?: string };
  /** This week's mood tag (D-064). */
  mood?: string;
}

export interface Reason {
  key: string;
  value?: string;
  items?: Localized[];
}

export interface TurCard {
  cardId: string;
  candidateId: string;
  position: number;
  action: 'none' | 'answered' | 'passed' | 'saved';
  reasons: {
    reasons?: Reason[];
    all?: string[];
    difference?: { key: string; theirs: string; yours: string } | null;
  };
  profile: PublicProfile | null;
}

export interface Tur {
  batchId: string;
  turDate: string;
  kind: 'noon' | 'evening' | 'welcome';
  opensAt: string;
  poolSize: number | null;
  hint: { widerAge?: number; widerDistance?: number | null } | null;
  cards: TurCard[];
}

export interface SavedCard {
  candidateId: string;
  cardId: string | null;
  expiresAt: string;
  profile: PublicProfile | null;
}

export interface IncomingAnswer {
  answerId: string;
  createdAt: string;
  expiresAt: string;
  text: string | null;
  voiceUrl?: string;
  voiceMs: number | null;
  question: Localized | null;
  profile: PublicProfile | null;
}

export interface OutgoingAnswer {
  answerId: string;
  createdAt: string;
  text: string | null;
  voiceMs: number | null;
  question: Localized | null;
  status: 'waiting' | 'reciprocated' | 'dropped';
  profile: PublicProfile | null;
}

export interface TableItem {
  tableId: string;
  status: 'active' | 'waiting_slot';
  waitingExpiresAt: string | null;
  lastMessageAt: string | null;
  myTurn: boolean;
  profile: PublicProfile | null;
}

/** 'on_demand': a new Round whenever the last one is done (launch); 'scheduled': 12:00 and 21:00. */
export type TurMode = 'on_demand' | 'scheduled';
type TurResponse = { ok: true; tur: Tur | null; mode?: TurMode };
export const viewTur = () => callFunction<TurResponse>('tur', { action: 'view' });
/** Opens the next Round right away (D-063). */
export const nextTur = () => callFunction<TurResponse>('tur', { action: 'next' });
export const listSaved = () =>
  callFunction<{ ok: true; saved: SavedCard[] }>('tur', { action: 'saved' });
export const cardAction = (cardId: string, action: 'pass' | 'save' | 'unsave') =>
  callFunction<{ ok: true }>('tur', { action, cardId });
export const lessLikeThis = (reasonKey: string) =>
  callFunction<{ ok: true }>('tur', { action: 'less', reasonKey });

export const fetchInbox = () =>
  callFunction<{ ok: true; incoming: IncomingAnswer[]; outgoing: OutgoingAnswer[] }>('answer', {
    action: 'inbox',
  });
export const requestAnswerVoiceUpload = () =>
  callFunction<UploadTarget>('answer', { action: 'voice_upload_url' });
export const sendAnswer = (
  input: { candidateId: string; text: string } | { candidateId: string; voiceId: string },
): Promise<ApiResult<AnswerSendResponse>> => callFunction('answer', { action: 'send', ...input });
export const reciprocate = (answerId: string, message: string) =>
  callFunction<ReciprocateResponse>('answer', { action: 'reciprocate', answerId, message });
export const passAnswer = (answerId: string) =>
  callFunction<{ ok: true }>('answer', { action: 'pass', answerId });

export const listTables = () =>
  callFunction<{ ok: true; tables: TableItem[] }>('tables', { action: 'list' });

/** Own discovery preferences (my_preferences, RLS-scoped to the caller). */
export async function fetchPreferences(): Promise<Preferences | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_preferences');
  if (error) throw new Error(error.message);
  return (data as Preferences | null) ?? null;
}

/** How many people the given filters would bring (§6.6 live estimate, TUR-09). */
export async function poolEstimate(prefs: Preferences): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_pool_estimate', { p_prefs: prefs });
  if (error) return null;
  return data as number;
}

/** Marks the user active (feeds "active in the last 7 days", §5). Failures are ignored. */
export async function touchActivity(): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('touch_activity');
}
