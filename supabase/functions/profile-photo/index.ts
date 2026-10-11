// POST { action: upload_url | process | reorder | caption | delete } (APP.md §6.4, §7.2).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { photoAction } from '../_shared/services/media.ts';

Deno.serve(handler(({ body, token }) => photoAction(appDeps(), token, body)));
