// POST { phone, code, deviceId } → binds the number to the account (APP.md §6.1 step 4).
import { appDeps } from '../_shared/app.ts';
import { handler } from '../_shared/http.ts';
import { verifyPhoneOtp } from '../_shared/services/phone.ts';

Deno.serve(handler(({ body, token, ctx }) => verifyPhoneOtp(appDeps(), token, body, ctx)));
