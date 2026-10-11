/**
 * Rule-based text and photo moderation (APP.md §7.2). Provider results (AWS
 * labels, OCR text, face estimates) are reduced to a decision here so the
 * rules are the same everywhere and fully testable. A moderation API can add
 * signals later through the same decision functions (§13.1 ModerationProvider).
 */

export type TextVerdict =
  | { action: 'allow' }
  | { action: 'block'; reason: TextBlockReason }
  | { action: 'review'; reason: 'commercial' };

export type TextBlockReason = 'contact_info' | 'link' | 'profanity';

/** Fold Turkish and look-alike characters so "İnstagram", "w h a t s a p p" and "1nsta" are caught. */
export function foldText(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's');
}

const squash = (s: string) => s.replace(/[^a-z]/g, '');

/** Unambiguous platform names, caught even when spaced out ("w h a t s a p p"). */
const PLATFORM_WORDS = [
  'whatsapp',
  'watsap',
  'vatsap',
  'telegram',
  'instagram',
  'snapchat',
  'tiktok',
  'onlyfans',
  'discord',
  'facebook',
];

/** Short or ambiguous names, matched only as whole words ("instant" is fine, "insta" is not). */
const PLATFORM_SHORT = /(^|[^a-z])(wp|ig|insta|snap|tg|dm|kik|twitter|wechat|viber)([^a-z]|$)/;

const PROFANITY_ROOTS = [
  'orospu',
  'siktir',
  'sikerim',
  'sikeyim',
  'yarrak',
  'pezevenk',
  'kahpe',
  'amina',
  'amk',
  'gavat',
  'fuck',
  'bitch',
  'whore',
  'cunt',
  'slut',
  'nigger',
  'faggot',
];

const COMMERCIAL =
  /(ucret|ucretli|fiyat|saatlik|gecelik|tl\b|₺|\beskort|\bescort|masaj\s*hizmet|para\s*karsiligi)/;

/**
 * Decides on profile text (name, bio, door question, captions, answers).
 * Contact details and links are blocked so conversations start in the app
 * (§7.3); commercial wording goes to review instead of being blocked outright.
 */
export function moderateText(raw: string): TextVerdict {
  const folded = foldText(raw);
  const digits = raw.replace(/\D/g, '');
  if (/\b[\w.+-]+\s*(@|\(at\)|\[at\])\s*[\w-]+\s*(\.|\(dot\))\s*[a-z]{2,}/i.test(raw)) {
    return { action: 'block', reason: 'contact_info' };
  }
  // Phone numbers have 10+ digits; years or ages side by side ("1990 2000") do not.
  if (digits.length >= 10 && /(\d[\s().-]*){10,}/.test(raw)) {
    return { action: 'block', reason: 'contact_info' };
  }
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|me|app|link|tr|ly|gg)\b/i.test(raw)) {
    return { action: 'block', reason: 'link' };
  }
  if (/(^|\s)@[a-z0-9_.]{3,}/i.test(raw)) return { action: 'block', reason: 'contact_info' };
  const squashed = squash(folded);
  if (PLATFORM_WORDS.some((w) => squashed.includes(w)) || PLATFORM_SHORT.test(folded)) {
    return { action: 'block', reason: 'contact_info' };
  }
  const words = folded.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => PROFANITY_ROOTS.some((root) => w.startsWith(root)))) {
    return { action: 'block', reason: 'profanity' };
  }
  if (COMMERCIAL.test(folded)) return { action: 'review', reason: 'commercial' };
  return { action: 'allow' };
}

// --- Photos ---------------------------------------------------------------------

export interface ModerationLabel {
  name: string;
  parent: string | null;
  confidence: number;
}

export interface FaceEstimate {
  ageLow: number;
  ageHigh: number;
}

export interface PhotoEvidence {
  labels: readonly ModerationLabel[];
  /** Text lines found in the image (OCR). */
  texts: readonly string[];
  faces: readonly FaceEstimate[];
  /** At least one face matches this user's liveness face. */
  selfMatch: boolean;
  /** The photo is (or will become) the main photo. */
  isMain: boolean;
}

export type PhotoRejectReason =
  'explicit' | 'violence' | 'drugs' | 'hate' | 'text_contact' | 'no_face' | 'not_you';

export type PhotoDecision =
  | { status: 'approved'; faceMatched: boolean }
  | { status: 'rejected'; reason: PhotoRejectReason }
  | { status: 'review'; reason: 'possible_minor' | 'text' };

export const LABEL_MIN_CONFIDENCE = 80;

/** Label categories that reject a photo, for both AWS taxonomy versions (v6 and v7). */
const REJECT_LABELS: Record<string, PhotoRejectReason> = {
  'explicit nudity': 'explicit',
  explicit: 'explicit',
  'explicit sexual activity': 'explicit',
  'non-explicit nudity of intimate parts and kissing': 'explicit',
  'sex toys': 'explicit',
  violence: 'violence',
  'visually disturbing': 'violence',
  'graphic violence': 'violence',
  weapons: 'violence',
  'weapon violence': 'violence',
  drugs: 'drugs',
  'drug products': 'drugs',
  'drug use': 'drugs',
  'hate symbols': 'hate',
};

/**
 * Photo rules (§6.4 Fotoğraf kuralları, §7.2, §7.7). Swimwear, alcohol and
 * tobacco are allowed. Any face that may belong to a minor sends the photo to
 * a human. The main photo must show the user's own, liveness-checked face
 * (VER-02); other photos may be faceless (hobbies, places) but never show
 * only someone else.
 */
export function decidePhoto(e: PhotoEvidence): PhotoDecision {
  for (const l of e.labels) {
    if (l.confidence < LABEL_MIN_CONFIDENCE) continue;
    const reason =
      REJECT_LABELS[l.name.toLowerCase()] ??
      (l.parent ? REJECT_LABELS[l.parent.toLowerCase()] : undefined);
    if (reason) return { status: 'rejected', reason };
  }
  const text = e.texts.join(' ');
  const textVerdict = text ? moderateText(text) : ({ action: 'allow' } as const);
  if (textVerdict.action === 'block') return { status: 'rejected', reason: 'text_contact' };
  if (e.faces.some((f) => f.ageLow < 18)) return { status: 'review', reason: 'possible_minor' };
  if (e.faces.length === 0) {
    return e.isMain
      ? { status: 'rejected', reason: 'no_face' }
      : { status: 'approved', faceMatched: false };
  }
  if (!e.selfMatch) return { status: 'rejected', reason: 'not_you' };
  if (text.replace(/\s/g, '').length > 30) return { status: 'review', reason: 'text' };
  return { status: 'approved', faceMatched: true };
}

export type PhotoStatus = 'pending' | 'approved' | 'rejected' | 'review';

export interface PhotoSummary {
  status: PhotoStatus;
  position: number;
  faceMatched: boolean;
}

/**
 * Photo step is done when at least 3 photos are approved and the main
 * (first approved) photo shows the user's own face (§6.1 step 9, VER-02).
 */
export function photosComplete(photos: readonly PhotoSummary[], min = 3): boolean {
  const approved = photos
    .filter((p) => p.status === 'approved')
    .sort((a, b) => a.position - b.position);
  return approved.length >= min && approved[0]!.faceMatched;
}
