import { assert, assertEquals } from '@std/assert';
import { gameAction } from '../_shared/services/games.ts';
import type { TurDeps } from '../_shared/services/tur.ts';
import { FakeAuth, FakeDb, FakeStore, FakeTurDb, UUID } from './fakes.ts';

function deps() {
  const db = new FakeDb();
  db.state = { ...db.state!, status: 'active' };
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1');
  const tur = new FakeTurDb();
  const d: TurDeps = { db, tur, auth, store: new FakeStore() };
  return { d, tur };
}
const start = (kind: string, word?: string) => ({
  action: 'start',
  tableId: UUID(8),
  kind,
  ...(word ? { word } : {}),
});
const hangman = (over: Record<string, unknown> = {}) => ({
  game: {
    id: UUID(30),
    kind: 'hangman',
    status: 'active',
    turnOf: 'p-me',
    state: { setter: 'p-other', mask: '_____', guessed: [], wrong: 0 },
    version: 3,
  },
  secret: { word: 'kahve' },
  me: 'p-me',
  other: 'p-other',
  tableStatus: 'active',
  ...over,
});

Deno.test('game: starting keeps the secret on the server', async () => {
  const { d, tur } = deps();
  assertEquals((await gameAction(d, 'tok', start('word_hunt'))).status, 200);
  const input = tur.called('gameStart')[0]!.args[0] as Record<string, unknown>;
  assertEquals([input.kind, input.turnOf, input.state], ['word_hunt', 'p-me', { guesses: [] }]);
  assert(typeof (input.secret as { word: string }).word === 'string');

  assertEquals((await gameAction(d, 'tok', start('hangman', 'Kahve'))).status, 200);
  const h = tur.called('gameStart')[1]!.args[0] as Record<string, unknown>;
  assertEquals([h.turnOf, h.secret], ['p-other', { word: 'kahve' }]);
});

Deno.test('game: refusals at the start', async () => {
  const { d, tur } = deps();
  const short = await gameAction(d, 'tok', start('hangman', 'kar'));
  assert(!short.ok && short.status === 400);
  const rude = await gameAction(d, 'tok', start('hangman', 'orospu'));
  assert(!rude.ok && rude.error === 'text_blocked');
  tur.results.gameStart = { result: 'busy' };
  const busy = await gameAction(d, 'tok', start('word_hunt'));
  assert(!busy.ok && busy.error === 'game_busy');
  tur.results.gameStart = { result: 'not_active' };
  assertEquals((await gameAction(d, 'tok', start('word_hunt'))).status, 409);
  tur.results.gameStart = { result: 'not_found' };
  assertEquals((await gameAction(d, 'tok', start('word_hunt'))).status, 404);
  tur.results.gameContext = { me: 'p-me', other: 'p-other', status: 'cooled' };
  assertEquals((await gameAction(d, 'tok', start('word_hunt'))).status, 409);
  tur.results.gameContext = null;
  assertEquals((await gameAction(d, 'tok', start('word_hunt'))).status, 404);
  assertEquals(
    (await gameAction(d, 'tok', { action: 'start', tableId: UUID(8), kind: 'chess' })).status,
    400,
  );
});

Deno.test('game: a move is applied and saved with the version it was based on', async () => {
  const { d, tur } = deps();
  tur.game = hangman();
  const r = await gameAction(d, 'tok', { action: 'letter', gameId: UUID(30), letter: 'K' });
  assertEquals(r.status, 200);
  const saved = tur.called('gameSave')[0]!.args[0] as Record<string, unknown>;
  assertEquals(saved.version, 3);
  assertEquals((saved.state as { mask: string }).mask, 'k____');
  assertEquals(saved.secret, { word: 'kahve' });

  tur.results.gameSave = { result: 'conflict' };
  const late = await gameAction(d, 'tok', { action: 'letter', gameId: UUID(30), letter: 'a' });
  assert(!late.ok && late.error === 'game_conflict');
  tur.results.gameSave = { result: 'not_found' };
  assertEquals(
    (await gameAction(d, 'tok', { action: 'letter', gameId: UUID(30), letter: 'a' })).status,
    404,
  );
});

Deno.test('game: move refusals map to clear errors', async () => {
  const { d, tur } = deps();
  tur.game = hangman({ game: { ...hangman().game, turnOf: 'p-other' } });
  const turn = await gameAction(d, 'tok', { action: 'letter', gameId: UUID(30), letter: 'k' });
  assert(!turn.ok && turn.error === 'not_your_turn');
  tur.game = hangman({ game: { ...hangman().game, status: 'won' } });
  const over = await gameAction(d, 'tok', { action: 'letter', gameId: UUID(30), letter: 'k' });
  assert(!over.ok && over.error === 'game_over');
  tur.game = hangman();
  assertEquals(
    (await gameAction(d, 'tok', { action: 'guess', gameId: UUID(30), word: 'kalem' })).status,
    400,
  );
  tur.game = hangman({ tableStatus: 'closed' });
  assertEquals(
    (await gameAction(d, 'tok', { action: 'letter', gameId: UUID(30), letter: 'k' })).status,
    409,
  );
  tur.game = null;
  assertEquals((await gameAction(d, 'tok', { action: 'abandon', gameId: UUID(30) })).status, 404);
});

Deno.test('game: category answers are moderated before anyone sees them', async () => {
  const { d, tur } = deps();
  tur.game = {
    game: {
      id: UUID(30),
      kind: 'categories',
      status: 'active',
      turnOf: null,
      state: { letter: 'k', submitted: [] },
      version: 1,
    },
    secret: { answers: {} },
    me: 'p-me',
    other: 'p-other',
    tableStatus: 'active',
  };
  const rude = await gameAction(d, 'tok', {
    action: 'answers',
    gameId: UUID(30),
    answers: { name: 'instagram @kerem' },
  });
  assert(!rude.ok && rude.error === 'text_blocked');
  const fine = await gameAction(d, 'tok', {
    action: 'answers',
    gameId: UUID(30),
    answers: { name: 'Kerem' },
  });
  assertEquals(fine.status, 200);
  const saved = tur.called('gameSave')[0]!.args[0] as { state: unknown; secret: unknown };
  assertEquals(saved.state, { letter: 'k', submitted: ['p-me'] });
  assertEquals(saved.secret, { answers: { 'p-me': { name: 'Kerem' } } });
});
