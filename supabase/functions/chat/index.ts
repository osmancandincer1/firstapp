// POST { action: send | read | farewell | reopen | block } → chat at a table (APP.md §4.4).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { chatAction } from '../_shared/services/chat.ts';

Deno.serve(handler(({ body, token }) => chatAction(appDeps(), token, body)));
