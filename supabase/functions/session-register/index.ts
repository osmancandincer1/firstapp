// POST { deviceId, platform } after any sign-in (incl. Apple/Google): device + ban checks.
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { registerSession } from '../_shared/services/auth.ts';

Deno.serve(handler(({ body, token }) => registerSession(appDeps(), token, body)));
