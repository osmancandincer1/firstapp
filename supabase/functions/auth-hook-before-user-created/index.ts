// Supabase Auth hook: refuses banned or disposable emails for every new user (APP.md §7.5).
import { appDeps } from '../_shared/app.ts';
import { beforeUserCreated } from '../_shared/hook.ts';

Deno.serve((req) => {
  const d = appDeps();
  return beforeUserCreated(
    {
      hmacSecret: d.env.hmacSecret,
      hookSecret: d.env.authHookSecret,
      db: d.db,
      disposableDomains: d.disposableDomains,
    },
    req,
  );
});
