// POST { phone, deviceId, locale } → sends an SMS code (APP.md §6.1 step 4).
import { appDeps, SIGN_IN_MIN_DURATION_MS } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { requestPhoneOtp } from '../_shared/services/phone.ts';

Deno.serve(
  handler(({ body, token, ctx }) => requestPhoneOtp(appDeps(), token, body, ctx), {
    minDurationMs: SIGN_IN_MIN_DURATION_MS,
  }),
);
