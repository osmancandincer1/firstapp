// POST { action: inbox | voice_upload_url | send | reciprocate | pass } → answers (APP.md §4.2).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { answerAction } from '../_shared/services/tur.ts';

Deno.serve(handler(({ body, token }) => answerAction(appDeps(), token, body)));
