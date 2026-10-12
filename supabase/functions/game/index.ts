// POST { action: start | guess | letter | answers | abandon } → mini games at a table (D-064).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { gameAction } from '../_shared/services/games.ts';

Deno.serve(handler(({ body, token }) => gameAction(appDeps(), token, body)));
