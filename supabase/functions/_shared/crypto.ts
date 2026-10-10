/**
 * Identifier hashing (APP.md §7.5, §13.7, BAN-12). Every stored email, phone,
 * device, face or OAuth identifier is an HMAC-SHA256 with a server secret, so
 * a leaked table cannot be reversed with a dictionary of emails or numbers.
 */
import type { IdentifierType } from './types.ts';

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function key(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    keyCache.set(secret, k);
  }
  return k;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The type is part of the message so equal strings of different kinds never collide. */
export function identifierHash(
  secret: string,
  type: IdentifierType,
  value: string,
): Promise<string> {
  return hmacHex(secret, `id:${type}:${value}`);
}

/** Codes are bound to their target, so a code for one address is useless for another. */
export function otpCodeHash(
  secret: string,
  channel: 'email' | 'phone',
  targetHash: string,
  code: string,
) {
  return hmacHex(secret, `otp:${channel}:${targetHash}:${code}`);
}

/** IP addresses are only kept as rate-limit buckets and consent evidence, never in clear. */
export function ipHash(secret: string, ip: string): Promise<string> {
  return hmacHex(secret, `ip:${ip}`);
}
