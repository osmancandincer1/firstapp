// POST {} → own profile as others see it + signed URLs of own media (APP.md §6.4).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { viewOwnProfile } from '../_shared/services/media.ts';

Deno.serve(handler(({ token }) => viewOwnProfile(appDeps(), token)));
