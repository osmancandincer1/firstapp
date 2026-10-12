// POST { action: list | pause | pause_end } → tables and Mola (APP.md §4.4).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { tablesAction } from '../_shared/services/tur.ts';

Deno.serve(handler(({ body, token }) => tablesAction(appDeps(), token, body)));
