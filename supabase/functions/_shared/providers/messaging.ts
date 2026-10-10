/**
 * Email, SMS and number-type lookup adapters (APP.md §13.1). Each real adapter
 * is a few HTTPS calls; `fetch` is injected so tests never reach the network.
 * The `log` adapters exist for APP_ENV=local only (enforced in env.ts).
 */
import type { LineType } from '../../../../packages/shared/src/index.ts';
import type { ServerEnv } from '../env.ts';
import type { EmailSender, LineLookup, SmsSender } from '../types.ts';

type Fetch = typeof fetch;

export class ProviderError extends Error {
  constructor(provider: string, status: number) {
    // Never include the response body: it may echo the address or number.
    super(`${provider} request failed with HTTP ${status}`);
  }
}

export class ResendEmail implements EmailSender {
  constructor(
    private apiKey: string,
    private from: string,
    private fetchFn: Fetch = fetch,
  ) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    const res = await this.fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, text }),
    });
    await res.body?.cancel();
    if (!res.ok) throw new ProviderError('resend', res.status);
  }
}

/** Local development: prints the message to the function log instead of sending it. */
export class LogEmail implements EmailSender {
  constructor(private log: (line: string) => void = console.log) {}
  send(to: string, subject: string, text: string): Promise<void> {
    this.log(`[DEV EMAIL] to=${to} subject="${subject}"\n${text}`);
    return Promise.resolve();
  }
}

export class TwilioSms implements SmsSender {
  constructor(
    private accountSid: string,
    private authToken: string,
    private senderId: string,
    private fetchFn: Fetch = fetch,
  ) {}

  async send(to: string, text: string): Promise<void> {
    const form = new URLSearchParams({ To: to, Body: text });
    // A Messaging Service id starts with "MG"; anything else is a sender number or name.
    form.set(this.senderId.startsWith('MG') ? 'MessagingServiceSid' : 'From', this.senderId);
    const res = await this.fetchFn(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${this.accountSid}:${this.authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    await res.body?.cancel();
    if (!res.ok) throw new ProviderError('twilio', res.status);
  }
}

export class LogSms implements SmsSender {
  constructor(private log: (line: string) => void = console.log) {}
  send(to: string, text: string): Promise<void> {
    this.log(`[DEV SMS] to=${to}\n${text}`);
    return Promise.resolve();
  }
}

/** Maps Twilio Lookup v2 line_type_intelligence.type to our policy categories. */
export function mapTwilioLineType(type: string | null | undefined): LineType {
  switch (type) {
    case 'mobile':
      return 'mobile';
    case 'landline':
      return 'landline';
    case 'fixedVoip':
    case 'nonFixedVoip':
      return 'voip';
    case null:
    case undefined:
    case 'unknown':
      return 'unknown';
    default:
      return 'other';
  }
}

export class TwilioLookup implements LineLookup {
  constructor(
    private accountSid: string,
    private authToken: string,
    private fetchFn: Fetch = fetch,
  ) {}

  async lineType(e164: string): Promise<LineType> {
    const res = await this.fetchFn(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`,
      { headers: { Authorization: `Basic ${btoa(`${this.accountSid}:${this.authToken}`)}` } },
    );
    if (!res.ok) {
      await res.body?.cancel();
      // An unavailable lookup is "unknown": production then refuses the number (fail closed).
      return 'unknown';
    }
    const json = (await res.json()) as { line_type_intelligence?: { type?: string | null } | null };
    return mapTwilioLineType(json.line_type_intelligence?.type);
  }
}

/** No lookup configured: every number is "unknown" (accepted only in local, see phoneLineDecision). */
export class NoLookup implements LineLookup {
  lineType(): Promise<LineType> {
    return Promise.resolve('unknown');
  }
}

export function emailSender(env: ServerEnv): EmailSender | null {
  if (!env.email) return null;
  return env.email.provider === 'resend'
    ? new ResendEmail(env.email.apiKey, env.email.from)
    : new LogEmail();
}

export function smsSender(env: ServerEnv): SmsSender | null {
  if (!env.sms) return null;
  return env.sms.provider === 'twilio'
    ? new TwilioSms(env.sms.accountSid, env.sms.authToken, env.sms.senderId)
    : new LogSms();
}

export function lineLookup(env: ServerEnv): LineLookup {
  return env.sms?.provider === 'twilio'
    ? new TwilioLookup(env.sms.accountSid, env.sms.authToken)
    : new NoLookup();
}
