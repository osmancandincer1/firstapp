// POST { action: upload_url | process | delete } → voice card (APP.md §6.4).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { voiceAction } from '../_shared/services/media.ts';

Deno.serve(handler(({ body, token }) => voiceAction(appDeps(), token, body)));
