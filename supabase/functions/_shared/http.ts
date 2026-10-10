/**
 * HTTP layer for Edge Functions: method check, JSON parsing, client IP,
 * bearer token, response shaping and a minimum response time.
 *
 * The minimum time hides how much work a request caused (e.g. "banned" vs
 * "new" address), so response timing does not leak account state (BAN-06).
 */
import type { RequestContext, Result } from './types.ts';

export interface HandlerInput {
  body: unknown;
  token: string | null;
  ctx: RequestContext;
  req: Request;
}

export interface ServeOptions {
  /** Pad every response to at least this many milliseconds. */
  minDurationMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Error reporter; must never receive request bodies (they hold emails and numbers). */
  report?: (message: string) => void;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown';
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1]!.trim() : null;
}

export function handler(
  fn: (input: HandlerInput) => Promise<Result<unknown>>,
  opts: ServeOptions = {},
): (req: Request) => Promise<Response> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const report = opts.report ?? ((m: string) => console.error(m));

  return async (req) => {
    const started = now();
    let response: Response;
    if (req.method !== 'POST') {
      response = json(405, { error: 'invalid_input' });
    } else {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        body = undefined;
      }
      if (body === undefined) {
        response = json(400, { error: 'invalid_input' });
      } else {
        try {
          const result = await fn({
            body,
            token: bearerToken(req),
            ctx: { ip: clientIp(req), now: new Date(started) },
            req,
          });
          response = result.ok
            ? json(result.status, result.body)
            : json(result.status, {
                error: result.error,
                ...(result.retryAt ? { retryAt: result.retryAt } : {}),
              });
        } catch (err) {
          report(`unhandled error: ${(err as Error).name}: ${(err as Error).message}`);
          response = json(500, { error: 'internal' });
        }
      }
    }
    const remaining = (opts.minDurationMs ?? 0) - (now() - started);
    if (remaining > 0) await sleep(remaining);
    return response;
  };
}
