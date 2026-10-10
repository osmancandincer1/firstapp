// POST { email, code, deviceId, platform } → session tokens (APP.md §6.1 step 3).
import { appDeps, SIGN_IN_MIN_DURATION_MS } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { verifyEmailOtp } from '../_shared/services/auth.ts';

Deno.serve(
  handler(({ body, ctx }) => verifyEmailOtp(appDeps(), body, ctx), {
    minDurationMs: SIGN_IN_MIN_DURATION_MS,
  }),
);
