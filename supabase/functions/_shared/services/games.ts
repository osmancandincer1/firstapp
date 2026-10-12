/**
 * Mini games at a table (D-064, D-068). The rules are the shared ones
 * (packages/shared/src/games.ts); this layer loads the game with its secret,
 * applies the move, moderates what the other player will read, and saves with
 * a version check so two moves at once cannot overwrite each other.
 */
import {
  applyMove,
  gameActionSchema,
  moderateText,
  startGame,
  type GameRecord,
} from '../../../../packages/shared/src/index.ts';
import type { Result } from '../types.ts';
import { blocked, fail, ok } from '../types.ts';
import { activeUser, type TurDeps } from './tur.ts';

type Json = Record<string, unknown>;

const MOVE_ERRORS = {
  not_your_turn: fail(409, 'not_your_turn'),
  invalid_move: fail(400, 'invalid_input'),
  game_over: fail(409, 'game_over'),
} as const;

/** Text the other player will read is held to the same rules as profile text (§7.2). */
function moderate(texts: (string | undefined)[]): Result<never> | null {
  for (const text of texts) {
    if (!text?.trim()) continue;
    const v = moderateText(text);
    if (v.action !== 'allow') return blocked('game', v.reason);
  }
  return null;
}

export async function gameAction(
  deps: TurDeps,
  token: string | null,
  raw: unknown,
): Promise<Result<Json>> {
  const a = await activeUser(deps, token);
  if ('error' in a) return a.error!;
  const parsed = gameActionSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const req = parsed.data;
  const userId = a.user.id;

  if (req.action === 'start') {
    const ctx = await deps.tur.gameContext(userId, req.tableId);
    if (!ctx) return fail(404, 'not_found');
    if (ctx.status !== 'active') return fail(409, 'table_closed');
    const refused = moderate([req.word]);
    if (refused) return refused;
    const started = startGame(req.kind, ctx.me, ctx.other, { word: req.word });
    if (!started.ok) {
      return {
        ok: false,
        status: 400,
        error: 'invalid_input',
        details: { reason: 'invalid_word' },
      };
    }
    const g = started.game;
    const r = await deps.tur.gameStart({
      userId,
      tableId: req.tableId,
      kind: g.kind,
      state: g.state,
      secret: g.secret,
      turnOf: g.turnOf,
    });
    if (r.result === 'ok') return ok({ ok: true, game: r.game });
    if (r.result === 'busy') return fail(409, 'game_busy');
    if (r.result === 'not_active') return fail(409, 'table_closed');
    return fail(404, 'not_found');
  }

  if (req.action === 'answers') {
    const refused = moderate(Object.values(req.answers));
    if (refused) return refused;
  }
  const loaded = await deps.tur.gameLoad(userId, req.gameId);
  if (!loaded) return fail(404, 'not_found');
  if (loaded.tableStatus !== 'active') return fail(409, 'table_closed');
  const record = {
    kind: loaded.game.kind,
    status: loaded.game.status,
    turnOf: loaded.game.turnOf,
    state: loaded.game.state,
    secret: loaded.secret,
  } as GameRecord;
  const moved = applyMove(record, loaded.me, loaded.other, req);
  if (!moved.ok) return MOVE_ERRORS[moved.error];
  const next = moved.game;
  const saved = await deps.tur.gameSave({
    userId,
    gameId: req.gameId,
    version: loaded.game.version,
    status: next.status,
    turnOf: next.turnOf,
    state: next.state,
    secret: next.secret,
  });
  if (saved.result === 'ok') return ok({ ok: true, game: saved.game });
  if (saved.result === 'conflict') return fail(409, 'game_conflict');
  return fail(404, 'not_found');
}
