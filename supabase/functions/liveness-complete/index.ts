// POST { sessionId } → evaluates the session and applies the outcome (APP.md §6.2).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { completeLiveness } from '../_shared/services/liveness.ts';

Deno.serve(handler(({ body, token, ctx }) => completeLiveness(appDeps(), token, body, ctx)));
