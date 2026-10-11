// POST { action: view | saved | pass | save | unsave | less } → the Round (APP.md §4.1).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { turAction } from '../_shared/services/tur.ts';

Deno.serve(handler(({ body, token }) => turAction(appDeps(), token, body)));
