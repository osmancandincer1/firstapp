/**
 * Tables and chat (APP.md §4.4, §7.3, §13.5; D-067). The rules that need the
 * clock or both sides live in SQL; this file holds the contracts and the text
 * patterns the chat function attaches to a message.
 */
import { z } from 'zod';

import { foldText } from './moderation.ts';

export const MESSAGE_MAX = 1000;
export const FAREWELL_NOTE_MAX = 140;
export const PAUSE_DAYS_MIN = 1;
export const PAUSE_DAYS_MAX = 7;
/** Hours of silence before "Sıra sende", the last call and cooling (flags tables.*_hours). */
export const TABLE_CLOCK = { nudgeHours: 24, warnHours: 60, coolHours: 72, reopenDays: 7 } as const;

/** Ready-made goodbyes (§4.4 Nazik Veda); the app localizes them, a short note is optional. */
export const FAREWELL_KEYS = [
  'not_a_match',
  'enjoyed_but_no',
  'met_someone',
  'not_ready',
  'take_care',
] as const;
export type FarewellKey = (typeof FAREWELL_KEYS)[number];

export const chatActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    tableId: z.uuid(),
    clientId: z.uuid(),
    text: z.string().trim().min(1).max(MESSAGE_MAX),
    replyTo: z.uuid().optional(),
  }),
  z.object({ action: z.literal('read'), tableId: z.uuid() }),
  z.object({
    action: z.literal('farewell'),
    tableId: z.uuid(),
    key: z.enum(FAREWELL_KEYS),
    note: z.string().trim().max(FAREWELL_NOTE_MAX).optional(),
  }),
  z.object({ action: z.literal('reopen'), tableId: z.uuid() }),
  z.object({ action: z.literal('block'), tableId: z.uuid() }),
]);
export type ChatAction = z.infer<typeof chatActionSchema>;

export interface ChatMessage {
  id: string;
  tableId: string;
  senderId: string;
  kind: 'text' | 'voice' | 'photo' | 'plan' | 'system';
  body: string | null;
  replyTo: string | null;
  flags: MessageFlags;
  clientId: string | null;
  createdAt: string;
}

export interface MessageFlags {
  link?: true;
  offPlatform?: true;
  money?: true;
}

const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|me|app|link|tr|ly|gg|co)\b/i;
const OFF_PLATFORM_WORDS = [
  'whatsapp',
  'watsap',
  'vatsap',
  'telegram',
  'instagram',
  'snapchat',
  'signal',
  'numarani',
  'numaram',
  'numarami',
];
const OFF_PLATFORM_SHORT = /(^|[^a-z])(wp|ig|insta|snap|tg|dm)([^a-z]|$)/;
const MONEY =
  /(iban|bitcoin|\bbtc\b|kripto|crypto|usdt|tether|binance|havale|\beft\b|western\s*union|papara|para\s*(gonder|yolla|lazim)|borc\s*(ver|lazim)|yatirim\s*firsati)/;

/**
 * What a chat message gets flagged with. Contact details are allowed in a
 * chat (people decide when to share them), but early nudges off the app get a
 * warning for the recipient, and money talk is marked for moderation (§7.3).
 */
export function messageFlags(raw: string): MessageFlags {
  const folded = foldText(raw);
  const squashed = folded.replace(/[^a-z]/g, '');
  const flags: MessageFlags = {};
  if (LINK.test(raw)) flags.link = true;
  const phone = raw.replace(/\D/g, '').length >= 10 && /(\d[\s().-]*){10,}/.test(raw);
  const handle = /(^|\s)@[a-z0-9_.]{3,}/i.test(raw);
  if (
    phone ||
    handle ||
    OFF_PLATFORM_WORDS.some((w) => squashed.includes(w)) ||
    OFF_PLATFORM_SHORT.test(folded)
  )
    flags.offPlatform = true;
  // foldText turns "$" into "s"; check the raw text for currency signs.
  // IBANs are checked on the raw text: folding turns digits into letters.
  const iban = /\bTR\s?\d{2}(\s?\d){10,}/i.test(raw);
  if (iban || MONEY.test(folded) || /[$€₿]\s*\d|\d\s*[$€₿]/.test(raw)) flags.money = true;
  return flags;
}
