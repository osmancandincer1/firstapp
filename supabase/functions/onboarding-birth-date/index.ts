// POST { birthDate } → age gate (APP.md §6.1 step 5).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { setBirthDate } from '../_shared/services/onboarding.ts';

Deno.serve(handler(({ body, token, ctx }) => setBirthDate(appDeps(), token, body, ctx)));
