// POST { action: list } → open and waiting tables (APP.md §4.4; chat arrives in Phase 4).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { tablesAction } from '../_shared/services/tur.ts';

Deno.serve(handler(({ body, token }) => tablesAction(appDeps(), token, body)));
