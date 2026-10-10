// POST {} → starts a liveness session (APP.md §6.2).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { startLiveness } from '../_shared/services/liveness.ts';

Deno.serve(handler(({ token, ctx }) => startLiveness(appDeps(), token, ctx)));
