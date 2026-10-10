/** Outgoing email and SMS texts (TR + EN). Brand voice: short, warm, no urgency (§2). */
import { OTP_TTL_MINUTES } from '../../../packages/shared/src/index.ts';

export type Locale = 'tr' | 'en';

export function emailCode(locale: Locale, code: string) {
  return locale === 'en'
    ? {
        subject: 'Your Nokuzo sign-in code',
        text:
          `Your code: ${code}\n\nIt is valid for ${OTP_TTL_MINUTES} minutes. Never share it with anyone, ` +
          `including people who say they are from Nokuzo.\n\nIf you did not ask for this code, you can ignore this email.`,
      }
    : {
        subject: 'Nokuzo giriş kodun',
        text:
          `Kodun: ${code}\n\n${OTP_TTL_MINUTES} dakika geçerli. Kimseyle paylaşma; Nokuzo'dan olduğunu ` +
          `söyleyenlerle de.\n\nBu kodu sen istemediysen bu e-postayı yok sayabilirsin.`,
      };
}

/** Sent instead of a code to a banned address. Only the mailbox owner sees it (§7.5). */
export function emailBlocked(locale: Locale, support: string) {
  return locale === 'en'
    ? {
        subject: 'About your Nokuzo sign-in',
        text:
          `An account cannot be created with this email address. If you think this is a mistake, ` +
          `write to ${support} and we will look into it.`,
      }
    : {
        subject: 'Nokuzo girişin hakkında',
        text:
          `Bu e-posta adresiyle hesap oluşturulamıyor. Bunun bir hata olduğunu düşünüyorsan ` +
          `${support} adresine yaz, inceleyelim.`,
      };
}

export function smsCode(locale: Locale, code: string): string {
  return locale === 'en'
    ? `Nokuzo code: ${code}. Valid for ${OTP_TTL_MINUTES} min. Never share it.`
    : `Nokuzo kodun: ${code}. ${OTP_TTL_MINUTES} dk geçerli. Kimseyle paylaşma.`;
}

/** Sent instead of a code when the number cannot be used; only the line owner sees it. */
export function smsUnavailable(locale: Locale, support: string): string {
  return locale === 'en'
    ? `This number cannot be used for a Nokuzo account. Help: ${support}`
    : `Bu numara bir Nokuzo hesabı için kullanılamıyor. Yardım: ${support}`;
}
