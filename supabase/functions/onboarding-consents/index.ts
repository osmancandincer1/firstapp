// POST { consents: [{ type, version, granted }] } → records consents (APP.md §6.1 step 6).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { recordConsents } from '../_shared/services/onboarding.ts';

Deno.serve(handler(({ body, token, ctx }) => recordConsents(appDeps(), token, body, ctx)));
