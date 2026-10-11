// POST { section, data } → updates one profile section (APP.md §6.4).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { updateProfile } from '../_shared/services/profile.ts';

Deno.serve(handler(({ body, token, ctx }) => updateProfile(appDeps(), token, body, ctx)));
